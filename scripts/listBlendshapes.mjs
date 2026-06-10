import { readFileSync } from "node:fs";
import { parseWanim } from "../src/wanim/parse.ts";

const file = process.argv[2];
const buf = readFileSync(file);
const clip = parseWanim(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
for (const ch of clip.characters) {
  for (const [set, frames] of Object.entries(ch.blendshapes)) {
    const names = Object.keys(frames[0] ?? {});
    console.log(`set "${set}": ${names.length} shapes`);
    console.log(names.join(", "));
    // report which ever actually move (max abs value across frames)
    const moved = names.filter((n) => {
      let mx = 0;
      for (let f = 0; f < frames.length; f += 10) mx = Math.max(mx, Math.abs(frames[f][n] ?? 0));
      return mx > 0.02;
    });
    console.log(`active (>0.02): ${moved.length} → ${moved.join(", ")}`);
  }
}
