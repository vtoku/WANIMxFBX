import * as THREE from "three";

/**
 * The avatar finish, shared by the gold mannequin body and the facecap head:
 * pale champagne, semi-gloss metallic. Metals only reflect their environment,
 * so this depends on the RoomEnvironment the preview scene installs — without
 * an env map a metalness this high renders near-black.
 */
export function makeAvatarMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: 0xe8d5a4, // pale champagne gold
    metalness: 0.85,
    roughness: 0.35, // semi-gloss
    side: THREE.DoubleSide, // VRM skirts/hair are single-sided planes
  });
}
