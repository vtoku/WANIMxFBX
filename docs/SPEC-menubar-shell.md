# Spec: Menu bar + DCC boot + preferences + layout

Goal: finish the transition from "converter page" to DCC shell. Three
parts: a real menu bar, boot straight into a usable empty editor (no
landing overlay), and an app preferences + layout system.

## 1. Menu bar

One row, merged into the existing topbar (no new vertical cost):
logo | File Edit View Help | spacer | version, Source link.

Dropdowns are plain DOM (no library): button opens on click, closes on
outside click/Esc, arrow keys navigate, hotkey hints right-aligned in
items. Items disable (dim) when no clip is loaded where relevant.

- **File**
  - Open recording... (Ctrl+O), Open scene..., Open body (VRM/GLB)...
  - Save scene (Ctrl+S), Save scene as... (prompts filename; the
    toolbar #outName field moves here and to Export)
  - Recent files submenu: last 8 opened, via the File System Access
    API when available (persisted handles, permission re-request on
    use); hidden entirely when the API is unavailable. Plain reopen
    of dropped files is impossible without it; do not fake it.
  - Export: FBX / VRMA / WANIM / Shogun target rig (same actions as
    the Export tab buttons; the tab stays as the settings surface)
- **Edit**
  - Undo (Ctrl+Z), Redo (Ctrl+Y)
  - Copy keys / Paste keys / Delete keys (surface the existing
    Ctrl+C/V/Del so they are discoverable)
  - Key pose, keying mode (mirrors the Rig tab control once the
    autorig spec lands)
  - Reset modifiers
  - Preferences... (opens the dialog, section 3)
- **View**
  - Panels: Dock (Clean/Rig/Export/Info select), Keys / Curves /
    hidden cycle, Ghost, Hold-to-compare toggle-lock
  - Viewport: Reset camera, Frame character (F already fits time;
    this is the camera), grid toggle if cheap
  - Layout presets (section 4)
- **Help**
  - Keyboard shortcuts (overlay cheat sheet listing every hotkey:
    Space, arrows, shift-arrows, F, Q/W/E, Ctrl+Z/Y/C/V/Del, Ctrl+O/S;
    generated from one table that ALSO drives the tooltips so it
    cannot drift)
  - About (version, credits line, link to repo)

The transport loses Load .wanim / Load scene / Save scene buttons
(their actions move to File). Undo/Redo stay in the editbar as icons.
Whole-page drag-drop stays exactly as is.

## 2. DCC boot (remove the landing overlay)

- Delete the hero logo + drop card overlay from the empty state. On
  boot the editor is simply there: empty stage (grid + ground),
  orbitable camera, menus and preferences usable, transport disabled
  (no clip), dock tabs visible with an empty-state line each.
- The only empty-scene affordance: one dim centered line over the
  viewport, "Open a recording (Ctrl+O) or drop a file anywhere",
  which fades out permanently once a clip loads. Keep it one line;
  no card, no button (the File menu is the button).
- #file-input, handleFile routing, and the drop handlers are
  unchanged. The #empty-error toast stays.
- Keep element IDs; scripts (bootCheck, driveApp) key off them.
  Update bootCheck to assert the new boot state (menus present,
  no dropzone).

## 3. Preferences dialog

Modal (Esc closes, click-outside closes), three tabs, stored in
localStorage under one `wanimprefs` key (app-wide, NOT per-recording;
per-recording state stays in the existing cache). Scene files do NOT
carry preferences.

- **General**: autosave on/off; confirm before replacing an unsaved
  session; show hint boxes (master switch for the (i) toggles).
- **Defaults** (applied to NEW sessions, never retroactively):
  export fps, bone name scheme, rest pose option, gizmo space
  (local/world), snapping magnet default, playback rate default,
  cleaning toggles default off/on set.
- **Appearance**: UI scale (0.85 / 1 / 1.15 via a root font-size
  var), accent follows the brand gold (no theme picker; note it as
  future work at most).

Implementation: a `prefs.ts` module with typed get/set + change
events; consumers read defaults at session build. Keep it under ~150
lines; this is not a framework.

## 4. Layout options

Lightweight, CSS-variable driven; no dock-undocking framework:

- Resizable splitters: dock width (drag left edge), timeline dock
  height (drag top edge, affects curve/dope area), channel-tree width
  inside the curves panel. Persisted in prefs.
- Layout presets in View: **Default** (current), **Cleanup** (wide
  curves: taller timeline dock, curves open, dock collapsed to a thin
  tab strip), **Rig** (dock open on Rig, dope sheet open, picker
  visible). Presets just set the same variables + panel states.
- Collapse the dock to a vertical tab strip (click a tab to reopen);
  remembers per prefs.

## Verification

- npm run bootcheck updated: boots to editor with menus, no overlay,
  transport disabled until a file loads, then loads the sample and
  asserts the transport enables.
- Playwright shots: empty boot, File menu open, preferences dialog,
  Cleanup layout preset with a clip loaded.
- Hotkey table drives both the Help overlay and tooltips (assert in
  bootcheck that every table entry appears in the overlay).
- rigCheck / cleanCheck / wanimCheck untouched and green.
