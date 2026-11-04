/**
 * Scenes: the hand-drawn notes and labelled 3D models the tutor can show. `sanitizeScene` checks the
 * model's JSON before anything is drawn, and `scenePrompt` tells the model how to write one. Pure
 * TypeScript, so Node can run its tests.
 */

import type { DiagramItem, DiagramScene, Label3D, Model3DScene, Part, Scene, Tone } from "./contracts";

/** Bumped when the scene prompt or the scene format changes. */
export const SCENE_PROMPT_VERSION = 1;

/* ------------------------------------------------------------------ examples */

/** Two rows: a tensor and its target, then a pair and the value it gives. */
export const EXAMPLE_DIAGRAM: DiagramScene = {
  type: "diagram",
  title: "Tensors and targets",
  items: [
    { id: "input", kind: "box", x: 22, y: 32, w: 28, h: 24, text: "[18]", tone: "blue", caption: "Input tensor" },
    { id: "to-target", kind: "arrow", from: "input", to: "target" },
    { id: "target", kind: "box", x: 78, y: 32, w: 28, h: 24, text: "47", tone: "rose", caption: "Target: known answer" },
    { id: "pair", kind: "box", x: 22, y: 74, w: 28, h: 20, text: "[18, 47]", tone: "lilac" },
    { id: "to-result", kind: "arrow", from: "pair", to: "result" },
    { id: "result", kind: "box", x: 78, y: 74, w: 28, h: 20, text: "56", tone: "mint" },
  ],
  order: ["input", "to-target", "target", "pair", "to-result", "result"],
  footnote: "Both can be tensors",
};

/**
 * A jet engine cutaway along x: the fan at the front (x = -6), the nozzle at the rear (x = 6) and a
 * casing about 2.2 out from the axis. The combustor ring is a torus round the x axis. For a cone,
 * radiusBottom is the radius at the low x end and radiusTop the radius at the high one.
 */
export const EXAMPLE_JET: Model3DScene = {
  type: "model3d",
  title: "Jet engine cutaway",
  parts: [
    { id: "nacelle", shape: "cylinder", pos: [0, 0, 0], length: 12, radiusTop: 2.2, open: true, tone: "ink", opacity: 0.25 },
    { id: "shaft", shape: "cylinder", pos: [0, 0, 0], length: 12, radiusTop: 0.3, tone: "ink" },
    { id: "spinner", shape: "cylinder", pos: [-5.5, 0, 0], length: 1, radiusTop: 1, radiusBottom: 0.2, tone: "rose" },
    { id: "fan", shape: "blades", pos: [-4.6, 0, 0], count: 18, innerRadius: 0.55, outerRadius: 2.05, thickness: 0.22, tone: "blue" },
    { id: "fan-hub", shape: "cylinder", pos: [-4.6, 0, 0], length: 0.5, radiusTop: 0.55, tone: "ink" },
    { id: "comp-1", shape: "blades", pos: [-3.2, 0, 0], count: 24, innerRadius: 0.95, outerRadius: 1.9, thickness: 0.2, tone: "mint" },
    { id: "disc-1", shape: "cylinder", pos: [-2.6, 0, 0], length: 0.25, radiusTop: 0.95, tone: "ink" },
    { id: "comp-2", shape: "blades", pos: [-2, 0, 0], count: 24, innerRadius: 0.85, outerRadius: 1.7, thickness: 0.2, tone: "mint" },
    { id: "disc-2", shape: "cylinder", pos: [-1.4, 0, 0], length: 0.25, radiusTop: 0.85, tone: "ink" },
    { id: "comp-3", shape: "blades", pos: [-0.8, 0, 0], count: 24, innerRadius: 0.75, outerRadius: 1.5, thickness: 0.2, tone: "mint" },
    { id: "combustor-ring", shape: "torus", pos: [-0.2, 0, 0], radius: 1.6, tube: 0.15, tone: "sand" },
    { id: "combustor", shape: "cylinder", pos: [1, 0, 0], length: 2.4, radiusTop: 1.6, open: true, tone: "sand" },
    { id: "turbine", shape: "blades", pos: [2.7, 0, 0], count: 20, innerRadius: 0.9, outerRadius: 1.8, thickness: 0.22, tone: "lilac" },
    { id: "turbine-disc", shape: "cylinder", pos: [3.3, 0, 0], length: 0.3, radiusTop: 0.9, tone: "ink" },
    { id: "nozzle", shape: "cylinder", pos: [5.4, 0, 0], length: 1.2, radiusTop: 0.9, radiusBottom: 2, tone: "ink" },
  ],
  labels: [
    { n: 1, text: "Fan", target: "fan" },
    { n: 2, text: "Compressor", target: "comp-2" },
    { n: 3, text: "Combustor", target: "combustor" },
    { n: 4, text: "Turbine", target: "turbine" },
  ],
  cutaway: true,
  spin: true,
};

/* ------------------------------------------------------------------ sanitizing */

const TONES: readonly Tone[] = ["blue", "rose", "mint", "sand", "lilac", "ink"];
const TEXT_SIZES = ["title", "body", "note"] as const;
const TITLE_MAX = 60;
const SHORT_MAX = 60;
const NOTE_TEXT_MAX = 80;
const LABEL_TEXT_MAX = 28;
const MAX_ITEMS = 24;
const MAX_PARTS = 60;
const MAX_LABELS = 8;
const COORD_LIMIT = 12;
const SIZE_MIN = 0.02;
const MIN_OPACITY = 0.05;

type Json = Record<string, unknown>;

const record = (value: unknown): Json | null =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Json) : null;
const listOf = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const present = <T>(value: T | null): value is T => value !== null;
const idOf = (value: unknown): string | null => (typeof value === "string" && value.trim() !== "" ? value : null);
const toneOf = (value: unknown): Tone | undefined => TONES.find((tone) => tone === value);

/** A finite number, or a numeric string such as "2.5". Anything else is null. */
function numberOf(value: unknown): number | null {
  const found = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof found === "number" && Number.isFinite(found) ? found : null;
}

/** numberOf, clamped to min..max. */
function within(value: unknown, min: number, max: number): number | null {
  const found = numberOf(value);
  return found === null ? null : Math.min(Math.max(found, min), max);
}

/** Exactly three numbers, each clamped to min..max. */
function triple(value: unknown, min: number, max: number): [number, number, number] | null {
  if (!Array.isArray(value) || value.length !== 3) return null;
  const [x, y, z] = value.map((part) => within(part, min, max));
  return x === null || y === null || z === null ? null : [x, y, z];
}

/** Trimmed text cut to max characters. A finite number is written out. Blank text is null. */
function textOf(value: unknown, max: number): string | null {
  const found = typeof value === "number" && Number.isFinite(value) ? String(value) : value;
  if (typeof found !== "string") return null;
  const cut = found.trim().slice(0, max).trim();
  return cut === "" ? null : cut;
}

/** Keeps the first entry for each id, so a repeated id drops the later copies. */
function unique<T extends { id: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter((entry) => {
    if (seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
}

/* Notes: boxes and words are nodes. Arrows join two nodes and highlights ring one. */

const isNode = (item: DiagramItem): boolean => item.kind === "box" || item.kind === "text";

/** Keeps an arrow only while both its ends are nodes, and a highlight only while its target is. */
function linked(items: DiagramItem[]): DiagramItem[] {
  const nodes = new Set(items.filter(isNode).map((item) => item.id));
  return items.filter((item) => {
    if (item.kind === "arrow") return nodes.has(item.from) && nodes.has(item.to);
    if (item.kind === "highlight") return nodes.has(item.target);
    return true;
  });
}

/** One item with its own fields checked. Its links are checked later, once every id is known. */
function diagramItemOf(raw: unknown): DiagramItem | null {
  const entry = record(raw);
  const id = idOf(entry?.id);
  if (!entry || id === null) return null;
  switch (entry.kind) {
    case "box": {
      const x = within(entry.x, 0, 100);
      const y = within(entry.y, 0, 100);
      const w = within(entry.w, 6, 60);
      const h = within(entry.h, 6, 60);
      const text = textOf(entry.text, NOTE_TEXT_MAX);
      if (x === null || y === null || w === null || h === null || text === null) return null;
      const tone = toneOf(entry.tone);
      const caption = textOf(entry.caption, SHORT_MAX);
      return { id, kind: "box", x, y, w, h, text, ...(tone ? { tone } : {}), ...(caption ? { caption } : {}) };
    }
    case "text": {
      const x = within(entry.x, 0, 100);
      const y = within(entry.y, 0, 100);
      const text = textOf(entry.text, NOTE_TEXT_MAX);
      if (x === null || y === null || text === null) return null;
      const size = TEXT_SIZES.find((known) => known === entry.size);
      return { id, kind: "text", x, y, text, ...(size ? { size } : {}) };
    }
    case "arrow": {
      const from = typeof entry.from === "string" ? entry.from : null;
      const to = typeof entry.to === "string" ? entry.to : null;
      if (from === null || to === null) return null;
      const label = textOf(entry.label, SHORT_MAX);
      return { id, kind: "arrow", from, to, ...(label ? { label } : {}) };
    }
    case "highlight": {
      const target = typeof entry.target === "string" ? entry.target : null;
      return target === null ? null : { id, kind: "highlight", target };
    }
    default:
      return null;
  }
}

/** A note with its items, links and order checked. Null when no box or word survives. */
function diagramOf(raw: Json): DiagramScene | null {
  const items = unique(listOf(raw.items).map(diagramItemOf).filter(present));
  // The cap runs twice: a second link pass drops arrows whose box was cut off by it.
  const kept = linked(linked(items).slice(0, MAX_ITEMS));
  if (!kept.some(isNode)) return null;
  const ids = new Set(kept.map((item) => item.id));
  const scene: DiagramScene = { type: "diagram", title: textOf(raw.title, TITLE_MAX) ?? "", items: kept };
  const footnote = textOf(raw.footnote, SHORT_MAX);
  if (footnote) scene.footnote = footnote;
  if (Array.isArray(raw.order)) {
    const listed = listOf(raw.order).filter((id): id is string => typeof id === "string" && ids.has(id));
    scene.order = [...new Set(listed)];
  }
  return scene;
}

/* Models: parts are primitives, labels point at a part id or a point. */

/** One part with its own fields checked. A bad optional field is left out; a bad required one drops the part. */
function partOf(raw: unknown): Part | null {
  const entry = record(raw);
  if (!entry) return null;
  const id = idOf(entry.id);
  const pos = triple(entry.pos, -COORD_LIMIT, COORD_LIMIT);
  if (id === null || pos === null) return null;
  const tone = toneOf(entry.tone);
  const opacity = within(entry.opacity, MIN_OPACITY, 1);
  const paint = { ...(tone ? { tone } : {}), ...(opacity === null ? {} : { opacity }) };
  const rot = triple(entry.rot, -COORD_LIMIT, COORD_LIMIT);
  const turn = rot ? { rot } : {};
  switch (entry.shape) {
    case "box": {
      const size = triple(entry.size, SIZE_MIN, COORD_LIMIT);
      return size ? { id, shape: "box", pos, size, ...turn, ...paint } : null;
    }
    case "sphere": {
      const radius = within(entry.radius, SIZE_MIN, COORD_LIMIT);
      return radius === null ? null : { id, shape: "sphere", pos, radius, ...paint };
    }
    case "cylinder": {
      const length = within(entry.length, SIZE_MIN, COORD_LIMIT);
      const radiusTop = within(entry.radiusTop, SIZE_MIN, COORD_LIMIT);
      if (length === null || radiusTop === null) return null;
      const radiusBottom = within(entry.radiusBottom, SIZE_MIN, COORD_LIMIT);
      return {
        id,
        shape: "cylinder",
        pos,
        length,
        radiusTop,
        ...(radiusBottom === null ? {} : { radiusBottom }),
        ...(typeof entry.open === "boolean" ? { open: entry.open } : {}),
        ...turn,
        ...paint,
      };
    }
    case "torus": {
      const radius = within(entry.radius, SIZE_MIN, COORD_LIMIT);
      const tube = within(entry.tube, SIZE_MIN, COORD_LIMIT);
      return radius === null || tube === null ? null : { id, shape: "torus", pos, radius, tube, ...turn, ...paint };
    }
    case "blades": {
      const count = within(entry.count, 3, 48);
      const innerRadius = within(entry.innerRadius, SIZE_MIN, COORD_LIMIT);
      const outerRadius = within(entry.outerRadius, SIZE_MIN, COORD_LIMIT);
      const thickness = within(entry.thickness, SIZE_MIN, COORD_LIMIT);
      if (count === null || innerRadius === null || outerRadius === null || thickness === null) return null;
      const twist = within(entry.twist, -COORD_LIMIT, COORD_LIMIT);
      return {
        id,
        shape: "blades",
        pos,
        count: Math.round(count),
        innerRadius,
        outerRadius,
        thickness,
        ...(twist === null ? {} : { twist }),
        ...(tone ? { tone } : {}),
      };
    }
    default:
      return null;
  }
}

/** A part id that exists, or an [x, y, z] point clamped to the model's range. */
function targetOf(value: unknown, partIds: ReadonlySet<string>): Label3D["target"] | null {
  if (typeof value === "string") return partIds.has(value) ? value : null;
  return triple(value, -COORD_LIMIT, COORD_LIMIT);
}

/** One label with its number, text and target checked. labelsOf renumbers the survivors. */
function labelOf(raw: unknown, partIds: ReadonlySet<string>): Label3D | null {
  const entry = record(raw);
  if (!entry) return null;
  const n = numberOf(entry.n);
  const text = textOf(entry.text, LABEL_TEXT_MAX);
  const target = targetOf(entry.target, partIds);
  if (n === null || !Number.isInteger(n) || n < 1 || n > MAX_LABELS || text === null || target === null) return null;
  const tone = toneOf(entry.tone);
  return { n, text, target, ...(tone ? { tone } : {}) };
}

/** The labels that survive, in n order, at most 8, numbered 1 to k. */
function labelsOf(raw: unknown, partIds: ReadonlySet<string>): Label3D[] {
  return listOf(raw)
    .map((entry) => labelOf(entry, partIds))
    .filter(present)
    .sort((a, b) => a.n - b.n)
    .slice(0, MAX_LABELS)
    .map((label, index) => ({ ...label, n: index + 1 }));
}

/** A model with its parts and labels checked. Null when no part survives. */
function model3dOf(raw: Json): Model3DScene | null {
  const parts = unique(listOf(raw.parts).map(partOf).filter(present)).slice(0, MAX_PARTS);
  if (parts.length === 0) return null;
  const scene: Model3DScene = {
    type: "model3d",
    title: textOf(raw.title, TITLE_MAX) ?? "",
    parts,
    labels: labelsOf(raw.labels, new Set(parts.map((part) => part.id))),
  };
  if (typeof raw.cutaway === "boolean") scene.cutaway = raw.cutaway;
  if (typeof raw.spin === "boolean") scene.spin = raw.spin;
  return scene;
}

/**
 * A clean copy of a scene from parsed JSON, or null when it is not a usable note or model. Never
 * throws and never changes its input. Numbers are clamped, bad optional fields are left out, broken
 * references are removed and every list is capped.
 */
export function sanitizeScene(raw: unknown): Scene | null {
  try {
    const entry = record(raw);
    if (!entry) return null;
    if (entry.type === "diagram") return diagramOf(entry);
    if (entry.type === "model3d") return model3dOf(entry);
    return null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ prompt */

/** The drawing rules a system prompt can append. The worked example at the end is checked by the tests. */
const SCENE_PROMPT = `DRAWINGS (optional)
Draw only when a picture helps explain a concept, a mechanism, a structure, a process or a comparison. Never for a plain fact or a yes or no answer. At most one drawing per reply.
Put it in the reply JSON field "scene", or null when no drawing helps.

"diagram" is a hand-drawn note:
{"type": "diagram", "title": text, "items": [...], "order": [item ids in draw order], "footnote": text}
Title max 60 characters. "order" and "footnote" (max 60) are optional. Each item has a unique "id" and a "kind":
- "box": "x" and "y" are its centre, 0 to 100 across the paper from the top left. "w" and "h" are 6 to 60. "text" max 80. Optional "tone" and "caption" (max 60).
- "text": "x" and "y" place it, 0 to 100. "text" max 80. Optional "size": "title", "body" or "note".
- "arrow": "from" and "to" name a box or text item, never another arrow. Optional "label" (max 60).
- "highlight": "target" names a box or text item, which gets a marker ring.
Every id an arrow or highlight names must exist. The paper is wider than it is tall.

"model3d" is a labelled 3D model built from a few shapes:
{"type": "model3d", "title": text, "parts": [...], "labels": [...], "cutaway": true, "spin": true}
Title max 60 characters. "cutaway" slices away the front half so the inside shows. "spin" (default true) turns the model.
The long axis is x, up is y, and z points at the viewer. Keep every number between -12 and 12.
Each part has a unique "id", a "shape", "pos": [x, y, z] and an optional "tone". All but blades may have "opacity" (0.05 to 1).
- "box": "size": [w, h, d], each 0.02 to 12.
- "sphere": "radius", 0.02 to 12.
- "cylinder": "length" and "radiusTop", each 0.02 to 12. For a cone add "radiusBottom", the radius at the low x end (radiusTop is the high end). "open": true makes a tube with no caps. It runs along x unless "rot" turns it.
- "torus": "radius" and "tube", each 0.02 to 12. A ring round the x axis unless "rot" turns it.
- "blades": "count" (3 to 48), "innerRadius", "outerRadius" and "thickness", each 0.02 to 12. A ring of flat blades round the x axis, like a fan.
"rot" is [x, y, z] in radians, for box, cylinder and torus only.
Each label has "n" (1 to 8), "text" (max 28 characters) and "target": a part id or an [x, y, z] point.

Tones: blue, rose, mint, sand, lilac, ink.

Advice:
- A note has 3 to 7 items, one idea each. A model has 8 to 18 parts. Label at most 4 to 6 things.
- Keep every text short, in plain English.

Worked example, a note with 3 items:
{"type": "diagram", "title": "Input", "items": [{"id": "in", "kind": "box", "x": 22, "y": 50, "w": 28, "h": 24, "text": "[18]", "tone": "blue"}, {"id": "go", "kind": "arrow", "from": "in", "to": "out"}, {"id": "out", "kind": "box", "x": 78, "y": 50, "w": 28, "h": 24, "text": "56", "tone": "mint"}]}`;

/** The section a system prompt appends to describe when and how to draw a scene. */
export function scenePrompt(): string {
  return SCENE_PROMPT;
}
