// A canonical humanoid T-pose skeleton (Unity HumanBodyBones order), used to
// SEED a body-only session that has no recording to supply bind offsets. The
// body-mesh retarget derives its OWN T-posed joints independently of this seed
// (extractBodyMeshes T-poses the source joint table by pure vector math), so
// this only needs to be a non-degenerate humanoid — the real body proportions
// replace it via retargetProportions. Meters, Y-up, facing +Z, left side at +X.

import { HUMAN_BODY_BONES, type Vec3 } from "../wanim/parse.ts";
import { BONE_PARENTS } from "./skeleton.ts";
import type { ConvertedClip } from "./clip.ts";

/** Approximate world joint positions for a ~1.7 m humanoid in T-pose. */
function worldJoints(): Record<string, Vec3> {
  const w: Record<string, Vec3> = {
    Hips: [0, 0.95, 0],
    Spine: [0, 1.05, 0],
    Chest: [0, 1.17, 0],
    UpperChest: [0, 1.29, 0],
    Neck: [0, 1.42, 0],
    Head: [0, 1.52, 0],
    LeftEye: [0.03, 1.58, 0.08],
    RightEye: [-0.03, 1.58, 0.08],
    Jaw: [0, 1.5, 0.05],
    LeftShoulder: [0.05, 1.38, 0],
    LeftUpperArm: [0.17, 1.38, 0],
    LeftLowerArm: [0.44, 1.38, 0],
    LeftHand: [0.68, 1.38, 0],
    RightShoulder: [-0.05, 1.38, 0],
    RightUpperArm: [-0.17, 1.38, 0],
    RightLowerArm: [-0.44, 1.38, 0],
    RightHand: [-0.68, 1.38, 0],
    LeftUpperLeg: [0.09, 0.9, 0],
    LeftLowerLeg: [0.09, 0.5, 0],
    LeftFoot: [0.09, 0.08, 0],
    LeftToes: [0.09, 0.02, 0.12],
    RightUpperLeg: [-0.09, 0.9, 0],
    RightLowerLeg: [-0.09, 0.5, 0],
    RightFoot: [-0.09, 0.08, 0],
    RightToes: [-0.09, 0.02, 0.12],
  };
  // Fingers: fan out from each hand along its arm direction (+X left, -X right).
  const fingers: Array<[string, number, number]> = [
    ["Thumb", 0.9, 0.03],
    ["Index", 1.0, 0.02],
    ["Middle", 1.0, 0.0],
    ["Ring", 1.0, -0.02],
    ["Little", 0.95, -0.04],
  ];
  for (const side of ["Left", "Right"] as const) {
    const s = side === "Left" ? 1 : -1;
    const hand = w[`${side}Hand`];
    for (const [name, reach, z] of fingers) {
      for (let seg = 0; seg < 3; seg++) {
        const key = `${side}${name}${["Proximal", "Intermediate", "Distal"][seg]}`;
        const x = hand[0] + s * (0.05 + seg * 0.03) * reach;
        const y = hand[1] - (name === "Thumb" ? 0.02 + seg * 0.01 : 0);
        w[key] = [x, y, z];
      }
    }
  }
  return w;
}

/**
 * A single-frame, T-pose ConvertedClip on the canonical skeleton. Identity
 * local rotations (== T-pose by the internal convention), one keyframe.
 */
export function defaultRestClip(): ConvertedClip {
  const world = worldJoints();
  const names = HUMAN_BODY_BONES.slice();
  const parents = BONE_PARENTS.slice();
  const bindPos: Vec3[] = names.map((n, i) => {
    const wp = world[n] ?? [0, 0, 0];
    const p = parents[i];
    if (p < 0) return [wp[0], wp[1], wp[2]];
    const pw = world[names[p]] ?? [0, 0, 0];
    return [wp[0] - pw[0], wp[1] - pw[1], wp[2] - pw[2]];
  });
  const localPos = bindPos.map((p) => [[p[0], p[1], p[2]] as Vec3]);
  const localQuat = names.map(() => [[0, 0, 0, 1] as [number, number, number, number]]);
  return {
    times: [0],
    duration: 0,
    names,
    parents,
    localPos,
    localQuat,
    bindPos,
    face: null,
  };
}
