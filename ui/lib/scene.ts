/**
 * Scenes: the hand-drawn notes and labelled 3D models the tutor can show. `sanitizeScene` checks the
 * model's JSON before anything is drawn, and `scenePrompt` tells the model how to write one. Pure
 * TypeScript, so Node can run its tests.
 */

import type { Angle3D, DiagramItem, DiagramScene, Label3D, Model3DScene, Part, Scene, Tone } from "./contracts";

/** Bumped when the scene prompt or the scene format changes. */
export const SCENE_PROMPT_VERSION = 2;

// @ts-expect-error node strip-types needs the extension
import { angleArc, bondPart } from "./visual-geometry.ts";

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
    { n: 1, text: "Fan", target: "fan", caption: "The fan pulls air in. Most of it flows round the engine and makes the thrust, and the rest goes inside." },
    { n: 2, text: "Compressor", target: "comp-2", caption: "Rings of smaller blades squeeze the air into a tighter space, so it burns hotter and harder." },
    { n: 3, text: "Combustor", target: "combustor", caption: "Fuel is sprayed into the squeezed air and lit. The gas expands and rushes backwards." },
    { n: 4, text: "Turbine", target: "turbine", caption: "The hot gas spins the turbine, which turns the shaft that drives the fan and the compressor." },
  ],
  intro: "A jet engine pulls air in, squeezes it, burns fuel in it and uses the exhaust to push the plane forward.",
  cutaway: true,
  spin: true,
};


/** Ideal AX5 geometry: equatorial 120°, axial/equatorial 90°, axial/axial 180°. */
export const EXAMPLE_TRIGONAL: Model3DScene = {
  type:"model3d",title:"Trigonal bipyramidal",spin:false,
  parts:[
    {id:"centre",shape:"sphere",pos:[0,0,0],radius:0.43,tone:"sand"},
    ...([[2.6,0,0],[-1.3,0,2.251666],[-1.3,0,-2.251666],[0,2.6,0],[0,-2.6,0]] as [number,number,number][]).flatMap((pos,i): Part[] => [
      {id:`atom-${i}`,shape:"sphere",pos,radius:0.38,tone:i<3?"blue":"rose"},
      {...bondPart(`bond-${i}`,[0,0,0],pos,0.09)!,tone:"ink"},
    ]),
  ],
  labels:[
    {n:1,text:"Equatorial",target:"atom-0",caption:"Three bonds share a plane, separated by 120°."},
    {n:2,text:"Axial",target:"atom-3",caption:"Two bonds point above and below that plane, 180° apart."},
  ],
  angles:[
    {id:"90",from:[0,2.6,0],vertex:[0,0,0],to:[2.6,0,0],radius:1,tone:"rose"},
    {id:"120",from:[2.6,0,0],vertex:[0,0,0],to:[-1.3,0,2.251666],radius:1.25,tone:"blue"},
    {id:"180",from:[0,2.6,0],vertex:[0,0,0],to:[0,-2.6,0],radius:1.6,tone:"mint"},
  ],
  intro:"Five bonding domains: three around the equator, one above and one below.",
};

/* ------------------------------------------------------------------ sanitizing */

const TONES: readonly Tone[] = ["blue", "rose", "mint", "sand", "lilac", "ink"];
const TEXT_SIZES = ["title", "body", "note"] as const;
const TITLE_MAX = 60;
const SHORT_MAX = 60;
const NOTE_TEXT_MAX = 80;
const LABEL_TEXT_MAX = 28;
const CAPTION_MAX = 200;
const INTRO_MAX = 160;
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
    case "line":
    case "angle": {
      const point = (v: unknown): [number,number] | null => {
        if (!Array.isArray(v) || v.length !== 2) return null;
        const [x,y]=v.map(n=>within(n,0,100)); return x===null || y===null ? null : [x,y];
      };
      const from=point(entry.from), to=point(entry.to);
      const label=textOf(entry.label,SHORT_MAX); const tone=toneOf(entry.tone);
      if (!from || !to) return null;
      const common={id,from,to,...(label?{label}:{}),...(tone?{tone}:{})};
      if (entry.kind === "line") return {kind:"line",...common};
      const vertex=point(entry.vertex), radius=within(entry.radius,1,30);
      return vertex ? {kind:"angle",...common,vertex,...(radius?{radius}:{})} : null;
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
  if (!kept.some((item) => isNode(item) || item.kind === "line" || item.kind === "angle")) return null;
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
  if (entry.shape === "bond" && id !== null) {
    const from=triple(entry.from,-COORD_LIMIT,COORD_LIMIT), to=triple(entry.to,-COORD_LIMIT,COORD_LIMIT);
    const radius=within(entry.radius ?? 0.08,SIZE_MIN,1);
    const bond=from && to && radius!==null ? bondPart(id,from,to,radius) : null;
    const tone=toneOf(entry.tone);
    return bond ? {...bond,...(tone?{tone}:{})} : null;
  }
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
  const caption = textOf(entry.caption, CAPTION_MAX);
  return { n, text, target, ...(tone ? { tone } : {}), ...(caption ? { caption } : {}) };
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
  const position = (v: unknown) => typeof v === "string" ? parts.find(p=>p.id===v)?.pos ?? null : triple(v,-COORD_LIMIT,COORD_LIMIT);
  const angles = unique(listOf(raw.angles).slice(0,12).flatMap((item): Angle3D[] => {
    const a=record(item); if (!a) return [];
    const id=idOf(a.id),from=position(a.from),vertex=position(a.vertex),to=position(a.to);
    if (!id || !from || !vertex || !to) return [];
    const radius=within(a.radius,0.05,8),tone=toneOf(a.tone);
    const angle:Angle3D={id,from,vertex,to,...(radius?{radius}:{}),...(tone?{tone}:{})};
    return angleArc(angle) ? [angle] : [];
  }));
  if (angles.length) scene.angles=angles;
  if (typeof raw.cutaway === "boolean") scene.cutaway = raw.cutaway;
  const intro = textOf(raw.intro, INTRO_MAX);
  if (intro) scene.intro = intro;
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
const SCENE_PROMPT = `TEACH WITH VISUALS
Return a "scene" automatically for spatial structures, geometry, chemistry, mechanisms or processes; null for a plain fact. It opens directly on the desktop. Never ask the person to open chat or click Show. A diagram is a 2D construction or relationship; model3d is real rotatable spatial geometry. At most one scene per reply.

Diagram:
{"type":"diagram","title":text,"items":[...],"order":[ids],"footnote":text}
Coordinates 0 to 100 from paper top-left; boxes use centre coordinates. Unique item ids. Title/footnote max 60 characters. order and footnote optional. Item kinds:
- box: x,y,w,h,text (max 80), optional tone and caption. Width/height 6 to 60.
- text: x,y,text; optional size title/body/note.
- arrow: from and to are existing box/text ids; optional label.
- highlight: target is an existing box/text id.
- line: from:[x,y],to:[x,y]; optional label and tone.
- angle: from:[x,y],vertex:[x,y],to:[x,y],radius (1 to 30); optional label such as 90° and tone. Include lines for the rays. Draw the actual arc, not just text saying an angle exists.

3D model:
{"type":"model3d","title":text,"parts":[...],"labels":[...],"angles":[...],"spin":false,"intro":text}
x is horizontal, y up, z toward the viewer. Model coordinates -12 to 12; positive dimensions 0.02 to 12. Part fields: id,shape,pos:[x,y,z], optional tone and opacity (0.05 to 1).
- box: size:[width,height,depth].
- sphere: radius.
- cylinder: length,radiusTop; optional radiusBottom and open:true. Axis x. For box/cylinder/torus, optional rot:[x,y,z] in radians.
- torus: radius,tube; axis x.
- blades: count (3 to 48),innerRadius,outerRadius,thickness; ring around x.
- bond: from:[x,y,z],to:[x,y,z],radius (default 0.08). Joins atom centres exactly; no pos or rot needed.
Label: {"n":1,"text":"Axial atom","target":"part-id","caption":"What it does and why."}. target may also be [x,y,z]. Max 8 labels, text 28 characters, caption 200. intro max 160. Optional cutaway:true slices the front half.
Angle: {"id":"a1","from":"part-a","vertex":"centre","to":"part-b","radius":0.9,"tone":"sand"}. Endpoints are existing part ids or [x,y,z]. The renderer computes the true degrees and projects the arc as the model rotates. Include angles when teaching bond angles or when asked to mark them. Keep spin false for readable geometry.

Trigonal bipyramidal: five bonds from one central atom; three equatorial atoms in the xz plane 120° apart, two axial atoms on +y/-y. Include actual arcs for axial/equatorial 90°, equatorial/equatorial 120°, axial/axial 180°. Distinguish trigonal pyramidal. Explain why the positions differ.
CURRENT VISUAL is data: preserve its parts when adding angles/labels and return the complete updated scene. Use model3d for a molecule unless a 2D diagram is explicitly requested. Text and visual must agree.
Tones: blue,rose,mint,sand,lilac,ink. Keep words short and label what matters.

Worked example:
{"type": "diagram", "title": "Input", "items": [{"id": "in", "kind": "box", "x": 22, "y": 50, "w": 28, "h": 24, "text": "[18]", "tone": "blue"}, {"id": "go", "kind": "arrow", "from": "in", "to": "out"}, {"id": "out", "kind": "box", "x": 78, "y": 50, "w": 28, "h": 24, "text": "56", "tone": "mint"}]}`;

/** The section a system prompt appends to describe when and how to draw a scene. */
export function scenePrompt(): string {
  return SCENE_PROMPT;
}
