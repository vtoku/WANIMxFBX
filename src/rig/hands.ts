import type { ConvertedClip } from "../convert/clip.ts";
import type { Quat, Vec3 } from "../wanim/parse.ts";
import { quatMul } from "../convert/quat.ts";
import { vsub, vadd, vnorm, vdot, vlen } from "../convert/ik.ts";
import { stackPoseThrough, captureBoneKeys, type RigLayer, type TimeRange } from "./rig.ts";
import type { FramePose } from "../convert/fk.ts";

// Hand pose controls: per-hand Curl / Spread / Thumb-curl "stamps". Each is a
// delta applied to the current pose's finger bones about anatomically-derived
// flexion axes, then keyed as a group on the active layer via captureBoneKeys —
// so the keys retime, copy, and mirror like any other layer keys.
//
// The flexion axes come from the bind offsets, the same trick the forearm
// twist uses (axis = direction to child). Warudo records VRM-normalized rests
// (identity local finger rotations), so every finger bone's rest frame equals
// the hand's frame; one hand-frame axis therefore serves the whole chain, and
// a per-bone LOCAL post-multiply bends each joint about its own hinge.

export type HandSide = "Left" | "Right";

/** Slider amounts. curl/thumbCurl in 0..1 (fist), spread in -1..1 (fan). */
export interface HandPoseAmounts {
  curl: number;
  spread: number;
  thumbCurl: number;
}

const FINGERS = ["Index", "Middle", "Ring", "Little"] as const;
const SEGMENTS = ["Proximal", "Intermediate", "Distal"] as const;

/** Full curl closes ~85° per joint; spread fans the outer fingers ~18°. */
const CURL_MAX = (85 * Math.PI) / 180;
const SPREAD_MAX = (18 * Math.PI) / 180;
const THUMB_MAX = (70 * Math.PI) / 180;

/** Splay factor per finger, centered on the middle so a fan is symmetric. */
const SPREAD_FACTOR: Record<string, number> = { Index: -1.5, Middle: -0.5, Ring: 0.5, Little: 1.5 };

const axisAngle = (axis: Vec3, angle: number): Quat => {
  const s = Math.sin(angle / 2);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
};

/** Every finger bone of a hand that exists in the clip. */
export function handFingerBones(names: string[], side: HandSide): string[] {
  const out: string[] = [];
  for (const finger of ["Thumb", ...FINGERS]) {
    for (const seg of SEGMENTS) {
      const b = `${side}${finger}${seg}`;
      if (names.includes(b)) out.push(b);
    }
  }
  return out;
}

export function hasHandFingers(names: string[], side: HandSide): boolean {
  return names.includes(`${side}IndexProximal`) || names.includes(`${side}MiddleProximal`);
}

interface HandFrame {
  across: Vec3; // index→little knuckle line (curl hinge)
  fanNormal: Vec3; // palm-plane normal (spread yaw axis)
  thumbHinge: Vec3;
  palmSign: number; // +1 if the palm lies on +fanNormal
}

/** Derive the hand's flexion frame from the finger bind offsets (hand-local). */
function handFrame(clip: ConvertedClip, side: HandSide): HandFrame | null {
  const off = (b: string): Vec3 | null => {
    const i = clip.names.indexOf(b);
    return i >= 0 ? clip.bindPos[i] : null;
  };
  const proximals = FINGERS.map((f) => off(`${side}${f}Proximal`)).filter((v): v is Vec3 => !!v);
  if (proximals.length < 2) return null;
  const index = off(`${side}IndexProximal`) ?? proximals[0];
  const little = off(`${side}LittleProximal`) ?? proximals[proximals.length - 1];
  const fwd = vnorm(proximals.reduce((a, b) => vadd(a, b), [0, 0, 0] as Vec3));
  if (vlen(fwd) < 1e-6) return null;
  const across = vnorm(vsub(little, index));
  const fanNormal = vnorm([
    fwd[1] * across[2] - fwd[2] * across[1],
    fwd[2] * across[0] - fwd[0] * across[2],
    fwd[0] * across[1] - fwd[1] * across[0],
  ]);
  // Thumb sits on the palm side; its offset component along fanNormal tells us
  // which way the palm faces (so curl bends fingers toward the palm).
  const thumb = off(`${side}ThumbProximal`);
  const palmSign = thumb ? (vdot(thumb, fanNormal) >= 0 ? 1 : -1) : side === "Left" ? 1 : -1;
  const thumbDir = thumb ? vnorm(thumb) : across;
  const thumbHinge = vnorm([
    thumbDir[1] * fanNormal[2] - thumbDir[2] * fanNormal[1],
    thumbDir[2] * fanNormal[0] - thumbDir[0] * fanNormal[2],
    thumbDir[0] * fanNormal[1] - thumbDir[1] * fanNormal[0],
  ]);
  return { across, fanNormal, thumbHinge, palmSign };
}

/**
 * Apply the hand-pose delta to `pose` in place over the finger bones of one
 * hand. Returns the bones actually touched. Rotation is a LOCAL post-multiply
 * about the shared hand-frame hinge — valid on every finger bone because the
 * rest chain is identity.
 */
export function applyHandPose(clip: ConvertedClip, pose: FramePose, side: HandSide, a: HandPoseAmounts): string[] {
  const frame = handFrame(clip, side);
  if (!frame) return [];
  const touched: string[] = [];
  const bend = (bone: string, q: Quat) => {
    const i = clip.names.indexOf(bone);
    if (i < 0) return;
    pose.quat[i] = quatMul(pose.quat[i], q);
    touched.push(bone);
  };
  // Curl: every finger joint flexes toward the palm (−palmSign about `across`).
  if (a.curl !== 0) {
    const q = axisAngle(frame.across, -frame.palmSign * a.curl * CURL_MAX);
    for (const finger of FINGERS) for (const seg of SEGMENTS) bend(`${side}${finger}${seg}`, q);
  }
  // Spread: proximal knuckles fan about the palm normal.
  if (a.spread !== 0) {
    for (const finger of FINGERS) {
      bend(`${side}${finger}Proximal`, axisAngle(frame.fanNormal, SPREAD_FACTOR[finger] * a.spread * SPREAD_MAX));
    }
  }
  // Thumb curl: thumb joints flex about the thumb hinge toward the palm.
  if (a.thumbCurl !== 0) {
    const q = axisAngle(frame.thumbHinge, frame.palmSign * a.thumbCurl * THUMB_MAX);
    for (const seg of SEGMENTS) bend(`${side}Thumb${seg}`, q);
  }
  return [...new Set(touched)];
}

/**
 * Stamp a hand-pose delta as layer keys at frame f: solve the current pose,
 * apply the finger delta, key only the touched finger bones. Returns the
 * dirtied window (null when nothing applied).
 */
export function keyHandPose(
  clip: ConvertedClip,
  layers: RigLayer[],
  layerIndex: number,
  side: HandSide,
  amounts: HandPoseAmounts,
  f: number,
  t: number,
): TimeRange | null {
  if (!layers[layerIndex]) return null;
  const pose = stackPoseThrough(clip, layers, layerIndex, f);
  const bones = applyHandPose(clip, pose, side, amounts);
  if (!bones.length) return null;
  return captureBoneKeys(clip, layers, layerIndex, bones, pose, f, t);
}
