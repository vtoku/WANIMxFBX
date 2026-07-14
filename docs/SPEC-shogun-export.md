# Spec: Shogun target-rig export (VRMxShogun integration)

Goal: fold the sibling tool VRMxShogun (local checkout
`C:\Users\VTOKU\Documents\Claude\VRM2VICON`) into WRYAnimator as an
extra export, so one app covers the whole pipeline. VRMxShogun turns a
VRM avatar into a Vicon Shogun retarget-target FBX (static skeleton +
skinned mesh, no animation). Its VRM humanoid parsing is ALREADY ported
here (src/vrm/vrmHumanoid.ts); what remains is the bone rebake, the
ASCII writer, and a UI entry.

## What to port (from VRM2VICON/src)

- `convert/build.ts` (the bone rebake): world-align every joint to the
  Maya convention Shogun expects: identity rotation in bind pose, local
  translation = world offset from parent, recomputed skin clusters
  (TransformLink = bone world bind, Transform = inverse). ORIGINAL bone
  names and hierarchy preserved verbatim (renaming breaks name-keyed
  streaming retarget back into Unity/Warudo; confirmed by real-world
  testing).
- `fbx/asciiFbx.ts` + `fbx/export.ts`: port VERBATIM as
  `src/shogun/asciiFbx.ts`. Shogun compatibility was validated against
  this exact ASCII 7.5 output; do NOT reroute through our binary writer
  (MoBu import does not matter for a Shogun target rig). Keep
  meters->cm, UpAxis=Y, UnitScaleFactor=1.
- `vrm/loadGltf.ts` + `vrm/springs.ts`: GLTFLoader parse with
  associations, spring-chain detection, strip-springs option.
- Skip: VRMxShogun's preview and metadata UI (we have our own preview;
  meta display can be a line in the Info tab).

## Integration

- Input = the user's already-loaded VRM body (`userBodyBytes`, kept by
  scene v2). No separate drop flow: if the loaded body is a .vrm (or a
  GLB with a VRM extension), the export is available; otherwise the
  button explains it needs a VRM body.
- UI: Export tab, new "Shogun target rig (.fbx)" row with its own
  download button + a "strip spring bones" checkbox (default on,
  matching VRMxShogun). Filename `<outBase()>-shogun.fbx`.
- This export is static (no animation): it consumes the VRM bytes
  directly, NOT the converted clip. Keep the module boundary clean:
  `src/shogun/` depends on nothing under src/convert or src/rig.

## Gotchas carried over from VRMxShogun's CLAUDE.md

- BindPose must exactly match cluster TransformLink or the character
  explodes on import (their #1 failure mode).
- VRM 0.x vs 1.0 differ (extension key, humanBones shape, forward
  axis 180 apart); vrmHumanoid.ts already normalizes, reuse it.
- Never rename bones, never change hierarchy; orientation is the only
  thing the rebake may change.

## Verification

- New script `npm run shogunCheck -- <file.vrm>`: parses the output
  ASCII FBX, asserts every joint has identity rotation, translations
  equal world-offset deltas, cluster TransformLink equals the bind
  world matrix, bone names byte-identical to the VRM node names.
- Load the output in Blender 4.4 headless (installed) and diff joint
  world positions against the VRM rest pose (script, not eyeball).
- Playwright: Export tab shows the row when a VRM body is loaded and
  the download produces a non-trivial file.
