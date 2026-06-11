// Verifies the cleaning filters actually work on real motion data:
//  - despike: a synthetic 1-frame pop injected into a wrist track must be removed
//  - butterworth: smoothness (RMS of 2nd differences of joint angle) must drop,
//    while max deviation from the original stays bounded (no gross distortion)
//  - wrist limit: post-clean wrist twist/swing must be inside the human range
// Usage: node scripts/cleanCheck.mjs [file.wanim]
import { readFileSync } from "node:fs";
const { parseWanim } = await import("../src/wanim/parse.ts");
const { convertCharacter } = await import("../src/convert/clip.ts");
const { cleanClip } = await import("../src/convert/clean.ts");

const path = process.argv[2] ?? "C:\\Users\\VTOKU\\Downloads\\All-The-Things-2-2026-05-24-18-55-10.wanim";
const buf = readFileSync(path);
const clip = parseWanim(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
const c = convertCharacter(clip, 0);
const frames = c.times.length;
console.log(`clip: ${frames} frames, ${c.duration.toFixed(1)}s`);

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
const angle = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(dot(a, b)))) * (180 / Math.PI);

let failures = 0;
const check = (label, ok, detail) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}  ${detail}`);
  if (!ok) failures++;
};

// --- 1. despike removes an injected pop -----------------------------------
{
  const hand = c.names.indexOf("RightHand");
  const f = Math.floor(frames / 2);
  const injected = structuredClone(c);
  // 90° flip about X for exactly one frame.
  const s = Math.sin(Math.PI / 4), w = Math.cos(Math.PI / 4);
  const q = injected.localQuat[hand][f];
  injected.localQuat[hand][f] = [
    w * q[0] + s * q[3], w * q[1] - s * q[2], w * q[2] + s * q[1], w * q[3] - s * q[0],
  ];
  const popBefore = angle(injected.localQuat[hand][f], c.localQuat[hand][f]);
  const cleaned = cleanClip(injected, { despike: true, despikeDeg: 35 });
  const popAfter = angle(cleaned.localQuat[hand][f], c.localQuat[hand][f]);
  check("despike: injected 1-frame 90° wrist pop removed",
    popBefore > 80 && popAfter < 10,
    `before=${popBefore.toFixed(1)}° after=${popAfter.toFixed(1)}°`);
}

// --- 2. butterworth smooths without distorting -----------------------------
{
  const smoothness = (track) => {
    let sum = 0;
    for (let f = 1; f < track.length - 1; f++) {
      const d = angle(track[f - 1], track[f]) - angle(track[f], track[f + 1]);
      sum += d * d;
    }
    return Math.sqrt(sum / (track.length - 2));
  };
  const cleaned = cleanClip(c, { smooth: true, cutoffHz: 7 });
  let beforeAvg = 0, afterAvg = 0, maxDev = 0, n = 0;
  for (let b = 0; b < c.names.length; b++) {
    // Skip degenerate (zero-norm) tracks — unused bones in some recordings;
    // the angle metric is meaningless there and the filter leaves them alone.
    if (c.localQuat[b].some((q) => Math.hypot(...q) < 0.5)) continue;
    beforeAvg += smoothness(c.localQuat[b]);
    afterAvg += smoothness(cleaned.localQuat[b]);
    for (let f = 0; f < frames; f++) maxDev = Math.max(maxDev, angle(c.localQuat[b][f], cleaned.localQuat[b][f]));
    n++;
  }
  beforeAvg /= n; afterAvg /= n;
  check("butterworth: smoothness improves (RMS 2nd-diff of angle drops)",
    afterAvg < beforeAvg * 0.8,
    `before=${beforeAvg.toFixed(4)} after=${afterAvg.toFixed(4)} (${((1 - afterAvg / beforeAvg) * 100).toFixed(0)}% less jitter)`);
  // Momentary deviation up to ~35° is the filter legitimately attenuating
  // fast whips at 7Hz; gross corruption (NaN/sign flips) shows as 90-180°.
  check("butterworth: no gross distortion", maxDev < 45, `max deviation=${maxDev.toFixed(1)}°`);

  // Zero-phase: the filtered hips X track must not lag the original.
  const hips = 0;
  const xs = c.localPos[hips].map((p) => p[0]);
  const ys = cleaned.localPos[hips].map((p) => p[0]);
  let best = 0, bestLag = 0;
  for (let lag = -5; lag <= 5; lag++) {
    let s2 = 0;
    for (let f = Math.max(0, -lag); f < frames - Math.max(0, lag); f++) s2 += xs[f + lag] * ys[f];
    if (s2 > best) { best = s2; bestLag = lag; }
  }
  check("butterworth: zero phase (no lag on hips track)", bestLag === 0, `best correlation at lag=${bestLag}`);
}

// --- 3. wrist limit clamps to human range ----------------------------------
{
  const cleaned = cleanClip(c, { limitWrists: true });
  let worstTwist = 0, worstSwing = 0, clamped = 0;
  for (const side of ["Left", "Right"]) {
    const hand = c.names.indexOf(`${side}Hand`);
    const mid = c.names.indexOf(`${side}MiddleProximal`);
    const off = c.bindPos[mid];
    const len = Math.hypot(...off);
    const ax = off.map((v) => v / len);
    for (let f = 0; f < frames; f++) {
      const q = cleaned.localQuat[hand][f];
      const proj = q[0] * ax[0] + q[1] * ax[1] + q[2] * ax[2];
      let tw = Math.abs(2 * Math.atan2(proj, q[3]));
      if (tw > Math.PI) tw = 2 * Math.PI - tw;
      // swing = q * conj(twist); |w| gives the swing angle
      const tn = Math.hypot(ax[0] * proj, ax[1] * proj, ax[2] * proj, q[3]) || 1;
      const t = [ax[0] * proj / tn, ax[1] * proj / tn, ax[2] * proj / tn, q[3] / tn];
      const sw = Math.abs(t[3] * q[3] + t[0] * q[0] + t[1] * q[1] + t[2] * q[2]);
      const swingA = 2 * Math.acos(Math.min(1, sw));
      worstTwist = Math.max(worstTwist, tw);
      worstSwing = Math.max(worstSwing, swingA);
      if (angle(cleaned.localQuat[hand][f], c.localQuat[hand][f]) > 0.5) clamped++;
    }
  }
  const deg = 180 / Math.PI;
  check("wrist limit: twist within ±90°+ε", worstTwist * deg < 91, `worst twist=${(worstTwist * deg).toFixed(1)}°`);
  check("wrist limit: swing within 85°+ε", worstSwing * deg < 86, `worst swing=${(worstSwing * deg).toFixed(1)}°`);
  console.log(`      (clamped ${clamped} of ${frames * 2} wrist frames in this recording)`);
}

if (failures) { console.error(`${failures} FAILURES`); process.exit(1); }
console.log("OK");
