// Ground-truth world rotations at fixed times, straight from the quaternions
// (the same data the FBX captures), for comparison with MoBu's evaluation.
import { readFileSync } from "node:fs";
const { parseWanim, HUMAN_BODY_BONES } = await import("../src/wanim/parse.ts");
const { convertCharacter, resample } = await import("../src/convert/clip.ts");
const { quatMul } = await import("../src/convert/quat.ts");

const buf = readFileSync("C:\\Users\\VTOKU\\Downloads\\All-The-Things-2-2026-05-24-18-55-10.wanim");
const clip = parseWanim(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const r = resample(convertCharacter(clip, 0), 30);

function worldQuat(frame, boneIdx) {
  // accumulate from root down: q_world = q_root ∘ ... ∘ q_bone
  const chain = [];
  for (let i = boneIdx; i >= 0; i = r.parents[i]) chain.unshift(i);
  let q = [0, 0, 0, 1];
  for (const i of chain) q = quatMul(q, r.localQuat[i][frame]);
  return q;
}

function quatToMatrixRow(q) {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  // row-major 3x3
  return [
    1 - (yy + zz), xy - wz, xz + wy,
    xy + wz, 1 - (xx + zz), yz - wx,
    xz - wy, yz + wx, 1 - (xx + yy),
  ];
}

for (const seconds of [0, 3]) {
  const frame = Math.min(r.frameCount - 1, Math.round(seconds * r.fps));
  for (const name of ["Head", "RightHand", "LeftHand", "Hips"]) {
    const i = HUMAN_BODY_BONES.indexOf(name);
    const m = quatToMatrixRow(worldQuat(frame, i));
    console.log(`${name} t=${seconds.toFixed(1)} ${m.map((v) => v.toFixed(5)).join(" ")}`);
  }
}
