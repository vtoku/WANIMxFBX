import type { Quat, Vec3 } from "../wanim/parse.ts";
import { quatMul, quatRotate } from "./quat.ts";

/** Per-bone LOCAL transforms at a single frame. */
export interface FramePose {
  pos: Vec3[];
  quat: Quat[];
}

export interface WorldPose {
  pos: Vec3[];
  rot: Quat[];
}

const IDENTITY: Quat = [0, 0, 0, 1];

/**
 * Degenerate (near-zero-norm) quats — bones the avatar doesn't have, like a
 * missing UpperChest or Jaw — must read as identity. three.js's matrix
 * compose already treats them that way; quatMul would instead propagate the
 * zeros down the chain and freeze every descendant at bind pose.
 */
const safeQuat = (q: Quat): Quat =>
  q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3] < 0.25 ? IDENTITY : q;

/**
 * FK a single-frame local pose to world space. Parents are resolved
 * recursively — the Unity bone array is NOT topologically sorted
 * (UpperChest is index 54 but parents Neck/shoulders at 9/11).
 */
export function worldFromLocal(parents: number[], pose: FramePose): WorldPose {
  const n = parents.length;
  const pos = new Array<Vec3>(n);
  const rot = new Array<Quat>(n);
  const done = new Array<boolean>(n).fill(false);
  const resolve = (i: number): void => {
    if (done[i]) return;
    const p = parents[i];
    if (p < 0) {
      pos[i] = pose.pos[i];
      rot[i] = safeQuat(pose.quat[i]);
    } else {
      resolve(p);
      const r = quatRotate(rot[p], pose.pos[i]);
      pos[i] = [pos[p][0] + r[0], pos[p][1] + r[1], pos[p][2] + r[2]];
      rot[i] = quatMul(rot[p], safeQuat(pose.quat[i]));
    }
    done[i] = true;
  };
  for (let i = 0; i < n; i++) resolve(i);
  return { pos, rot };
}
