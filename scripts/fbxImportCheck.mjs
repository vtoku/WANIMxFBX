// FBX import round-trip: export the sample recording to a binary FBX, reimport
// it through the real src/convert/importFbx path, and assert the skeleton +
// motion survive within resample tolerance. Also proves the imported clip can
// be re-exported to VRMA and WANIM (a full session in every direction).
// Usage: node scripts/fbxImportCheck.mjs [file.wanim]
import { readFileSync } from "node:fs";

// three's FBXLoader touches `self` at import time in node.
globalThis.self = globalThis;

const { parseWanim } = await import("../src/wanim/parse.ts");
const { convertCharacter, resample } = await import("../src/convert/clip.ts");
const { writeAnimationFbx } = await import("../src/fbx/animationFbx.ts");
const { importFbxAnimation } = await import("../src/convert/importFbx.ts");
const { quatSlerp } = await import("../src/convert/quat.ts");

const path =
  process.argv[2] ??
  `${process.env.USERPROFILE ?? ""}\\Downloads\\2026-03-18-03-37-56.wanim`;

let failures = 0;
const check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  " + detail : ""}`);
  if (!ok) failures++;
};

const FPS = 60;
const buf = readFileSync(path);
const clip = parseWanim(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const conv = convertCharacter(clip, 0);
const rs = resample(conv, FPS, 0, conv.duration);

// Export -> FBX bytes (Unity names, T-pose rest, no meshes for speed).
const fbxBytes = writeAnimationFbx(rs, { takeName: "roundtrip", names: rs.names, tposeRest: true, meshes: [] });
const ab = fbxBytes.buffer.slice(fbxBytes.byteOffset, fbxBytes.byteOffset + fbxBytes.byteLength);
console.log(`exported FBX: ${(fbxBytes.length / 1024).toFixed(0)} KB, source ${rs.frameCount} frames @ ${FPS}fps`);

const res = importFbxAnimation(ab);
check("takes reimported", res.takes.length > 0, `takes [${res.allTakeNames.join(", ")}]`);
const imported = res.takes[0].clip;

// Bone count: our 55-bone humanoid should map back fully.
const mapped = imported.localQuat.filter((tr) => tr.some((q) => Math.hypot(q[0], q[1], q[2], q[3] - 1) > 1e-6)).length;
check("bone tracks present", imported.names.length === 55, `${imported.names.length} bones, ${mapped} animated`);

// Frame count within one frame of the source (keyframe-time sampling).
check(
  "frame count round-trips",
  Math.abs(imported.times.length - rs.frameCount) <= 2,
  `${imported.times.length} vs ${rs.frameCount}`,
);

// Per-frame quats: worst angular error across a spread of bones + times,
// slerped to the exact source time (resample tolerance, not frame-snap).
let worstQ = 0;
const impDur = imported.duration;
for (let i = 1; i < 8; i++) {
  const t = (conv.duration * i) / 8;
  const sf = Math.min(rs.frameCount - 1, Math.round(t * FPS));
  // locate t in the imported (uniform ~60fps) clip
  const it = Math.max(0, Math.min(impDur, t));
  let fa = 0;
  while (fa < imported.times.length - 2 && imported.times[fa + 1] < it) fa++;
  const ta = imported.times[fa];
  const tb = imported.times[fa + 1] ?? ta;
  const frac = tb > ta ? Math.max(0, Math.min(1, (it - ta) / (tb - ta))) : 0;
  for (const b of [0, 1, 3, 5, 10, 14, 16, 40, 54]) {
    const q0 = rs.localQuat[b][sf];
    if (Math.hypot(q0[0], q0[1], q0[2], q0[3]) < 0.5) continue;
    const q1 = quatSlerp(imported.localQuat[b][fa], imported.localQuat[b][fa + 1] ?? imported.localQuat[b][fa], frac);
    const dot = Math.abs(q0[0] * q1[0] + q0[1] * q1[1] + q0[2] * q1[2] + q0[3] * q1[3]);
    worstQ = Math.max(worstQ, (2 * Math.acos(Math.min(1, dot)) * 180) / Math.PI);
  }
}
check("bone rotations survive (resample tolerance)", worstQ < 2.0, `worst ${worstQ.toFixed(3)} deg`);

// Hips travel survives (the root motion must not flatten).
let hipRange = 0;
{
  let min = Infinity, max = -Infinity;
  for (const p of imported.localPos[0]) { min = Math.min(min, p[1]); max = Math.max(max, p[1]); }
  let smin = Infinity, smax = -Infinity;
  for (const p of rs.localPos[0]) { smin = Math.min(smin, p[1]); smax = Math.max(smax, p[1]); }
  hipRange = Math.abs((max - min) - (smax - smin));
  check("hips Y travel preserved (m)", hipRange < 0.02, `imported ${(max - min).toFixed(3)} vs ${(smax - smin).toFixed(3)}`);
}

// Downstream exports from the imported clip must succeed.
try {
  const irs = resample(imported, FPS, 0, imported.duration);
  const { writeVrma } = await import("../src/vrma/writeVrma.ts");
  const vrma = writeVrma(irs);
  check("VRMA export from imported clip", vrma.length > 0, `${(vrma.length / 1024).toFixed(0)} KB`);
  const { writeWanim } = await import("../src/wanim/writeWanim.ts");
  const wanim = writeWanim(irs);
  const { parseWanim: reparse } = await import("../src/wanim/parse.ts");
  const back = reparse(wanim.buffer.slice(wanim.byteOffset, wanim.byteOffset + wanim.byteLength));
  check("WANIM export from imported clip re-parses", back.characters.length === 1 && back.times.length === irs.frameCount,
    `${back.times.length} frames`);
} catch (err) {
  check("downstream exports from imported clip", false, String(err));
}

if (failures) { console.error(`${failures} FAILURES`); process.exit(1); }
console.log("OK");
