import type { DiagramItem, DiagramScene, Tone } from "./contracts";
// @ts-expect-error node strip-types needs the extension
import { angleArc } from "./visual-geometry.ts";

/*
 * Geometry for hand-drawn notes. Pure: no React, no DOM and no runtime imports, so Node's test runner can
 * load it. Scene positions run 0 to 100 across and down. The paper is VIEW_W by VIEW_H view units, so a scene
 * x becomes x * 5 and a scene y becomes y * 3.
 */

export const VIEW_W = 500;
export const VIEW_H = 300;
const SCALE_X = VIEW_W / 100;
const SCALE_Y = VIEW_H / 100;

/** Preferred font sizes in view units. Text shrinks towards MIN_FONT before it is allowed to overflow. */
export const TEXT_SIZE = { title: 16, body: 14, note: 12, box: 16, caption: 13, label: 12 } as const;
export const MIN_FONT = 10;
const MAX_FONT = 16;
const MAX_LINES = 3;
const LINE = 1.2;
/** Glyphs are estimated a little wide, so wrapped text keeps clear of the box edge. */
const SAFETY = 1.08;
/** Clear margin kept between the paper edge and any text or box. */
const MARGIN = 6;
const BOX_RADIUS = 6;
const BOX_PAD_X = 8;
const BOX_PAD_Y = 4;
const CAPTION_GAP = 4;
const TEXT_WRAP = 380;
const LABEL_WRAP = 130;
/** Arrows: the gap left at each box, the shortest arrow drawn, and the length of each arrowhead wing. */
const ARROW_GAP = 5;
const MIN_ARROW = 12;
const HEAD_LEN = 9;
const HEAD_ANGLE = 0.5;
const EPS = 1e-9;

export interface Point {
  x: number;
  y: number;
}

/** Top-left corner and size, in view units. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Text broken into lines at one size, before it has a place on the paper. */
export interface TextFit {
  size: number;
  lines: string[];
  width: number;
  height: number;
}

/** Text placed on the paper: every line is centred on `cx` and sits on its own baseline. */
export interface PlacedText extends TextFit {
  cx: number;
  baselines: number[];
  rect: Rect;
}

export interface BoxLayout {
  kind: "box";
  id: string;
  tone: Tone;
  rect: Rect;
  /** Rounded outline as one closed path. */
  outline: string;
  /** Invisible bounds that stop the rough filter from clipping the outline. */
  frame: Rect;
  text: PlacedText;
  caption?: PlacedText;
}

export interface TextLayout {
  kind: "text";
  id: string;
  variant: "title" | "body" | "note";
  block: PlacedText;
}

export interface ArrowLayout {
  kind: "arrow";
  id: string;
  path: string;
  head: string;
  frame: Rect;
  label?: PlacedText;
}

export interface HighlightLayout {
  kind: "highlight";
  id: string;
  path: string;
  frame: Rect;
}

/** An item that could not be placed, such as an arrow to a missing id. It draws nothing. */
export interface NoneLayout {
  kind: "none";
  id: string;
}

export interface GeometryLayout {kind:"geometry";id:string;path:string;tone:Tone;label?:PlacedText}
export type ItemLayout = BoxLayout | TextLayout | ArrowLayout | HighlightLayout | GeometryLayout | NoneLayout;

export interface DiagramLayout {
  /** Every item in draw order, one entry per item. */
  items: ItemLayout[];
  footnote?: string;
}

export function toView(x: number, y: number): Point {
  return { x: x * SCALE_X, y: y * SCALE_Y };
}

export function centre(r: Rect): Point {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** A box centred on (x, y) in scene units, as a rect in view units. */
export function boxRect(box: { x: number; y: number; w: number; h: number }): Rect {
  const c = toView(box.x, box.y);
  const w = box.w * SCALE_X;
  const h = box.h * SCALE_Y;
  return { x: c.x - w / 2, y: c.y - h / 2, w, h };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(Math.max(v, lo), hi);
}

function grow(r: Rect, pad: number): Rect {
  return { x: r.x - pad, y: r.y - pad, w: r.w + 2 * pad, h: r.h + 2 * pad };
}

function boundsOf(points: Point[], pad: number): Rect {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x0 = Math.min(...xs) - pad;
  const y0 = Math.min(...ys) - pad;
  const x1 = Math.max(...xs) + pad;
  const y1 = Math.max(...ys) + pad;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** Keeps a whole box on the paper by moving it, never by resizing it. */
function onPaper(r: Rect): Rect {
  return { ...r, x: clamp(r.x, 2, VIEW_W - 2 - r.w), y: clamp(r.y, 2, VIEW_H - 2 - r.h) };
}

/** Rounds to hundredths so path strings stay short. */
function num(v: number): string {
  return String(Math.round(v * 100) / 100);
}

/** A stable number in [0, 1) from a string, so a note looks the same on every render. */
export function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

function glyphEm(ch: string): number {
  if (ch === " ") return 0.3;
  if ("ilIjft.,:;'!|".includes(ch)) return 0.3;
  if ("mwMW@%".includes(ch)) return 0.82;
  if (ch >= "A" && ch <= "Z") return 0.62;
  if (ch >= "0" && ch <= "9") return 0.6;
  if ("[](){}".includes(ch)) return 0.44;
  if ((ch.codePointAt(0) ?? 0) > 0x2e80) return 1;
  return 0.5;
}

/** Estimated width in view units of `text` at `size`. Gaegu is narrow, so this errs wide. */
export function estimateWidth(text: string, size: number): number {
  let em = 0;
  for (const ch of text) em += glyphEm(ch);
  return em * size * SAFETY;
}

/** Greedy word wrap. A word longer than the line is broken by character, so nothing overflows. */
export function wrapText(text: string, maxWidth: number, size: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.trim().split(/\s+/)) {
    const joined = line ? `${line} ${word}` : word;
    if (estimateWidth(joined, size) <= maxWidth) {
      line = joined;
      continue;
    }
    if (line) lines.push(line);
    let rest = word;
    while (estimateWidth(rest, size) > maxWidth && rest.length > 1) {
      let cut = rest.length - 1;
      while (cut > 1 && estimateWidth(rest.slice(0, cut), size) > maxWidth) cut -= 1;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    line = rest;
  }
  if (line || lines.length === 0) lines.push(line);
  return lines;
}

function measure(lines: string[], size: number): TextFit {
  const width = Math.max(0, ...lines.map((line) => estimateWidth(line, size)));
  return { size, lines, width, height: lines.length * size * LINE };
}

function ellipsize(line: string, maxWidth: number, size: number): string {
  let s = line.trimEnd();
  while (s.length > 0 && estimateWidth(`${s}…`, size) > maxWidth) s = s.slice(0, -1).trimEnd();
  return `${s}…`;
}

/**
 * Lays text out in a space: the largest size from `preferred` down to MIN_FONT whose wrap fits in
 * `maxLines` lines and `maxHeight`. If nothing fits, the text is cut at MIN_FONT, to as many lines as the
 * height allows, and the last line ends in an ellipsis.
 */
export function fitText(
  text: string,
  maxWidth: number,
  maxHeight: number,
  preferred: number,
  maxLines = MAX_LINES,
): TextFit {
  for (let size = clamp(preferred, MIN_FONT, MAX_FONT); size >= MIN_FONT; size -= 1) {
    const lines = wrapText(text, maxWidth, size);
    if (lines.length <= maxLines && lines.length * size * LINE <= maxHeight) return measure(lines, size);
  }
  const byHeight = Math.max(1, Math.floor(maxHeight / (MIN_FONT * LINE)));
  const limit = Math.min(maxLines, byHeight);
  let lines = wrapText(text, maxWidth, MIN_FONT);
  if (lines.length > limit) {
    lines = lines.slice(0, limit);
    lines[limit - 1] = ellipsize(lines[limit - 1], maxWidth, MIN_FONT);
  }
  return measure(lines, MIN_FONT);
}

/** Puts a fitted block at `top` centred on `cx`, with no clamping. Used inside boxes, which already fit. */
function placeRaw(fit: TextFit, cx: number, top: number): PlacedText {
  const lh = fit.size * LINE;
  return {
    ...fit,
    cx,
    baselines: fit.lines.map((_, i) => top + i * lh + lh / 2 + fit.size * 0.3),
    rect: { x: cx - fit.width / 2, y: top, w: fit.width, h: fit.height },
  };
}

/** As placeRaw, but keeps the whole block inside the paper margin. */
function placeAt(fit: TextFit, cx: number, top: number): PlacedText {
  return placeRaw(
    fit,
    clamp(cx, MARGIN + fit.width / 2, VIEW_W - MARGIN - fit.width / 2),
    clamp(top, MARGIN, VIEW_H - MARGIN - fit.height),
  );
}

/** Distance from the centre of `rect` to its edge, travelling along the unit vector (ux, uy). */
export function edgeDistance(rect: Rect, ux: number, uy: number): number {
  const tx = Math.abs(ux) > EPS ? rect.w / 2 / Math.abs(ux) : Infinity;
  const ty = Math.abs(uy) > EPS ? rect.h / 2 / Math.abs(uy) : Infinity;
  return Math.min(tx, ty);
}

export interface ArrowShape {
  start: Point;
  control: Point;
  end: Point;
  /** Point halfway along the curve, where a label sits. */
  middle: Point;
  /** Quadratic curve from start to end. */
  path: string;
  /** The two wings of the arrowhead, as one open path that ends at `end`. */
  head: string;
}

/**
 * An arrow from the edge of `from` to the edge of `to`. Both ends sit `gap` outside their box, on the line
 * between the centres, never at a centre. The curve bows gently to one side and the head follows its final
 * tangent. Boxes that touch or overlap get a short arrow through the middle instead.
 */
export function arrowShape(from: Rect, to: Rect, gap = ARROW_GAP): ArrowShape {
  const a = centre(from);
  const b = centre(to);
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  let len = Math.hypot(dx, dy);
  if (len < EPS) {
    dx = 1;
    dy = 0;
    len = 1;
  }
  const ux = dx / len;
  const uy = dy / len;
  let s0 = edgeDistance(from, ux, uy) + gap;
  let s1 = edgeDistance(to, ux, uy) + gap;
  if (len - s0 - s1 < 8) {
    s0 = len / 2 - MIN_ARROW / 2;
    s1 = len / 2 - MIN_ARROW / 2;
  }
  const start = { x: a.x + ux * s0, y: a.y + uy * s0 };
  const end = { x: a.x + ux * (len - s1), y: a.y + uy * (len - s1) };
  const chordMid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  const span = Math.hypot(end.x - start.x, end.y - start.y);
  const bow = Math.min(span * 0.1, 12);
  const control = { x: chordMid.x + uy * bow, y: chordMid.y - ux * bow };
  const middle = {
    x: 0.25 * start.x + 0.5 * control.x + 0.25 * end.x,
    y: 0.25 * start.y + 0.5 * control.y + 0.25 * end.y,
  };

  let tx = end.x - control.x;
  let ty = end.y - control.y;
  if (Math.hypot(tx, ty) < EPS) {
    tx = end.x - start.x;
    ty = end.y - start.y;
  }
  const tl = Math.hypot(tx, ty) || 1;
  const bx = -tx / tl;
  const by = -ty / tl;
  const wing = (sign: number) => {
    const c = Math.cos(sign * HEAD_ANGLE);
    const s = Math.sin(sign * HEAD_ANGLE);
    return { x: end.x + (bx * c - by * s) * HEAD_LEN, y: end.y + (bx * s + by * c) * HEAD_LEN };
  };
  const w1 = wing(1);
  const w2 = wing(-1);

  return {
    start,
    control,
    end,
    middle,
    path: `M${num(start.x)} ${num(start.y)}Q${num(control.x)} ${num(control.y)} ${num(end.x)} ${num(end.y)}`,
    head: `M${num(w1.x)} ${num(w1.y)}L${num(end.x)} ${num(end.y)}L${num(w2.x)} ${num(w2.y)}`,
  };
}

/** Rounded rectangle as one closed path. */
export function roundedRectPath(r: Rect, radius: number): string {
  const k = Math.min(radius, r.w / 2, r.h / 2);
  const x0 = r.x;
  const y0 = r.y;
  const x1 = r.x + r.w;
  const y1 = r.y + r.h;
  return [
    `M${num(x0 + k)} ${num(y0)}`,
    `H${num(x1 - k)}`,
    `A${num(k)} ${num(k)} 0 0 1 ${num(x1)} ${num(y0 + k)}`,
    `V${num(y1 - k)}`,
    `A${num(k)} ${num(k)} 0 0 1 ${num(x1 - k)} ${num(y1)}`,
    `H${num(x0 + k)}`,
    `A${num(k)} ${num(k)} 0 0 1 ${num(x0)} ${num(y1 - k)}`,
    `V${num(y0 + k)}`,
    `A${num(k)} ${num(k)} 0 0 1 ${num(x0 + k)} ${num(y0)}`,
    "Z",
  ].join("");
}

/**
 * Points of a loose marker ring round a rect. A rounded (superellipse) loop, a little larger than the rect,
 * with a slight wobble and an overshoot past its start, so it reads as a hand-drawn ring.
 */
export function ringPoints(rect: Rect, seed: number): Point[] {
  const c = centre(rect);
  const a = (rect.w / 2) * 1.12 + 7;
  const b = (rect.h / 2) * 1.12 + 7;
  const start = -Math.PI / 2 + (seed - 0.5) * 0.4;
  const steps = 36;
  const pts: Point[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = start + (i / steps) * Math.PI * 2 * 1.06;
    const wobble = 1 + 0.015 * Math.sin(i * 1.7 + seed * 6.3);
    const cs = Math.cos(t);
    const sn = Math.sin(t);
    pts.push({
      x: c.x + a * wobble * Math.sign(cs) * Math.sqrt(Math.abs(cs)),
      y: c.y + b * wobble * Math.sign(sn) * Math.sqrt(Math.abs(sn)),
    });
  }
  return pts;
}

/** Smooth open curve through the points, as cubic segments (Catmull-Rom). */
function smoothPath(pts: Point[]): string {
  let d = `M${num(pts[0].x)} ${num(pts[0].y)}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[Math.max(i - 1, 0)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(i + 2, pts.length - 1)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += `C${num(c1x)} ${num(c1y)} ${num(c2x)} ${num(c2y)} ${num(p2.x)} ${num(p2.y)}`;
  }
  return d;
}

/** The marker ring drawn round a box. */
export function ringPath(rect: Rect, seed: number): string {
  return smoothPath(ringPoints(rect, seed));
}

/** A loose marker underline, a little below a line of text. */
export function underlinePath(rect: Rect, seed: number): string {
  const y = rect.y + rect.h + 4;
  const x0 = rect.x - 4 + (seed - 0.5) * 3;
  const x1 = rect.x + rect.w + 4;
  const mid = (x0 + x1) / 2;
  return `M${num(x0)} ${num(y + 0.8)}Q${num(mid)} ${num(y + 3.6)} ${num(x1)} ${num(y - 0.6)}`;
}

/** Items in the order they are drawn: `order` first, then everything else in array order. */
export function drawOrder(scene: Pick<DiagramScene, "items" | "order">): DiagramItem[] {
  const byId = new Map<string, DiagramItem>();
  for (const item of scene.items) if (!byId.has(item.id)) byId.set(item.id, item);
  const seen = new Set<string>();
  const out: DiagramItem[] = [];
  for (const id of scene.order ?? []) {
    const item = byId.get(id);
    if (item && !seen.has(id)) {
      seen.add(id);
      out.push(item);
    }
  }
  for (const item of scene.items) {
    if (byId.get(item.id) !== item || seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

function boxLayout(item: Extract<DiagramItem, { kind: "box" }>): BoxLayout {
  const rect = onPaper(boxRect(item));
  const c = centre(rect);
  const fit = fitText(
    item.text,
    rect.w - 2 * BOX_PAD_X,
    Math.max(rect.h - 2 * BOX_PAD_Y, MIN_FONT * LINE),
    TEXT_SIZE.box,
  );
  const text = placeRaw(fit, c.x, rect.y + (rect.h - fit.height) / 2);
  let caption: PlacedText | undefined;
  if (item.caption) {
    const cap = fitText(item.caption, Math.max(rect.w + 60, 140), 40, TEXT_SIZE.caption, 2);
    const above = rect.y - CAPTION_GAP - cap.height;
    caption = placeAt(cap, c.x, above >= MARGIN ? above : rect.y + rect.h + CAPTION_GAP);
  }
  return {
    kind: "box",
    id: item.id,
    tone: item.tone ?? "blue",
    rect,
    outline: roundedRectPath(rect, BOX_RADIUS),
    frame: grow(rect, 10),
    text,
    caption,
  };
}

function textLayout(item: Extract<DiagramItem, { kind: "text" }>): TextLayout {
  const variant = item.size ?? "body";
  const fit = fitText(item.text, TEXT_WRAP, VIEW_H, TEXT_SIZE[variant]);
  const c = toView(item.x, item.y);
  return { kind: "text", id: item.id, variant, block: placeAt(fit, c.x, c.y - fit.height / 2) };
}

function rectOf(layout: ItemLayout | undefined): Rect | null {
  if (layout?.kind === "box") return layout.rect;
  if (layout?.kind === "text") return layout.block.rect;
  return null;
}

function arrowLayout(item: Extract<DiagramItem, { kind: "arrow" }>, made: Map<string, ItemLayout>): ItemLayout {
  const from = rectOf(made.get(item.from));
  const to = rectOf(made.get(item.to));
  if (!from || !to) return { kind: "none", id: item.id };
  const shape = arrowShape(from, to);
  let label: PlacedText | undefined;
  if (item.label) {
    const fit = fitText(item.label, LABEL_WRAP, 30, TEXT_SIZE.label, 2);
    label = placeAt(fit, shape.middle.x, shape.middle.y - fit.height / 2);
  }
  return {
    kind: "arrow",
    id: item.id,
    path: shape.path,
    head: shape.head,
    frame: boundsOf([shape.start, shape.control, shape.end], 10),
    label,
  };
}

function highlightLayout(
  item: Extract<DiagramItem, { kind: "highlight" }>,
  made: Map<string, ItemLayout>,
): ItemLayout {
  const target = made.get(item.target);
  if (target?.kind === "box") {
    return { kind: "highlight", id: item.id, path: ringPath(target.rect, hash(item.id)), frame: grow(target.rect, 16) };
  }
  if (target?.kind === "text") {
    const r = target.block.rect;
    return {
      kind: "highlight",
      id: item.id,
      path: underlinePath(r, hash(item.id)),
      frame: { x: r.x - 8, y: r.y + r.h - 2, w: r.w + 16, h: 16 },
    };
  }
  return { kind: "none", id: item.id };
}

/**
 * Places every item of a note on the paper, in draw order. Boxes and text are laid out first, so arrows and
 * highlights can find the rects of the items they refer to. Anything that cannot be placed becomes "none".
 */
export function layoutDiagram(scene: DiagramScene): DiagramLayout {
  const made = new Map<string, ItemLayout>();
  for (const item of scene.items) {
    if (made.has(item.id)) continue;
    if (item.kind === "box") made.set(item.id, boxLayout(item));
    else if (item.kind === "text") made.set(item.id, textLayout(item));
  }
  const items = drawOrder(scene).map((item): ItemLayout => {
    switch (item.kind) {
      case "box":
      case "text":
        return made.get(item.id) ?? { kind: "none", id: item.id };
      case "arrow":
        return arrowLayout(item, made);
      case "highlight":
        return highlightLayout(item, made);
      case "line":
      case "angle": {
        const a=toView(...item.from),b=toView(...item.to);
        let points=[a,b],at={x:(a.x+b.x)/2,y:(a.y+b.y)/2-12};
        let label=item.label;
        if(item.kind==="angle") {
          const v=toView(...item.vertex);
          const arc=angleArc({id:item.id,from:[a.x,a.y,0],vertex:[v.x,v.y,0],to:[b.x,b.y,0],radius:(item.radius??10)*3});
          if(!arc)return {kind:"none",id:item.id};
          points=arc.points.map(([x,y])=>({x,y}));at={x:arc.label[0],y:arc.label[1]};
          label=label??`${arc.degrees}°`;
        }
        return {kind:"geometry",id:item.id,tone:item.tone??"ink",path:points.map((p,i)=>`${i?"L":"M"} ${num(p.x)} ${num(p.y)}`).join(" "),
          ...(label?{label:placeAt(fitText(label,120,30,TEXT_SIZE.label),at.x,at.y)}:{})};
      }
    }
  });
  return { items, footnote: scene.footnote };
}
