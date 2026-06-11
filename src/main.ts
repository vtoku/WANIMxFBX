import "./style.css";
import { parseWanim, BONE_COUNT, type WanimClip } from "./wanim/parse.ts";
import { convertCharacter, resample, type ConvertedClip } from "./convert/clip.ts";
import { writeAnimationFbx, type FaceExport } from "./fbx/animationFbx.ts";
import { remapNames, type NameScheme } from "./convert/skeleton.ts";
import { sanitizeFilename, downloadBytes } from "./fbx/export.ts";
import { PreviewScene } from "./preview/scene.ts";
import { loadFaceMeshData, toFacecapName } from "./preview/face.ts";
import type { ResampledClip } from "./convert/clip.ts";

const emptyState = document.getElementById("empty-state") as HTMLElement;
const loadedState = document.getElementById("loaded-state") as HTMLElement;
const dropzone = document.getElementById("dropzone") as HTMLElement;
const fileInput = document.getElementById("file-input") as HTMLInputElement;
const errorEl = document.getElementById("empty-error") as HTMLElement;
const viewport = document.getElementById("viewport") as HTMLElement;
const panel = document.getElementById("panel") as HTMLElement;

let preview: PreviewScene | null = null;
let loaded: { name: string; clip: WanimClip; converted: ConvertedClip } | null = null;

function showError(message: string) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

/** Pair recorded ARKit weight tracks with the facecap morph deltas by name. */
function buildFaceExport(
  resampled: ResampledClip,
  mesh: Awaited<ReturnType<typeof loadFaceMeshData>>,
): FaceExport {
  const channels: FaceExport["channels"] = [];
  resampled.face!.names.forEach((name, n) => {
    const deltas = mesh.morphs[toFacecapName(name)];
    if (!deltas) return; // no matching morph on the head (e.g. trackingStatus)
    const weights = resampled.face!.tracks[n];
    let moved = 0;
    for (let i = 0; i < weights.length; i++) moved = Math.max(moved, Math.abs(weights[i]));
    if (moved < 0.01) return; // skip channels that never animate
    channels.push({ name, deltas, weights });
  });
  return {
    positions: mesh.positions,
    indices: mesh.indices,
    center: mesh.center,
    height: mesh.height,
    channels,
  };
}

function fmtTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, "0")}`;
}

function buildPanel(name: string, clip: WanimClip, converted: ConvertedClip) {
  const frames = clip.times.length;
  const fps = converted.duration > 0 ? (frames - 1) / converted.duration : 0;
  const blendshapeNames = new Set<string>();
  for (const ch of clip.characters) {
    for (const framesArr of Object.values(ch.blendshapes)) {
      for (const key of Object.keys(framesArr[0] ?? {})) blendshapeNames.add(key);
    }
  }

  const rows: [string, string][] = [
    ["File", name],
    ["Characters", String(clip.characters.length)],
    ["Frames", String(frames)],
    ["Duration", fmtTime(converted.duration)],
    ["Average rate", `${fps.toFixed(1)} fps`],
    ["Bones", `${BONE_COUNT} (Unity humanoid)`],
    ["Blendshapes", blendshapeNames.size ? String(blendshapeNames.size) : "none"],
  ];

  panel.innerHTML = `
    <h2>${name}</h2>
    <div class="transport">
      <button id="play" class="button" aria-label="Play/pause">⏸ Pause</button>
      <input id="scrub" class="scrub" type="range" min="0" max="1000" value="0" />
      <span id="timecode" class="timecode">0:00.00</span>
    </div>
    <dl class="stats">
      ${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}
    </dl>
    <label class="field">
      <span>Export frame rate</span>
      <select id="fps">
        <option value="30">30 fps</option>
        <option value="60" selected>60 fps</option>
        <option value="120">120 fps</option>
      </select>
    </label>
    <label class="field">
      <span>Bone names</span>
      <select id="names">
        <option value="unity" selected>Unity (HumanBodyBones)</option>
        <option value="motionbuilder">MotionBuilder / HumanIK</option>
      </select>
    </label>
    <label class="field">
      <span>Rest pose</span>
      <select id="rest">
        <option value="tpose" selected>T-pose</option>
        <option value="first">First frame</option>
      </select>
    </label>
    <label class="field">
      <span>Face blendshapes</span>
      <input id="face" type="checkbox" ${clip.characters[0] && converted.face ? "checked" : "disabled"} />
    </label>
    <button id="download" class="button primary">Download FBX</button>
    <p class="note">The preview head is a stand-in driven by the recorded ARKit
      blendshapes. With <strong>Face blendshapes</strong> on, that head and its
      morph animation are embedded in the FBX; otherwise the FBX is skeleton-only.
      Exports as binary FBX 7.5 (MotionBuilder-compatible). Verify rotation order
      in your DCC; if limbs twist, see the FBX notes.</p>
    <button id="reset" class="button ghost">Load another file</button>
  `;

  const playBtn = document.getElementById("play") as HTMLButtonElement;
  const scrub = document.getElementById("scrub") as HTMLInputElement;
  const timecode = document.getElementById("timecode") as HTMLElement;
  const fpsSel = document.getElementById("fps") as HTMLSelectElement;
  const namesSel = document.getElementById("names") as HTMLSelectElement;
  const restSel = document.getElementById("rest") as HTMLSelectElement;
  const faceChk = document.getElementById("face") as HTMLInputElement;
  const downloadBtn = document.getElementById("download") as HTMLButtonElement;
  const resetBtn = document.getElementById("reset") as HTMLButtonElement;

  let scrubbing = false;

  preview?.setOnState((s) => {
    playBtn.textContent = s.playing ? "⏸ Pause" : "▶ Play";
    timecode.textContent = `${fmtTime(s.time)} / ${fmtTime(s.duration)}`;
    if (!scrubbing && s.duration > 0) {
      scrub.value = String(Math.round((s.time / s.duration) * 1000));
    }
  });

  playBtn.addEventListener("click", () => preview?.togglePlay());
  scrub.addEventListener("input", () => {
    scrubbing = true;
    preview?.pause();
    const frac = Number(scrub.value) / 1000;
    preview?.seek(frac * converted.duration);
  });
  scrub.addEventListener("change", () => {
    scrubbing = false;
  });

  downloadBtn.addEventListener("click", async () => {
    if (!loaded) return;
    downloadBtn.disabled = true;
    downloadBtn.textContent = "Generating…";
    // Yield once so the button repaints before the heavy work.
    await new Promise((r) => setTimeout(r, 16));
    try {
      const fps = Number(fpsSel.value);
      const resampled = resample(loaded.converted, fps);
      const names = remapNames(resampled.names, namesSel.value as NameScheme);
      let face: FaceExport | undefined;
      let headIndex: number | undefined;
      if (faceChk.checked && resampled.face) {
        const mesh = await loadFaceMeshData();
        face = buildFaceExport(resampled, mesh);
        headIndex = resampled.names.indexOf("Head");
      }
      const fbx = writeAnimationFbx(resampled, {
        takeName: sanitizeFilename(loaded.name),
        names,
        tposeRest: restSel.value === "tpose",
        face,
        headIndex,
      });
      downloadBytes(`${sanitizeFilename(loaded.name)}.fbx`, fbx);
    } catch (err) {
      showError(err instanceof Error ? err.message : String(err));
    } finally {
      downloadBtn.disabled = false;
      downloadBtn.textContent = "Download FBX";
    }
  });

  resetBtn.addEventListener("click", () => {
    loadedState.hidden = true;
    emptyState.hidden = false;
    errorEl.hidden = true;
    loaded = null;
  });
}

async function handleFile(file: File) {
  errorEl.hidden = true;
  if (!file.name.toLowerCase().endsWith(".wanim")) {
    showError(`"${file.name}" is not a .wanim file.`);
    return;
  }
  try {
    const clip = parseWanim(await file.arrayBuffer());
    if (clip.characters.length === 0) {
      showError("This recording contains no characters.");
      return;
    }
    const converted = convertCharacter(clip, 0);
    loaded = { name: file.name, clip, converted };

    emptyState.hidden = true;
    loadedState.hidden = false;

    if (!preview) preview = new PreviewScene(viewport);
    preview.setClip(converted);
    buildPanel(file.name, clip, converted);
  } catch (err) {
    showError(err instanceof Error ? err.message : String(err));
  }
}

dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") fileInput.click();
});
fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) void handleFile(file);
  fileInput.value = "";
});

for (const evt of ["dragover", "dragenter"] as const) {
  document.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add("dragging");
  });
}
for (const evt of ["dragleave", "dragend"] as const) {
  document.addEventListener(evt, () => dropzone.classList.remove("dragging"));
}
document.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragging");
  const file = e.dataTransfer?.files?.[0];
  if (file) void handleFile(file);
});
