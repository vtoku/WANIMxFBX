import { readFileSync } from "node:fs";
globalThis.self = globalThis;
const { parseVrmHumanoid, sanitizeGlb } = await import("../src/vrm/vrmHumanoid.ts");
const { HUMAN_BODY_BONES } = await import("../src/wanim/parse.ts");
const file = process.argv[2] ?? "C:\\Users\\VTOKU\\Downloads\\AshtonMartenARKIT.vrm";
const buf = readFileSync(file);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
const map = parseVrmHumanoid(sanitizeGlb(ab));
const mapped = new Set(map.values());
console.log("mapped:", mapped.size);
console.log("MISSING:", HUMAN_BODY_BONES.filter((b) => !mapped.has(b)).join(", "));
console.log("UpperChest?", mapped.has("UpperChest"), " Chest?", mapped.has("Chest"),
  " Neck?", mapped.has("Neck"),
  " LShoulder?", mapped.has("LeftShoulder"), " RShoulder?", mapped.has("RightShoulder"));
