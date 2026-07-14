# Spec: Auto FK/IK control rig on import

Goal: every imported animation (wanim today, FBX when the import spec
lands) gets a complete, modern control rig automatically, the way
MotionBuilder builds a Control Rig at characterization and Unreal
builds an IK Rig. The v0.26 layer architecture (capture-time solve,
pure curve evaluation, per-bone local channel keys) is NOT changed by
this spec; it is a coverage + UI expansion of the same model.

Current rig (src/rig/rig.ts EFFECTORS): hips, root, 2 IK hands, 2 IK
feet, head, spine, chest, neck, shoulders, and FK segments for upper/
lower arms and legs. 21 effectors. Missing: fingers (30 bones ARE in
the recording, HumanBodyBones 24-53), toes (19-20), per-limb IK/FK
blend, pole-vector handles, a picker, keying modes.

## 1. Effector coverage

- **Toes**: FK effectors LeftToes/RightToes (tip = none; rotate only).
- **Fingers**: NOT 30 viewport handles (unusable clutter). Two levels:
  - **Hand pose controls**: per hand, three sliders keyed as a group
    onto the finger bones of that hand: Curl (all fingers proximal+
    intermediate+distal), Spread (yaw between fingers), Thumb curl.
    Implemented as captureBoneKeys over the hand's finger bones with
    rotations synthesized about each finger's flexion axis (derive the
    axis from the bind offsets, same trick as forearm twist axis =
    direction to child). Keys land on the layer like any drag, so
    they retime/copy/mirror with everything else.
  - **Per-finger FK**: selecting a finger row in the channel tree (see
    timeline/fcurves spec) shows a small gizmo on that finger chain in
    the viewport; drags capture exactly like other FK effectors. No
    always-on handles.
- **Look-at (later, optional)**: eyes exist in some recordings; skip
  for now, note only.

## 2. Per-limb IK/FK state

Today IK is capture-time only and implicit (dragging a hand solves the
chain). Make the limb state explicit and persistent, MoBu-style:

- Per limb (L/R arm, L/R leg): an IK/FK blend value 0..1, shown as a
  small slider in the Rig tab and stored per layer snapshot. At 1
  (default) drags of the end effector solve IK exactly as today; at 0
  the end effector handle hides and only FK segment handles operate;
  between, the captured solve blends solved chain locals toward the
  pre-drag FK locals before keying (slerp per bone, then capture).
- **Pinning** (exists per v0.31 for feet/hands): surface the pin
  toggles on the effector context menu AND the picker (below), not
  only where they live today.
- **Pole vectors**: knee/elbow direction handles per limb. Placement =
  recorded pole (mid-joint direction) so grabbing one and dragging
  swings the limb plane; capture writes the chain bones (same 3-bone
  write path as an IK drag). The whole-clip Knees/Elbows in-out
  modifier sliders stay for bulk correction; the pole handle is the
  per-frame tool.

## 3. Picker panel

A schematic body map (flat SVG silhouette, MoBu Character Controls /
UE Control Rig picker style) on the Rig tab:

- Click = select effector (same selection as clicking a viewport
  handle). Ctrl-click multi-select where the operation supports it.
- Shows per-effector state at a glance: has-keys-on-active-layer dot,
  pinned icon, IK/FK blend tint per limb.
- Doubles as scope entry: clicking a hand opens the finger sub-picker
  (10 finger targets + hand pose sliders); clicking a limb scopes the
  channel tree to it.
- Keep the existing viewport handles; the picker is an alternative
  selection surface, not a replacement.

## 4. Keying modes

A three-way mode next to "Key pose" (MoBu's trio):

- **Selected**: key only the selected effector's bones (today's "Key
  pose" behavior scoped down).
- **Body part**: key the selected effector's whole limb chain group
  (the EFFECTORS chain + its FK segments).
- **Full body**: today's keyFullPose.

Auto-key toggle: when on, any effector drag also brackets neighbors
the way keyFullPose does for pops (off by default; mocap cleanup keys
deliberately).

## 5. Auto-build on import

On clip load (loadWanim and the future FBX import path), after
convertCharacter: build the rig automatically (effector set from the
bones present; recordings missing UpperChest or fingers simply drop
those controls), create Layer 1 empty, restore any saved rig state as
today. "Auto" means zero clicks to a working rig; it does NOT mean
auto-keying anything.

## Verification

- rigCheck additions: hand-pose curl slider keyed at frame f moves
  only that hand's finger bone locals (bit-compare others); IK/FK
  blend 0 drag writes no chain-root/mid keys; pole-vector drag at
  blend 1 keeps the end effector world position within 1 mm.
- Picker: Playwright shot of the Rig tab with picker visible; click a
  limb, assert the matching effector selection class appears.
- All existing rigCheck invariants stay green untouched.
