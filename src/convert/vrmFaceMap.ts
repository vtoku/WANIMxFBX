// ARKit → VRM-preset blendshape synthesis. Perfect-sync VRMs carry the ARKit
// names directly and match 1:1; standard VRMs only have the VRM 0.x presets
// (A/I/U/E/O, Blink, Look_*) or VRoid Fcl_* shapes. This derives those preset
// tracks from the recorded ARKit weights using the canonical mapping VTuber
// apps use for fallback lipsync/blinks.

export interface FaceTracks {
  names: string[];
  tracks: Float32Array[];
}

const SYNTH: { name: string; sources: string[]; aliases: string[] }[] = [
  { name: "A", sources: ["jawOpen"], aliases: ["Fcl_MTH_A"] },
  { name: "I", sources: ["mouthStretchLeft", "mouthStretchRight"], aliases: ["Fcl_MTH_I"] },
  { name: "U", sources: ["mouthPucker"], aliases: ["Fcl_MTH_U"] },
  { name: "O", sources: ["mouthFunnel"], aliases: ["Fcl_MTH_O"] },
  { name: "Blink", sources: ["eyeBlinkLeft", "eyeBlinkRight"], aliases: ["Fcl_EYE_Close"] },
  { name: "Blink_L", sources: ["eyeBlinkLeft"], aliases: ["Fcl_EYE_Close_L"] },
  { name: "Blink_R", sources: ["eyeBlinkRight"], aliases: ["Fcl_EYE_Close_R"] },
  { name: "Look_Up", sources: ["eyeLookUpLeft", "eyeLookUpRight"], aliases: [] },
  { name: "Look_Down", sources: ["eyeLookDownLeft", "eyeLookDownRight"], aliases: [] },
  { name: "Look_Left", sources: ["eyeLookOutLeft", "eyeLookInRight"], aliases: [] },
  { name: "Look_Right", sources: ["eyeLookInLeft", "eyeLookOutRight"], aliases: [] },
];

/**
 * Returns the recorded tracks plus synthesized VRM-preset tracks (skipping any
 * name the recording already provides). Cheap; safe to apply for any body.
 */
export function augmentFaceForVrm(face: FaceTracks): FaceTracks {
  const names = [...face.names];
  const tracks = [...face.tracks];
  const have = new Set(names.map((n) => n.toLowerCase()));
  const trackOf = (n: string): Float32Array | null => {
    const i = face.names.findIndex((x) => x.toLowerCase() === n.toLowerCase());
    return i >= 0 ? face.tracks[i] : null;
  };
  for (const s of SYNTH) {
    const sources = s.sources.map(trackOf).filter((t): t is Float32Array => t !== null);
    if (sources.length === 0) continue;
    let synth: Float32Array | null = null;
    for (const target of [s.name, ...s.aliases]) {
      if (have.has(target.toLowerCase())) continue;
      if (!synth) {
        synth = new Float32Array(sources[0].length);
        for (const src of sources) for (let i = 0; i < synth.length; i++) synth[i] += src[i];
        if (sources.length > 1) for (let i = 0; i < synth.length; i++) synth[i] /= sources.length;
      }
      names.push(target);
      tracks.push(synth);
      have.add(target.toLowerCase());
    }
  }
  return { names, tracks };
}
