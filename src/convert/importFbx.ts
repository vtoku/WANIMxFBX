// FBX animation import: parse a .fbx with three's FBXLoader and convert its
// takes into the app's ConvertedClip so everything downstream (preview, trim,
// cleaning, rig, all exports) works unchanged. This is the inverse of the FBX
// writer for a file WE exported, and also handles Mixamo / MoBu-cleaned files.
//
// Convention notes (load-bearing):
//  - FBXLoader returns LOCAL-space bone tracks — the same space as
//    ConvertedClip.localQuat. NO Unity left-hand -> right-hand mirror is applied
//    here: our writer already put the motion in the app's (+Z-facing, X-mirrored)
//    space, so reading it straight back lands in the same space. Facing is
//    verified by the round-trip check, not assumed.
//  - Identity local rotation == T-pose is the internal convention. The bone's
//    rest LOCAL transform becomes the bind offset (localPos frame 0); the
//    animated LOCAL rotation becomes localQuat directly (FBXLoader has already
//    composed pre/post-rotation and the FBX RotationOrder into the quaternion).
//  - Units: FBX is centimeters (our writer sets UnitScaleFactor=1, Y-up cm), so
//    positions are scaled cm -> m here.

import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { HUMAN_BODY_BONES, type Vec3, type Quat } from "../wanim/parse.ts";
import { BONE_PARENTS } from "./skeleton.ts";
import { resolveUnityName } from "./boneResolve.ts";
import type { ConvertedClip, FaceTracks } from "./clip.ts";

const CM_TO_M = 0.01;

export interface FbxTake {
  name: string;
  clip: ConvertedClip;
  frames: number;
  duration: number;
}

export interface FbxImportResult {
  /** Every non-trivial (non-TPose) take, longest first. */
  takes: FbxTake[];
  /** Take names in file order, for a disambiguation select. */
  allTakeNames: string[];
}

/** A take that is just a one-key bind/T-pose stance carries no motion. */
function isTPoseTake(clip: THREE.AnimationClip): boolean {
  if (/t[-_ ]?pose|bind[-_ ]?pose/i.test(clip.name)) return true;
  return clip.duration < 1e-4;
}

/** Sign-continuous a quaternion track so slerp/euler don't see 360-degree pops. */
function ensureContinuity(track: Quat[]): void {
  for (let i = 1; i < track.length; i++) {
    const a = track[i - 1];
    const b = track[i];
    if (a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0) {
      track[i] = [-b[0], -b[1], -b[2], -b[3]];
    }
  }
}

/** Unique, sorted sample times (seconds) spanning every track in the take. */
function sampleTimes(clip: THREE.AnimationClip): number[] {
  const set = new Set<number>();
  for (const tr of clip.tracks) for (const t of tr.times) set.add(Math.round(t * 1e6) / 1e6);
  const times = [...set].sort((a, b) => a - b);
  if (times.length < 2) {
    // Degenerate (single key) — synthesize a 2-frame grid so downstream code
    // that assumes >=2 frames stays happy.
    return [0, Math.max(clip.duration, 1 / 60)];
  }
  return times;
}

/** Collect every bone in the scene keyed by node name. */
function collectBones(root: THREE.Object3D): Map<string, THREE.Bone> {
  const out = new Map<string, THREE.Bone>();
  root.traverse((o) => {
    const b = o as THREE.Bone;
    if (b.isBone && !out.has(b.name)) out.set(b.name, b);
  });
  return out;
}

/** Meshes carrying blendshape (morph) targets, for face-track extraction. */
function collectMorphMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.morphTargetDictionary && m.morphTargetInfluences?.length) out.push(m);
  });
  return out;
}

/**
 * Map our 55 HumanBodyBones indices to source bones. Uses the VRM-agnostic
 * name resolver families (our Unity/MoBu exports map 1:1; Mixamo/Rigify too).
 */
function mapOurBones(bones: Map<string, THREE.Bone>): (THREE.Bone | null)[] {
  const unityToIndex = new Map<string, number>();
  HUMAN_BODY_BONES.forEach((n, i) => unityToIndex.set(n, i));
  const out: (THREE.Bone | null)[] = HUMAN_BODY_BONES.map(() => null);
  for (const bone of bones.values()) {
    const unity = resolveUnityName(bone.name);
    if (!unity) continue;
    const idx = unityToIndex.get(unity);
    if (idx === undefined || out[idx]) continue; // first match wins
    out[idx] = bone;
  }
  return out;
}

interface MorphChannel { mesh: THREE.Mesh; index: number; name: string; }

/** First mesh/index owning each distinct morph name (union across meshes). */
function collectMorphChannels(meshes: THREE.Mesh[]): MorphChannel[] {
  const seen = new Set<string>();
  const out: MorphChannel[] = [];
  for (const mesh of meshes) {
    const dict = mesh.morphTargetDictionary!;
    for (const name of Object.keys(dict)) {
      if (seen.has(name)) continue;
      seen.add(name);
      out.push({ mesh, index: dict[name], name });
    }
  }
  return out;
}

/** Build one ConvertedClip from a single FBX take. */
function buildTake(
  root: THREE.Object3D,
  animClip: THREE.AnimationClip,
  ourBones: (THREE.Bone | null)[],
  morphs: MorphChannel[],
): ConvertedClip {
  const times = sampleTimes(animClip);
  const frames = times.length;
  const boneCount = HUMAN_BODY_BONES.length;
  const localPos: Vec3[][] = Array.from({ length: boneCount }, () => new Array<Vec3>(frames));
  const localQuat: Quat[][] = Array.from({ length: boneCount }, () => new Array<Quat>(frames));
  const faceTracks: Float32Array[] = morphs.map(() => new Float32Array(frames));

  const mixer = new THREE.AnimationMixer(root);
  const action = mixer.clipAction(animClip);
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();

  const t0 = times[0];
  for (let f = 0; f < frames; f++) {
    mixer.setTime(times[f] - t0);
    for (let b = 0; b < boneCount; b++) {
      const node = ourBones[b];
      if (node) {
        const p = node.position;
        const q = node.quaternion;
        localPos[b][f] = [p.x * CM_TO_M, p.y * CM_TO_M, p.z * CM_TO_M];
        localQuat[b][f] = [q.x, q.y, q.z, q.w];
      } else {
        localPos[b][f] = [0, 0, 0];
        localQuat[b][f] = [0, 0, 0, 1];
      }
    }
    for (let n = 0; n < morphs.length; n++) {
      faceTracks[n][f] = morphs[n].mesh.morphTargetInfluences![morphs[n].index] ?? 0;
    }
  }
  action.stop();
  mixer.uncacheClip(animClip);

  for (let b = 0; b < boneCount; b++) ensureContinuity(localQuat[b]);

  // Rebase times to start at 0 (recordings/exports may not).
  const rebased = times.map((t) => t - t0);
  const face: FaceTracks | null = morphs.length
    ? { names: morphs.map((m) => m.name), tracks: faceTracks }
    : null;

  return {
    times: rebased,
    duration: rebased[frames - 1] - rebased[0],
    names: HUMAN_BODY_BONES.slice(),
    parents: BONE_PARENTS.slice(),
    localPos,
    localQuat,
    bindPos: localPos.map((track) => track[0]),
    face,
  };
}

/**
 * Parse FBX bytes and convert every non-TPose take into a ConvertedClip.
 * Throws when the file has no mappable humanoid skeleton or no motion take.
 */
export function importFbxAnimation(buffer: ArrayBuffer): FbxImportResult {
  const loader = new FBXLoader();
  const group = loader.parse(buffer, "");
  const bones = collectBones(group);
  if (bones.size === 0) throw new Error("FBX has no skeleton (no bones found).");
  const ourBones = mapOurBones(bones);
  const mappedCount = ourBones.filter(Boolean).length;
  if (mappedCount < 6) {
    throw new Error(`FBX bone names did not map to a humanoid skeleton (only ${mappedCount} bones matched).`);
  }

  const morphs = collectMorphChannels(collectMorphMeshes(group));
  const anims = (group.animations ?? []) as THREE.AnimationClip[];
  if (anims.length === 0) throw new Error("FBX has no animation takes.");

  const allTakeNames = anims.map((a) => a.name);
  const takes: FbxTake[] = [];
  for (const anim of anims) {
    if (isTPoseTake(anim)) continue;
    const clip = buildTake(group, anim, ourBones, morphs);
    takes.push({ name: anim.name, clip, frames: clip.times.length, duration: clip.duration });
  }
  if (takes.length === 0) {
    // Every take was a TPose/trivial — fall back to the longest one so the
    // file still opens instead of erroring.
    const longest = anims.reduce((a, b) => (b.duration > a.duration ? b : a));
    const clip = buildTake(group, longest, ourBones, morphs);
    takes.push({ name: longest.name, clip, frames: clip.times.length, duration: clip.duration });
  }
  takes.sort((a, b) => b.duration - a.duration);
  return { takes, allTakeNames };
}
