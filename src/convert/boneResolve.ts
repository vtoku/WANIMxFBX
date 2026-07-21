// Bone-name resolution families, factored out of convert/body.ts so both the
// body-mesh retarget AND the FBX importer resolve source bone names to Unity
// HumanBodyBones names the same way. A re-imported file that WE exported (Unity
// or HumanIK names) maps 1:1; Mixamo / Rigify / Quaternius-modular rigs
// map through the known naming families below.

import { HUMAN_BODY_BONES } from "../wanim/parse.ts";
import { MOTIONBUILDER_NAMES } from "./skeleton.ts";

/** Strip Mixamo/Rigify prefixes and separators from a raw bone-node name. */
export function normalizeBoneName(raw: string): string {
  return raw.replace(/^mixamorig:?/, "").replace(/^DEF-/, "").replace(/[. ]/g, "");
}

// Rigify-style names (Quaternius) -> Unity HumanBodyBones names.
const RIGIFY_MAP: Record<string, string> = {
  hips: "Hips",
  spine001: "Spine",
  spine002: "Chest",
  spine003: "UpperChest",
  neck: "Neck",
  head: "Head",
  shoulderL: "LeftShoulder",
  upper_armL: "LeftUpperArm",
  forearmL: "LeftLowerArm",
  handL: "LeftHand",
  thumb01L: "LeftThumbProximal",
  thumb02L: "LeftThumbIntermediate",
  thumb03L: "LeftThumbDistal",
  f_index01L: "LeftIndexProximal",
  f_index02L: "LeftIndexIntermediate",
  f_index03L: "LeftIndexDistal",
  f_middle01L: "LeftMiddleProximal",
  f_middle02L: "LeftMiddleIntermediate",
  f_middle03L: "LeftMiddleDistal",
  f_ring01L: "LeftRingProximal",
  f_ring02L: "LeftRingIntermediate",
  f_ring03L: "LeftRingDistal",
  f_pinky01L: "LeftLittleProximal",
  f_pinky02L: "LeftLittleIntermediate",
  f_pinky03L: "LeftLittleDistal",
  thighL: "LeftUpperLeg",
  shinL: "LeftLowerLeg",
  footL: "LeftFoot",
  toeL: "LeftToes",
  shoulderR: "RightShoulder",
  upper_armR: "RightUpperArm",
  forearmR: "RightLowerArm",
  handR: "RightHand",
  thumb01R: "RightThumbProximal",
  thumb02R: "RightThumbIntermediate",
  thumb03R: "RightThumbDistal",
  f_index01R: "RightIndexProximal",
  f_index02R: "RightIndexIntermediate",
  f_index03R: "RightIndexDistal",
  f_middle01R: "RightMiddleProximal",
  f_middle02R: "RightMiddleIntermediate",
  f_middle03R: "RightMiddleDistal",
  f_ring01R: "RightRingProximal",
  f_ring02R: "RightRingIntermediate",
  f_ring03R: "RightRingDistal",
  f_pinky01R: "RightLittleProximal",
  f_pinky02R: "RightLittleIntermediate",
  f_pinky03R: "RightLittleDistal",
  thighR: "RightUpperLeg",
  shinR: "RightLowerLeg",
  footR: "RightFoot",
  toeR: "RightToes",
};

// Quaternius "modular" rig names (UpperArmL, WristR, Abdomen, Torso, Index1L…)
// -> Unity HumanBodyBones names.
const MODULAR_BASE: Record<string, string> = {
  Hips: "Hips",
  Abdomen: "Spine",
  Torso: "Chest",
  Chest: "UpperChest",
  Neck: "Neck",
  Head: "Head",
  Shoulder: "Shoulder",
  UpperArm: "UpperArm",
  LowerArm: "LowerArm",
  Wrist: "Hand",
  UpperLeg: "UpperLeg",
  LowerLeg: "LowerLeg",
  Foot: "Foot",
  Toe: "Toes",
  ToeBase: "Toes",
};
const MODULAR_FINGER: Record<string, string> = {
  Thumb: "Thumb",
  Index: "Index",
  Middle: "Middle",
  Ring: "Ring",
  Pinky: "Little",
};
export function modularToUnity(name: string): string | null {
  const side = name.match(/^(.*?)([LR])$/);
  const base = side ? side[1] : name;
  const prefix = side ? (side[2] === "L" ? "Left" : "Right") : "";
  const finger = base.match(/^(Thumb|Index|Middle|Ring|Pinky)([123])$/);
  if (finger && prefix) {
    const seg = ["Proximal", "Intermediate", "Distal"][Number(finger[2]) - 1];
    return `${prefix}${MODULAR_FINGER[finger[1]]}${seg}`;
  }
  const mapped = MODULAR_BASE[base];
  if (!mapped) return null;
  if (/^(Hips|Spine|Chest|UpperChest|Neck|Head)$/.test(mapped)) return prefix ? null : mapped;
  return prefix ? `${prefix}${mapped}` : null;
}

const UNITY_NAME_SET = new Set<string>(HUMAN_BODY_BONES);
// HumanIK name -> Unity HumanBodyBones name (reverse of the
// export map), so an FBX we exported with HumanIK names re-imports 1:1.
const MOBU_REVERSE: Record<string, string> = {};
for (const [unity, mobu] of Object.entries(MOTIONBUILDER_NAMES)) MOBU_REVERSE[mobu] = unity;

/**
 * Resolve a raw source bone-node name to a Unity HumanBodyBones name, trying
 * every known naming family (our own Unity + HumanIK exports, Mixamo, Rigify,
 * Quaternius-modular). Returns null when nothing matches.
 */
export function resolveUnityName(raw: string): string | null {
  const n = normalizeBoneName(raw);
  if (UNITY_NAME_SET.has(n)) return n;
  if (MOBU_REVERSE[n]) return MOBU_REVERSE[n];
  if (RIGIFY_MAP[n]) return RIGIFY_MAP[n];
  return modularToUnity(n);
}
