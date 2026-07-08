import * as THREE from "three";

/**
 * The avatar finish, shared by the mannequin body and the facecap head:
 * the Cascadeur-2023-mannequin treatment at DIO's hue — saturated, bright,
 * strictly NON-metallic satin plastic. No metalness, no clearcoat, no
 * emissive: the form is modeled purely by the soft key + env lighting.
 */
export function makeAvatarMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xee8a1f, // DIO orange — Nendoroid-jacket vivid, not amber
    metalness: 0,
    roughness: 0.72, // broad soft sheen, no hotspots
    side: THREE.DoubleSide, // VRM skirts/hair are single-sided planes
  });
}
