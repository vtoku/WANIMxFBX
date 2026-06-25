import { readFileSync } from "node:fs";
globalThis.self = globalThis;
const THREE = await import("three");
const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
const { MeshoptDecoder } = await import("three/examples/jsm/libs/meshopt_decoder.module.js");

const { parseWanim } = await import("../src/wanim/parse.ts");
const { convertCharacter } = await import("../src/convert/clip.ts");
const { extractBodyMeshes } = await import("../src/convert/body.ts");
const { parseVrmHumanoid, parseGlbChunks, sanitizeGlb } =
  await import("../src/vrm/vrmHumanoid.ts");
const { boneUnityFromAssociations } = await import("../src/convert/body.ts");

const wanimFile = process.argv[2] ?? "C:\\Users\\VTOKU\\Downloads\\takyon take 2.wanim";
const vrmFile = process.argv[3] ?? "C:\\Users\\VTOKU\\Downloads\\AshtonMartenARKIT.vrm";

const wbuf = readFileSync(wanimFile);
const clip = convertCharacter(parseWanim(wbuf.buffer.slice(wbuf.byteOffset, wbuf.byteOffset + wbuf.byteLength)));
console.log("recording bones:", clip.names.length);

const vbuf = readFileSync(vrmFile);
const ab = vbuf.buffer.slice(vbuf.byteOffset, vbuf.byteOffset + vbuf.byteLength);
const clean = sanitizeGlb(ab);
const nodeMap = parseVrmHumanoid(clean);
console.log("VRM humanoid bones mapped:", nodeMap ? nodeMap.size : "NONE");

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const gltf = await loader.parseAsync(clean, "");
const boneUnity = nodeMap ? boneUnityFromAssociations(gltf, nodeMap) : null;
console.log("boneUnity object map size:", boneUnity ? boneUnity.size : "null");

// Report scene-level transforms (armature scale is a classic deformer)
gltf.scene.updateWorldMatrix(true, true);
const rootScale = new THREE.Vector3();
gltf.scene.getWorldScale(rootScale);
console.log("scene root world scale:", rootScale.toArray().map((v) => v.toFixed(4)).join(", "));

// Per-mapped-bone world scale
if (boneUnity) {
  const odd = [];
  boneUnity.forEach((unity, obj) => {
    const s = new THREE.Vector3();
    obj.getWorldScale(s);
    if (Math.abs(s.x - 1) > 0.02 || Math.abs(s.y - 1) > 0.02 || Math.abs(s.z - 1) > 0.02) {
      odd.push(`${unity}: ${s.toArray().map((v) => v.toFixed(3)).join(",")}`);
    }
  });
  console.log("bones with non-unit world scale:", odd.length ? odd.join(" | ") : "none");
}

const res = extractBodyMeshes(gltf.scene, clip.parents, clip.bindPos, clip.names, boneUnity ?? undefined, {
  keepHead: true,
});

console.log("\noutput meshes:", res.meshes.length);
const box = new THREE.Box3();
for (const m of res.meshes) {
  const b = new THREE.Box3();
  for (let i = 0; i < m.positions.length; i += 3) {
    b.expandByPoint(new THREE.Vector3(m.positions[i], m.positions[i + 1], m.positions[i + 2]));
  }
  box.union(b);
  const sz = b.getSize(new THREE.Vector3());
  // detect NaN / explosions
  const bad = [...m.positions].some((v) => !Number.isFinite(v));
  console.log(`  ${m.name}: verts ${m.positions.length / 3}, size ${sz.toArray().map((v) => v.toFixed(2)).join("x")}${bad ? "  <<< NaN/Inf!" : ""}`);
}
const sz = box.getSize(new THREE.Vector3());
const ctr = box.getCenter(new THREE.Vector3());
console.log("overall bounds size:", sz.toArray().map((v) => v.toFixed(3)).join(", "),
  " center:", ctr.toArray().map((v) => v.toFixed(3)).join(", "));

// Flag exploded verts: distance from each vert to the joint of its
// heaviest-weight bone. Spikes/shredding = verts far from their joint.
const jointOf = res.joints; // per OUR bone index
const offenders = new Map(); // bone index -> {count, max}
for (const m of res.meshes) {
  const count = m.positions.length / 3;
  for (let i = 0; i < count; i++) {
    // heaviest influence
    let bestK = 0, bestW = -1;
    for (let k = 0; k < 4; k++) {
      const w = m.skinWeight[i * 4 + k];
      if (w > bestW) { bestW = w; bestK = k; }
    }
    const bone = m.skinIndex[i * 4 + bestK];
    const j = jointOf[bone];
    if (!j) continue;
    const dx = m.positions[i * 3] - j[0];
    const dy = m.positions[i * 3 + 1] - j[1];
    const dz = m.positions[i * 3 + 2] - j[2];
    const d = Math.hypot(dx, dy, dz);
    if (d > 0.25) {
      const e = offenders.get(bone) ?? { count: 0, max: 0, mesh: m.name };
      e.count++; e.max = Math.max(e.max, d);
      offenders.set(bone, e);
    }
  }
}
console.log("\nbones with verts >0.25m from their joint (shredding suspects):");
[...offenders.entries()].sort((a, b) => b[1].max - a[1].max).forEach(([bone, e]) => {
  console.log(`  ${clip.names[bone]} (${bone}): ${e.count} verts, max dist ${e.max.toFixed(2)}m  [${e.mesh}]`);
});
