// Generate the bundled template-scene animation: a 12 s looping idle with a
// wave, authored procedurally on the default skeleton and written as a real
// .wanim. Entirely original motion — no external assets or licenses.
// Usage: node --experimental-strip-types scripts/makeSampleWanim.mjs
import { writeFileSync } from "node:fs";

const { defaultRestClip } = await import("../src/convert/restSkeleton.ts");
const { writeWanim } = await import("../src/wanim/writeWanim.ts");
const { parseWanim } = await import("../src/wanim/parse.ts");
const { convertCharacter } = await import("../src/convert/clip.ts");
const { quatMul, quatNormalize } = await import("../src/convert/quat.ts");

const FPS = 30;
const DUR = 12; // seconds; every base sine has a whole number of cycles
const F = FPS * DUR;

const rest = defaultRestClip();
const names = rest.names;
const B = names.length;
const bi = (n) => names.indexOf(n);

const aa = (x, y, z, a) => {
  const s = Math.sin(a / 2);
  return [x * s, y * s, z * s, Math.cos(a / 2)];
};
const deg = (d) => (d * Math.PI) / 180;
const smooth = (x) => { const t = Math.max(0, Math.min(1, x)); return t * t * (3 - 2 * t); };
/** 0→1→0 window over [t0,t1] with `e` seconds of easing at each edge. */
const windowAt = (t, t0, t1, e = 0.6) => Math.min(smooth((t - t0) / e), smooth((t1 - t) / e));

// Per-frame local rotations, identity everywhere by default.
const localQuat = Array.from({ length: B }, () => Array.from({ length: F }, () => [0, 0, 0, 1]));
const localPos = Array.from({ length: B }, (_, b) => Array.from({ length: F }, () => [...rest.bindPos[b]]));

const set = (name, f, q) => {
  const i = bi(name);
  if (i >= 0) localQuat[i][f] = quatNormalize(q);
};
const mul = (...qs) => qs.reduce((a, b) => quatMul(a, b));

for (let f = 0; f < F; f++) {
  const t = f / FPS;
  const ph = (t / DUR) * Math.PI * 2; // one cycle over the loop
  const breathe = Math.sin(ph * 4); // 4 breaths per loop
  const swayS = Math.sin(ph);       // slow whole-loop sway
  const sway2 = Math.sin(ph * 2);

  // Wave window: right arm raises, waves, comes back (t 5.5–9 s).
  const w = windowAt(t, 5.5, 9, 0.9);
  const waveOsc = Math.sin((t - 5.5) * Math.PI * 2 * 1.6) * w;

  // Hips: weight shift + tiny bob; rotation follows the shift.
  const hips = bi("Hips");
  localPos[hips][f] = [
    rest.bindPos[hips][0] + 0.018 * swayS,
    rest.bindPos[hips][1] - 0.008 + 0.006 * breathe * 0.5 - 0.01 * Math.abs(swayS),
    rest.bindPos[hips][2],
  ];
  set("Hips", f, mul(aa(0, 1, 0, deg(3) * swayS), aa(0, 0, 1, deg(-2) * swayS)));

  // Breathing through the spine; counter-rotate so the head stays level-ish.
  set("Spine", f, aa(1, 0, 0, deg(1.6) * breathe));
  set("Chest", f, aa(1, 0, 0, deg(1.2) * breathe));
  set("UpperChest", f, mul(aa(1, 0, 0, deg(-1.2) * breathe), aa(0, 1, 0, deg(-2) * swayS)));

  // Head: slow look around; slight tilt during the wave.
  set("Neck", f, aa(0, 1, 0, deg(6) * sway2 * (1 - w)));
  set("Head", f, mul(
    aa(0, 1, 0, deg(8) * swayS * (1 - w) + deg(-10) * w),
    aa(1, 0, 0, deg(2.5) * breathe * 0.5),
    aa(0, 0, 1, deg(-6) * w),
  ));

  // Arms: hang relaxed from the T-pose; the right arm raises to wave.
  // (Converted space: +X is the LEFT arm's direction; hang = rotate about Z.)
  const hangL = deg(-68) + deg(2) * breathe;
  const hangR = deg(68) - deg(2) * breathe;
  const raise = deg(-18); // wave pose: upper arm just above horizontal
  set("LeftShoulder", f, aa(0, 0, 1, deg(-4)));
  set("RightShoulder", f, mul(aa(0, 0, 1, deg(4) - deg(10) * w), aa(0, 1, 0, deg(-6) * w)));
  set("LeftUpperArm", f, mul(aa(0, 0, 1, hangL), aa(0, 1, 0, deg(6) * swayS)));
  set("RightUpperArm", f, mul(
    aa(0, 0, 1, hangR * (1 - w) + raise * w),
    aa(0, 1, 0, deg(-14) * w),
  ));
  set("LeftLowerArm", f, mul(aa(0, 0, 1, deg(-12)), aa(0, 1, 0, deg(4) * sway2)));
  set("RightLowerArm", f, mul(
    aa(0, 0, 1, deg(12) * (1 - w) + deg(-62) * w), // negative Z = elbow bends UP
    aa(1, 0, 0, deg(10) * waveOsc),
  ));
  set("LeftHand", f, aa(0, 0, 1, deg(-6)));
  set("RightHand", f, mul(aa(0, 0, 1, deg(6) * (1 - w)), aa(1, 0, 0, deg(16) * waveOsc)));

  // Legs: easy stance, knees soft, weight follows the hips sway.
  set("LeftUpperLeg", f, mul(aa(0, 0, 1, deg(3)), aa(1, 0, 0, deg(-3) - deg(1.5) * swayS)));
  set("RightUpperLeg", f, mul(aa(0, 0, 1, deg(-3)), aa(1, 0, 0, deg(-3) + deg(1.5) * swayS)));
  set("LeftLowerLeg", f, aa(1, 0, 0, deg(6) + deg(2) * swayS));
  set("RightLowerLeg", f, aa(1, 0, 0, deg(6) - deg(2) * swayS));
  set("LeftFoot", f, aa(1, 0, 0, deg(-3)));
  set("RightFoot", f, aa(1, 0, 0, deg(-3)));
}

const clip = {
  fps: FPS,
  frameCount: F,
  names,
  parents: rest.parents,
  localPos,
  localQuat,
  bindPos: rest.bindPos,
  face: null,
};

const bytes = writeWanim(clip);
writeFileSync("public/sample-idle.wanim", bytes);
console.log(`wrote public/sample-idle.wanim (${(bytes.length / 1024).toFixed(0)} KB, ${F} frames @ ${FPS} fps)`);

// Round-trip sanity: parse + convert like the app will.
const parsed = parseWanim(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
const conv = convertCharacter(parsed, 0);
console.log(`round-trip: ${parsed.times.length} frames, duration ${conv.duration.toFixed(2)}s, bones ${conv.names.length}`);
