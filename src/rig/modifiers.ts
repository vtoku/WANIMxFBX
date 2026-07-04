import type { ConvertedClip } from "../convert/clip.ts";
import type { Quat, Vec3 } from "../wanim/parse.ts";
import { quatMul, quatNormalize, quatRotate } from "../convert/quat.ts";
import { solveTwoBone, qconj, vadd, vsub, vnorm, vlen } from "../convert/ik.ts";
import { worldFromLocal, type FramePose } from "../convert/fk.ts";

// MotionBuilder-style modifiers: whole-clip parametric corrections, applied
// with sliders instead of keys. They run after cleaning/proportions and
// BEFORE the control-rig layers, so layer keys sit on top of the corrected
// motion.
//
// Knees/elbows in-out uses a closed form, not IK: rotating the rigid
// upper+lower limb about the line through its two ends (hip→ankle,
// shoulder→wrist) swings ONLY the middle joint — both ends stay exactly
// where they were, bone lengths untouched. Hips height re-solves the legs
// to the original ankle targets so the feet stay planted.

export interface Modifiers {
  /** Raise/lower the hips; feet stay planted (legs re-solve). cm. */
  hipsHeightCm: number;
  /** Swing knees apart (+) or together (−) without moving hips/feet. degrees. */
  kneesOutDeg: number;
  /** Swing elbows away from (+) or toward (−) the body. degrees. */
  elbowsOutDeg: number;
  /** Widen (+) or narrow (−) the stance; each foot shifts sideways. cm. */
  feetApartCm: number;
}

export const defaultModifiers = (): Modifiers => ({
  hipsHeightCm: 0,
  kneesOutDeg: 0,
  elbowsOutDeg: 0,
  feetApartCm: 0,
});

export const anyModifiers = (m: Modifiers): boolean =>
  m.hipsHeightCm !== 0 || m.kneesOutDeg !== 0 || m.elbowsOutDeg !== 0 || m.feetApartCm !== 0;

const DEG2RAD = Math.PI / 180;

/** Quaternion for a rotation of `angle` about unit axis. */
const axisAngle = (axis: Vec3, angle: number): Quat => {
  const s = Math.sin(angle / 2);
  return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(angle / 2)];
};

interface LimbIdx { parent: number; root: number; mid: number; end: number; }

function limb(names: string[], parents: number[], root: string, mid: string, end: string): LimbIdx | null {
  const r = names.indexOf(root), m = names.indexOf(mid), e = names.indexOf(end);
  if (r < 0 || m < 0 || e < 0) return null;
  return { parent: parents[r], root: r, mid: m, end: e };
}

/**
 * Swing the middle joint of a two-bone limb about its end-to-end axis by
 * `angle` (radians), leaving both ends and the end bone's world transform
 * exactly in place.
 */
function swingMidJoint(pose: FramePose, world: ReturnType<typeof worldFromLocal>, li: LimbIdx, angle: number): void {
  const axisV = vsub(world.pos[li.end], world.pos[li.root]);
  if (vlen(axisV) < 1e-6) return;
  const rot = axisAngle(vnorm(axisV), angle);
  const rootR2 = quatMul(rot, world.rot[li.root]);
  const midR2 = quatMul(rot, world.rot[li.mid]);
  pose.quat[li.root] = quatNormalize(quatMul(qconj(world.rot[li.parent]), rootR2));
  // The mid bone's LOCAL is unchanged by a rigid rotation of the pair, but
  // recompute for numeric consistency; the end keeps its old WORLD rotation.
  pose.quat[li.mid] = quatNormalize(quatMul(qconj(rootR2), midR2));
  pose.quat[li.end] = quatNormalize(quatMul(qconj(midR2), world.rot[li.end]));
}

/** Apply the modifiers to every frame of the clip (copies; original untouched). */
export function applyModifiers(clip: ConvertedClip, m: Modifiers): ConvertedClip {
  if (!anyModifiers(m)) return clip;
  const frames = clip.times.length;
  const names = clip.names;
  const parents = clip.parents;
  const localPos = clip.localPos.map((t) => t.map((p) => [...p] as Vec3));
  const localQuat = clip.localQuat.map((t) => t.map((q) => [...q] as Quat));

  // `side` = the limb's outward lateral direction (character faces +Z, left
  // at +x). `out` = the swing sign that takes the mid joint outward about the
  // downward end-to-end axis — opposite chirality, verified by rigCheck.
  const legs = [
    { li: limb(names, parents, "LeftUpperLeg", "LeftLowerLeg", "LeftFoot"), side: 1, out: -1 },
    { li: limb(names, parents, "RightUpperLeg", "RightLowerLeg", "RightFoot"), side: -1, out: 1 },
  ];
  const arms = [
    { li: limb(names, parents, "LeftUpperArm", "LeftLowerArm", "LeftHand"), out: -1 },
    { li: limb(names, parents, "RightUpperArm", "RightLowerArm", "RightHand"), out: 1 },
  ];
  const hips = 0;

  for (let f = 0; f < frames; f++) {
    const pose: FramePose = { pos: localPos.map((t) => t[f]), quat: localQuat.map((t) => t[f]) };

    // 1. Hips height + stance width: capture ankle targets, move the hips,
    //    re-solve each leg back onto its (possibly widened) target.
    if (m.hipsHeightCm !== 0 || m.feetApartCm !== 0) {
      const world = worldFromLocal(parents, pose);
      const targets = legs.map(({ li, side }) => {
        if (!li) return null;
        let target = world.pos[li.end];
        if (m.feetApartCm !== 0) {
          // Sideways = the character's local ±X, taken from the hips yaw and
          // flattened to the ground plane.
          const sideV = quatRotate(world.rot[hips], [side, 0, 0]);
          const flat = vnorm([sideV[0], 0, sideV[2]]);
          target = vadd(target, [flat[0] * m.feetApartCm / 100, 0, flat[2] * m.feetApartCm / 100]);
        }
        return target;
      });
      pose.pos[hips] = vadd(pose.pos[hips], [0, m.hipsHeightCm / 100, 0]);
      legs.forEach(({ li }, i) => {
        const target = targets[i];
        if (!li || !target) return;
        const w2 = worldFromLocal(parents, pose);
        const r = solveTwoBone(
          {
            parentRot: w2.rot[li.parent],
            rootP: w2.pos[li.root], midP: w2.pos[li.mid], endP: w2.pos[li.end],
            rootR: w2.rot[li.root], midR: w2.rot[li.mid], endR: w2.rot[li.end],
          },
          target,
          vnorm(quatRotate(w2.rot[li.root], [0, 0, 1])), // knees bend forward
        );
        if (r) {
          pose.quat[li.root] = r.rootLocal;
          pose.quat[li.mid] = r.midLocal;
          pose.quat[li.end] = r.endLocal;
        }
      });
    }

    // 2. Knees / elbows in-out: rigid swing about the end-to-end axis.
    if (m.kneesOutDeg !== 0) {
      const world = worldFromLocal(parents, pose);
      for (const { li, out } of legs) {
        if (li) swingMidJoint(pose, world, li, out * m.kneesOutDeg * DEG2RAD);
      }
    }
    if (m.elbowsOutDeg !== 0) {
      const world = worldFromLocal(parents, pose);
      for (const { li, out } of arms) {
        if (li) swingMidJoint(pose, world, li, out * m.elbowsOutDeg * DEG2RAD);
      }
    }

    for (let b = 0; b < names.length; b++) {
      localPos[b][f] = pose.pos[b];
      localQuat[b][f] = pose.quat[b];
    }
  }

  return { ...clip, localPos, localQuat, bindPos: localPos.map((t) => t[0]) };
}
