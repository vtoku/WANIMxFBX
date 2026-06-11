// Measure the bundled body's head (verts weighted to head bones), evaluated
// through the actual skin at rest pose — works regardless of bind-matrix style.
import { readFileSync } from "node:fs";
globalThis.self = globalThis;
const THREE = await import("three");
const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
const { MeshoptDecoder } = await import("three/examples/jsm/libs/meshopt_decoder.module.js");

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const b = readFileSync("public/body.glb");
const gltf = await loader.parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), "");
gltf.scene.updateWorldMatrix(true, true);

const box = new THREE.Box3();
let headJointY = 0;
gltf.scene.traverse((m) => {
  if (!m.isSkinnedMesh) return;
  m.skeleton.update();
  const headBones = new Set();
  m.skeleton.bones.forEach((bn, j) => {
    if (/head|eye/i.test(bn.name)) headBones.add(j);
    if (/(^|-)head$/i.test(bn.name)) headJointY = bn.getWorldPosition(new THREE.Vector3()).y;
  });
  const pos = m.geometry.getAttribute("position");
  const sIdx = m.geometry.getAttribute("skinIndex");
  const sWgt = m.geometry.getAttribute("skinWeight");
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    let hw = 0;
    for (let k = 0; k < 4; k++) if (headBones.has(sIdx.getComponent(i, k))) hw += sWgt.getComponent(i, k);
    if (hw > 0.5) {
      v.fromBufferAttribute(pos, i);
      m.applyBoneTransform(i, v);
      m.localToWorld(v);
      box.expandByPoint(v.clone());
    }
  }
});
const size = box.getSize(new THREE.Vector3());
const center = box.getCenter(new THREE.Vector3());
console.log("body head bbox size (m):", size.toArray().map((x) => x.toFixed(3)).join(", "));
console.log("center y:", center.y.toFixed(3), " head joint y:", headJointY.toFixed(3));
console.log("=> height", (size.y * 100).toFixed(1), "cm; center", ((center.y - headJointY) * 100).toFixed(1), "cm above the Head joint; joint y", headJointY.toFixed(3));
