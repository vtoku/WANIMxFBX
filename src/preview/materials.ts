import * as THREE from "three";

/**
 * The avatar finish, shared by the gold mannequin body and the facecap head:
 * DIO orange-gold with a very subtle metallic spec and a slight warm
 * emission so it never falls to black in shadow. The scene's RoomEnvironment
 * feeds what little reflectivity there is.
 */
export function makeAvatarMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xe9a13b, // DIO orange-gold
    metalness: 0.3, // just a hint of metal
    roughness: 0.6,
    emissive: 0xb06f14,
    emissiveIntensity: 0.16, // slight self-glow
    side: THREE.DoubleSide, // VRM skirts/hair are single-sided planes
  });
}
