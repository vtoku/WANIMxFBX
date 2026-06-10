import { readFileSync } from "node:fs";
globalThis.self = globalThis;
const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader.js");
const { MeshoptDecoder } = await import("three/examples/jsm/libs/meshopt_decoder.module.js");
const THREE = await import("three");

const file = process.argv[2] ?? "public/facecap.glb";
const buf = readFileSync(file);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const gltf = await loader.parseAsync(ab, "");

const box = new THREE.Box3().setFromObject(gltf.scene);
const size = box.getSize(new THREE.Vector3());
const center = box.getCenter(new THREE.Vector3());
console.log("bounds size:", [size.x, size.y, size.z].map((v) => v.toFixed(3)).join(", "));
console.log("center:", [center.x, center.y, center.z].map((v) => v.toFixed(3)).join(", "));

gltf.scene.traverse((o) => {
  const tag = o.isMesh ? "Mesh" : o.isBone ? "Bone" : o.type;
  let extra = "";
  if (o.morphTargetDictionary) {
    const names = Object.keys(o.morphTargetDictionary);
    extra = ` morphs(${names.length}): ${names.join(", ")}`;
  }
  console.log(`- ${tag} "${o.name}"${extra}`);
});
