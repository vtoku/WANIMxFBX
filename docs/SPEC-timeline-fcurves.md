# Spec: Timeline v2 + F-Curve editor v2 + Filter stack

Goal: close the mocap-cleanup workflow gap so WRYAnimator can replace
MotionBuilder in the pipeline. The reference workflow being replaced:
open recording, find a bad section in the f-curves, select the affected
channels (down to individual fingers), apply a filter to just that frame
range, verify against the original, repeat. Today none of those steps is
possible: the timeline has no zoom, the curve editor shows only rig-layer
delta keys (not the motion itself), and every cleaning filter is a
whole-clip toggle scoped to hardcoded bone groups.

Market reference points (feature parity targets):

- MotionBuilder FCurve editor: channel tree, box-select keys, filters
  applied to the selection (Butterworth, peak removal, smooth, key
  reducer, resample).
- TriMotion Animation Optimizer (Blender): key reduction 50-90% with
  shape-preserving simplification, SELECTIVE per-bone simplification,
  density/statistics readout before and after.
- Foot Lock (Blender): per-plant lock regions the user can see and
  retime individually (we auto-detect plants but expose no per-plant
  control).
- AnimAide / Cascadeur: ease/blend-to-neighbor curve tools, physics
  checks (out of scope for now, listed for orientation).

## 1. Timeline v2 (src/ui/transport.ts)

The single fixed-scale strip becomes a zoomable ruler shared by the
strip, the dope sheet, and the curve editor (one time->pixel mapping
object passed to all three).

- **View range vs clip range vs trim.** View range = what is on screen
  (zoom/pan). Trim (in/out) = playback loop + export range, unchanged.
  Never conflate them. Zoom: wheel zooms around the cursor time;
  horizontal drag on the ruler (or middle-drag anywhere on the strip)
  pans; Home/press-F fits the whole clip (F fits the trim range when one
  is set, like Maya frame-selection).
- **Frame ruler.** Adaptive tick labels (seconds at wide zoom, frames
  when zoomed past ~10 px/frame). Grid lines continue faintly through
  dope rows and curve view so keys visually align.
- **Frame readout becomes an input.** The "f 493/7654" text becomes an
  editable frame field (type a frame, Enter seeks). Show fps next to it
  (export fps select already exists on the Export tab; display fps here
  is the recording's average).
- **Snapping.** Key drags and the playhead snap to frames (already true
  for key drags); add a magnet toggle in the transport for snapping key
  drags to other keys / to the playhead.
- **Markers.** Right-click ruler: "Add marker" with a short label
  (stored in scene JSON; drawn as small flags). Cleanup work is
  note-heavy; markers replace writing frame numbers on paper.
- **Keep** trim handles, band select, key diamonds, cleaning tick
  marks, In/Out/Reset, speed select, exactly as they are.

Perf constraint: the dope sheet rows and marks canvas redraw per
zoom/pan frame; keep them canvas-drawn (marks already are; key diamonds
should move from DOM spans to the same canvas once rows exceed ~500
keys, DOM is fine below that).

## 2. F-Curve editor v2 (src/ui/curves.ts + new src/ui/channels.ts)

Two modes, toggled inside the curves panel:

- **Corrections mode** = exactly today's view (layer-key deltas). Keep.
- **Channels mode (new)** = the DENSE baked motion: per-bone local
  rotation as unwrapped Euler ZYX degrees (quatToEulerZYX exists) and
  Hips position in cm, sampled from the current display clip (post
  clean + modifiers + layers, i.e. what exports).

### Channel tree (left panel of the curves dock)

- Hierarchy grouped by body part: Root/Hips, Spine chain, Head/Neck,
  L/R Arm, L/R Hand (fingers: one group per finger, five per hand),
  L/R Leg, L/R Foot/Toes. The 30 finger bones (HumanBodyBones 24-53)
  are first-class rows. Search box filters by name.
- Multi-select (ctrl/shift). Selecting a rig effector in the viewport
  scopes the tree to that limb (sync both ways where possible).
- Per-row visibility eye (isolate curves) and a per-axis X/Y/Z toggle
  strip like MoBu's channel boxes.
- The SAME tree selection is the scope for filters (section 3) and for
  key reduction (section 4). One selection model, three consumers.

### Graph view

- Time axis = the shared timeline mapping (zoom/pan synced). Vertical:
  per-mode auto-fit with wheel zoom + drag pan; "F" fits selection.
- Dense curves are decimated to pixel resolution with a min/max
  envelope per pixel column (12k frames must draw in <8 ms; no
  per-frame vertices).
- Value readout under cursor; playhead line; click-empty seeks (keep).
- Original-vs-current: when the hold-to-compare button is held, draw
  the UNCLEANED source channel as a ghost curve behind the current one
  (buildDisplay(false) reference clip already exists for REACH).

### Editing in Channels mode

Direct dense-curve editing is NOT in scope (that is what layers are
for). Channels mode is for SEEING the data and applying range filters.
Layer-key editing stays in Corrections mode. This keeps the v0.26
architecture intact: layers hold the only hand edits, filters transform
the base clip.

## 3. Filter stack (non-destructive range filters)

New concept: `CleanOp`, an ordered list applied inside the display/
export rebuild after the global cleaning toggles and before modifiers
and layers.

```ts
interface CleanOp {
  id: string;                    // undo/serialize identity
  bones: string[];               // from the channel tree selection
  range: { t0: number; t1: number }; // playback-time seconds
  filter: "butterworth" | "despike" | "smooth" | "keyreduce-preview";
  params: { cutoffHz?: number; thresholdDeg?: number; widthFrames?: number };
  enabled: boolean;
}
```

- UI: a "Filters" list on the Clean tab (below Range Smoothing, which
  it generalizes and eventually replaces). Flow: select channels in the
  tree, band-drag a range in the graph (or use trim), pick filter +
  params, Apply = append op. Each op row: enable checkbox, bone-count
  chip, range chip (click = zoom the view there), edit, delete.
- Every op blends 0.25 s at the range edges (smoothRange precedent) so
  stacking never pops.
- Implementation reuses the existing kernels in src/convert/clean.ts
  (butterworth filtfilt, despike, smoothRange). The new work is scoping
  them by bone list + range and replaying the op list. Zero-norm quats
  stay untouched (safeQuat rule).
- Serialization: ops ride in undo snapshots, the localStorage cache,
  and scene JSON (bump scene version; older scenes load with an empty
  op list). Order: cleanClip -> range smooth (legacy) -> CleanOps ->
  time warp handling unchanged -> modifiers -> layers.
- The timeline tick-mark canvas shows each op's range as a colored
  underline (existing marks channel).

## 4. Key reduction v2 (TriMotion parity)

reduceKeys() exists (greedy, whole clip). Extend, in the Export tab:

- Selective: run per-bone with per-group tolerance overrides (fingers
  usually tolerate 2-3x the body tolerance). Input = channel-tree
  selection or "all".
- Statistics: before/after key counts per group, max positional error
  at chain ends (fk.ts can evaluate), shown in a small table before
  export. TriMotion's headline feature is the confidence readout, not
  the algorithm.
- Export-time only (FBX/VRMA writers); the internal clip stays dense.

## 5. Foot pinning v2 (Foot Lock parity)

Plant detection and per-plant IK already exist (src/convert/feet.ts)
and are good. What is missing is VISIBILITY and per-plant control:

- Draw detected plants as lock regions on the timeline (per-foot color)
  when "Pin planted feet" is on.
- Right-click a region: delete this plant, or drag its edges to retime
  the contact window. Overrides are stored as a per-plant edit list in
  scene state and applied on top of detection (re-detect keeps user
  edits by interval overlap matching).
- "Add plant" by band-selecting a range with a foot channel scoped.

## Verification

- Extend npm run cleanCheck with: a CleanOp scoped to one wrist over a
  1 s range changes ONLY that bone's quats inside range +/- blend
  window (bit-compare the rest of the clip).
- npm run rigCheck must stay green (layer semantics untouched).
- Playwright shot: zoomed timeline + channels mode with finger curves
  visible, hold-to-compare ghost curve drawn.
- Perf: 12k-frame clip, 55 channels visible, zoom drag stays under
  16 ms/frame (measure with performance.now around draw).
