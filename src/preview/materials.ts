import * as THREE from "three";

/**
 * The avatar finish, shared by the gold mannequin body and the facecap head:
 * DIO orange-gold with a very subtle metallic spec and a slight warm
 * emission so it never falls to black in shadow. The scene's RoomEnvironment
 * feeds what little reflectivity there is.
 */
export function makeAvatarMaterial(): THREE.MeshStandardMaterial {
  // Cascadeur-mannequin treatment in DIO orange: vivid base that stays
  // saturated on the shadow side (strong same-hue emissive lift), soft
  // plastic sheen, barely-there metal.
  return new THREE.MeshStandardMaterial({
    color: 0xffa22e, // DIO orange, bright
    metalness: 0.2,
    roughness: 0.5,
    emissive: 0xff8a1a,
    emissiveIntensity: 0.3,
    side: THREE.DoubleSide, // VRM skirts/hair are single-sided planes
  });
}
