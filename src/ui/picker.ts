// Schematic body-map picker (MoBu Character Controls / UE Control Rig style):
// a flat SVG silhouette whose regions select the same effectors the viewport
// handles do. It shows per-effector state at a glance (keyed dot, pinned ring,
// IK/FK tint), scopes the channel tree on a limb click, and opens a finger
// sub-picker (with the hand-pose sliders) on a hand click.

import { EFFECTORS, effectorColor, effectorForBone, limbForEffector, type EffectorId, type IkfkBlend } from "../rig/rig.ts";

const NS = "http://www.w3.org/2000/svg";

/** Front-view schematic positions (viewer-left = character-left, blue). */
const NODES: Array<{ id: EffectorId; x: number; y: number; r?: number }> = [
  { id: "head", x: 70, y: 22, r: 9 },
  { id: "neck", x: 70, y: 40 },
  { id: "chest", x: 70, y: 58 },
  { id: "spine", x: 70, y: 78 },
  { id: "hips", x: 70, y: 98, r: 8 },
  { id: "leftShoulder", x: 55, y: 50 },
  { id: "rightShoulder", x: 85, y: 50 },
  { id: "leftUpperArm", x: 45, y: 64 },
  { id: "rightUpperArm", x: 95, y: 64 },
  { id: "leftLowerArm", x: 37, y: 88 },
  { id: "rightLowerArm", x: 103, y: 88 },
  { id: "leftHand", x: 31, y: 112, r: 7 },
  { id: "rightHand", x: 109, y: 112, r: 7 },
  { id: "leftUpperLeg", x: 59, y: 126 },
  { id: "rightUpperLeg", x: 81, y: 126 },
  { id: "leftLowerLeg", x: 55, y: 166 },
  { id: "rightLowerLeg", x: 85, y: 166 },
  { id: "leftFoot", x: 53, y: 200, r: 7 },
  { id: "rightFoot", x: 87, y: 200, r: 7 },
  { id: "leftToes", x: 51, y: 214 },
  { id: "rightToes", x: 89, y: 214 },
];

/** Bones drawn as static links (by node id) for the silhouette skeleton. */
const LINKS: Array<[EffectorId, EffectorId]> = [
  ["head", "neck"], ["neck", "chest"], ["chest", "spine"], ["spine", "hips"],
  ["neck", "leftShoulder"], ["leftShoulder", "leftUpperArm"], ["leftUpperArm", "leftLowerArm"], ["leftLowerArm", "leftHand"],
  ["neck", "rightShoulder"], ["rightShoulder", "rightUpperArm"], ["rightUpperArm", "rightLowerArm"], ["rightLowerArm", "rightHand"],
  ["hips", "leftUpperLeg"], ["leftUpperLeg", "leftLowerLeg"], ["leftLowerLeg", "leftFoot"], ["leftFoot", "leftToes"],
  ["hips", "rightUpperLeg"], ["rightUpperLeg", "rightLowerLeg"], ["rightLowerLeg", "rightFoot"], ["rightFoot", "rightToes"],
];

export interface PickerState {
  /** Bones with a key on the ACTIVE layer (drives the "has keys" dot). */
  keyedBones: Set<string>;
  pinned: Set<EffectorId>;
  ikfk: IkfkBlend;
  selected: EffectorId | null;
  /** Bone names present in the clip (drop controls for absent bones). */
  present: Set<string>;
}

export interface PickerCallbacks {
  /** Select an effector (same as clicking a viewport handle). */
  onSelect(id: EffectorId): void;
  /** A hand was clicked — open the finger sub-picker for this side. */
  onHand(side: "Left" | "Right"): void;
  /** A finger segment button was clicked. */
  onFinger(bone: string): void;
  /** Right-click a limb region — toggle its world pin. */
  onPin(id: EffectorId): void;
}

const FINGERS = ["Thumb", "Index", "Middle", "Ring", "Little"];
const SEGMENTS = ["Proximal", "Intermediate", "Distal"];

export class RigPicker {
  readonly el: HTMLDivElement;
  private svg: SVGSVGElement;
  private sub: HTMLDivElement;
  private nodes = new Map<EffectorId, SVGGElement>();
  private cbs: PickerCallbacks;
  private state: PickerState = { keyedBones: new Set(), pinned: new Set(), ikfk: { leftArm: 1, rightArm: 1, leftLeg: 1, rightLeg: 1 }, selected: null, present: new Set() };

  constructor(cbs: PickerCallbacks) {
    this.cbs = cbs;
    this.el = document.createElement("div");
    this.el.className = "rig-picker";
    this.svg = document.createElementNS(NS, "svg");
    this.svg.setAttribute("viewBox", "0 0 140 226");
    this.svg.setAttribute("class", "picker-svg");
    // Links first (under the nodes).
    for (const [a, b] of LINKS) {
      const na = NODES.find((n) => n.id === a)!, nb = NODES.find((n) => n.id === b)!;
      const line = document.createElementNS(NS, "line");
      line.setAttribute("x1", String(na.x)); line.setAttribute("y1", String(na.y));
      line.setAttribute("x2", String(nb.x)); line.setAttribute("y2", String(nb.y));
      line.setAttribute("class", "picker-link");
      this.svg.appendChild(line);
    }
    for (const n of NODES) {
      const g = document.createElementNS(NS, "g");
      g.setAttribute("class", "picker-node");
      const hit = document.createElementNS(NS, "circle");
      hit.setAttribute("cx", String(n.x)); hit.setAttribute("cy", String(n.y));
      hit.setAttribute("r", String((n.r ?? 5) + 2));
      hit.setAttribute("class", "picker-hit");
      const dot = document.createElementNS(NS, "circle");
      dot.setAttribute("cx", String(n.x)); dot.setAttribute("cy", String(n.y));
      dot.setAttribute("r", String(n.r ?? 5));
      dot.setAttribute("fill", effectorColor(n.id));
      dot.setAttribute("class", "picker-dot");
      // Keyed marker (a small inner ring), hidden by default.
      const key = document.createElementNS(NS, "circle");
      key.setAttribute("cx", String(n.x)); key.setAttribute("cy", String(n.y - (n.r ?? 5) - 3));
      key.setAttribute("r", "2");
      key.setAttribute("class", "picker-key");
      g.append(hit, dot, key);
      g.addEventListener("click", () => {
        const side = n.id === "leftHand" ? "Left" : n.id === "rightHand" ? "Right" : null;
        this.cbs.onSelect(n.id);
        if (side) this.cbs.onHand(side);
      });
      g.addEventListener("contextmenu", (e) => { e.preventDefault(); this.cbs.onPin(n.id); });
      const title = document.createElementNS(NS, "title");
      title.textContent = EFFECTORS.find((eff) => eff.id === n.id)?.label ?? n.id;
      g.appendChild(title);
      this.svg.appendChild(g);
      this.nodes.set(n.id, g);
    }
    this.sub = document.createElement("div");
    this.sub.className = "picker-sub";
    this.sub.hidden = true;
    this.el.append(this.svg, this.sub);
  }

  /** Open the finger sub-picker for a hand side (segment select buttons). */
  openFingers(side: "Left" | "Right") {
    this.sub.hidden = false;
    this.sub.innerHTML = "";
    const head = document.createElement("div");
    head.className = "clean-stats";
    head.style.margin = "2px 0";
    head.textContent = `${side} fingers`;
    this.sub.appendChild(head);
    for (const finger of FINGERS) {
      const row = document.createElement("div");
      row.className = "picker-finger-row";
      const name = document.createElement("span");
      name.textContent = finger;
      row.appendChild(name);
      let any = false;
      for (let s = 0; s < SEGMENTS.length; s++) {
        const bone = `${side}${finger}${SEGMENTS[s]}`;
        if (!this.state.present.has(bone)) continue;
        any = true;
        const btn = document.createElement("button");
        btn.className = "button ghost picker-seg";
        btn.textContent = String(s + 1);
        btn.title = bone;
        if (this.state.selected === effectorForBone(bone)?.id) btn.classList.add("active");
        btn.addEventListener("click", () => this.cbs.onFinger(bone));
        row.appendChild(btn);
      }
      if (any) this.sub.appendChild(row);
    }
  }

  closeFingers() {
    this.sub.hidden = true;
  }

  update(state: PickerState) {
    this.state = state;
    for (const n of NODES) {
      const g = this.nodes.get(n.id);
      if (!g) continue;
      const def = EFFECTORS.find((e) => e.id === n.id);
      const absent = def ? !state.present.has(def.bone) : true;
      g.classList.toggle("absent", absent);
      g.classList.toggle("sel", state.selected === n.id);
      g.classList.toggle("pinned", state.pinned.has(n.id));
      const keyed = def ? state.keyedBones.has(def.bone) : false;
      g.classList.toggle("keyed", keyed);
      const limb = limbForEffector(n.id);
      g.classList.toggle("fk", !!limb && state.ikfk[limb] <= 0);
    }
    // Refresh the finger sub-picker's active button if it's open.
    if (!this.sub.hidden) {
      const activeSide = this.sub.querySelector(".clean-stats")?.textContent?.startsWith("Left") ? "Left" : "Right";
      this.openFingers(activeSide as "Left" | "Right");
    }
  }
}
