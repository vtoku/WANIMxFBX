import * as THREE from "three";

/**
 * The avatar finish, shared by the gold mannequin body and the facecap head:
 * DIO orange under a thin clearcoat — a designer-vinyl-toy look. A plain
 * low-metal orange reads as CHEESE (waxy diffuse + emissive glow = wax);
 * the coat's sharp secondary highlight is what sells "painted figure".
 * The scene's RoomEnvironment feeds the coat's reflections.
 */
export function makeAvatarMaterial(): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: 0xe0952f, // DIO orange, a step deeper (the coat brightens it)
    metalness: 0.15,
    roughness: 0.55, // satin base
    clearcoat: 0.7, // thin glossy paint layer
    clearcoatRoughness: 0.25,
    emissive: 0x8a5410,
    emissiveIntensity: 0.06, // barely-there lift; glow was the cheese-maker
    side: THREE.DoubleSide, // VRM skirts/hair are single-sided planes
  });
}
