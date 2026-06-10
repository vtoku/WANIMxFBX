// Strip images/textures/samplers from a GLB so it loads without a KTX2 / Basis
// transcoder. Geometry, morph targets, and skinning (all in the BIN chunk) are
// untouched; materials keep their base color factor but lose texture maps.
// Usage: node scripts/stripGlbTextures.mjs in.glb out.glb
import { readFileSync, writeFileSync } from "node:fs";

const [, , inPath, outPath] = process.argv;
if (!inPath || !outPath) {
  console.error("usage: node scripts/stripGlbTextures.mjs in.glb out.glb");
  process.exit(1);
}

const buf = readFileSync(inPath);
const magic = buf.readUInt32LE(0);
if (magic !== 0x46546c67) throw new Error("not a GLB"); // 'glTF'
const total = buf.readUInt32LE(8);

// chunk 0 = JSON
const jsonLen = buf.readUInt32LE(12);
const jsonType = buf.readUInt32LE(16);
if (jsonType !== 0x4e4f534a) throw new Error("first chunk is not JSON"); // 'JSON'
const json = JSON.parse(buf.toString("utf8", 20, 20 + jsonLen));

// remaining chunk(s) = BIN (keep verbatim)
const rest = buf.subarray(20 + jsonLen, total);

const before = {
  images: json.images?.length ?? 0,
  textures: json.textures?.length ?? 0,
  materials: json.materials?.length ?? 0,
};

delete json.images;
delete json.textures;
delete json.samplers;

const texKeys = [
  "baseColorTexture",
  "metallicRoughnessTexture",
  "normalTexture",
  "occlusionTexture",
  "emissiveTexture",
];
for (const mat of json.materials ?? []) {
  if (mat.pbrMetallicRoughness) {
    for (const k of texKeys) delete mat.pbrMetallicRoughness[k];
  }
  for (const k of texKeys) delete mat[k];
  if (mat.extensions) {
    delete mat.extensions.KHR_texture_basisu;
    delete mat.extensions.KHR_materials_pbrSpecularGlossiness;
    if (Object.keys(mat.extensions).length === 0) delete mat.extensions;
  }
}

const dropExt = new Set(["KHR_texture_basisu"]);
const filterExt = (a) => (a ? a.filter((e) => !dropExt.has(e)) : a);
if (json.extensionsUsed) json.extensionsUsed = filterExt(json.extensionsUsed);
if (json.extensionsRequired) {
  json.extensionsRequired = filterExt(json.extensionsRequired);
  if (json.extensionsRequired.length === 0) delete json.extensionsRequired;
}

// Re-encode GLB.
let jsonStr = JSON.stringify(json);
while (jsonStr.length % 4 !== 0) jsonStr += " ";
const jsonBytes = Buffer.from(jsonStr, "utf8");

const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0); // 'glTF'
header.writeUInt32LE(2, 4); // version
const newTotal = 12 + 8 + jsonBytes.length + rest.length;
header.writeUInt32LE(newTotal, 8);

const jsonChunkHeader = Buffer.alloc(8);
jsonChunkHeader.writeUInt32LE(jsonBytes.length, 0);
jsonChunkHeader.writeUInt32LE(0x4e4f534a, 4); // 'JSON'

writeFileSync(outPath, Buffer.concat([header, jsonChunkHeader, jsonBytes, rest]));
console.log("stripped", JSON.stringify(before), "→", outPath, `(${readFileSync(outPath).length} bytes)`);
