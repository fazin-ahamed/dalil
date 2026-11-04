/**
 * Pure layout for the 3D model view: the bounds of a model, the camera distance that frames it, where
 * each label pill goes, the tone to token names and the assemble and spin timings. No DOM and no
 * three.js, so it runs under node's test runner.
 */
import type { Part, Tone } from "./contracts";

export type Vec3 = [number, number, number];

/** Axis-aligned box in model space: long axis x, up y, towards the viewer z. */
export interface Bounds {
  min: Vec3;
  max: Vec3;
}

/** A rectangle in CSS pixels. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/** A label's target on screen and the size of its pill. */
export interface LabelAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where a pill sits (its top-left corner) and where its leader line leaves the pill. */
export interface LabelSlot {
  left: number;
  top: number;
  side: "above" | "below";
  lineX: number;
  lineY: number;
}

export const TONES: readonly Tone[] = ["blue", "rose", "mint", "sand", "lilac", "ink"];

/** The highlighter tones that unlabelled pills rotate through, in order. */
export const HIGHLIGHTS: readonly Tone[] = ["blue", "lilac", "mint", "sand"];

/** Gap between the model's screen box and the pills above or below it, in pixels. */
export const LABEL_GAP = 16;

/** Blade chord as a share of the blade length, and the pitch used when a blades part has no twist (radians). */
export const BLADE_CHORD = 0.42;
export const DEFAULT_TWIST = 0.5;

const EDGE = 8;
const LEADER_INSET = 10;
const SPIN_DEG_PER_SEC = 14;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

function multiply(a: number[][], b: number[][]): number[][] {
  return a.map((row) => [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));
}

/** Rotation matrix for three.js Euler angles in the default XYZ order, which is Rx * Ry * Rz. */
function eulerMatrix([a, b, c]: Vec3): number[][] {
  const rx = [[1, 0, 0], [0, Math.cos(a), -Math.sin(a)], [0, Math.sin(a), Math.cos(a)]];
  const ry = [[Math.cos(b), 0, Math.sin(b)], [0, 1, 0], [-Math.sin(b), 0, Math.cos(b)]];
  const rz = [[Math.cos(c), -Math.sin(c), 0], [Math.sin(c), Math.cos(c), 0], [0, 0, 1]];
  return multiply(multiply(rx, ry), rz);
}

/** Half extents of a box with half extents `half` turned by `rot`: each axis takes |R| times the local halves. */
function turnedHalf(half: Vec3, rot: Vec3 = [0, 0, 0]): Vec3 {
  const m = eulerMatrix(rot);
  const extent = (i: number) => Math.abs(m[i][0]) * half[0] + Math.abs(m[i][1]) * half[1] + Math.abs(m[i][2]) * half[2];
  return [extent(0), extent(1), extent(2)];
}

/** Half extents of a part in its own frame, before its `rot`. Cylinders, cones and tori run along x. */
function localHalf(part: Part): Vec3 {
  switch (part.shape) {
    case "box":
      return [part.size[0] / 2, part.size[1] / 2, part.size[2] / 2];
    case "sphere":
      return [part.radius, part.radius, part.radius];
    case "cylinder": {
      const r = Math.max(part.radiusTop, part.radiusBottom ?? part.radiusTop);
      return [part.length / 2, r, r];
    }
    case "torus":
      return [part.tube, part.radius + part.tube, part.radius + part.tube];
    case "blades": {
      const length = part.outerRadius - part.innerRadius;
      return [(length * BLADE_CHORD) / 2 + part.thickness, part.outerRadius, part.outerRadius];
    }
  }
}

/** Bounding box of one part around its pos, including its rotation. */
export function partBounds(part: Part): Bounds {
  const half = turnedHalf(localHalf(part), "rot" in part ? part.rot : undefined);
  const [x, y, z] = part.pos;
  return {
    min: [x - half[0], y - half[1], z - half[2]],
    max: [x + half[0], y + half[1], z + half[2]],
  };
}

/** Bounding box of every part. A model with no parts is a point at the origin. */
export function sceneBounds(parts: Part[]): Bounds {
  if (parts.length === 0) return { min: [0, 0, 0], max: [0, 0, 0] };
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const part of parts) {
    const box = partBounds(part);
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], box.min[i]);
      max[i] = Math.max(max[i], box.max[i]);
    }
  }
  return { min, max };
}

export function boundsCentre(bounds: Bounds): Vec3 {
  return [0, 1, 2].map((i) => (bounds.min[i] + bounds.max[i]) / 2) as Vec3;
}

/** Radius of the sphere around the centre that holds the whole box, so it fits at every turn. */
export function boundsRadius(bounds: Bounds): number {
  return Math.hypot(...[0, 1, 2].map((i) => (bounds.max[i] - bounds.min[i]) / 2));
}

/**
 * Distance from the centre at which a sphere of `radius` fills the view, with `margin` to spare.
 * Fits the narrower of the vertical and horizontal field of view, so a tall screen backs off further.
 */
export function cameraDistance(radius: number, fovDeg: number, aspect: number, margin = 1.1): number {
  const vertical = (fovDeg * Math.PI) / 360;
  const horizontal = Math.atan(Math.tan(vertical) * aspect);
  return (Math.max(radius, 0.01) / Math.sin(Math.min(vertical, horizontal))) * margin;
}

/** Camera position on a sphere of `distance` around the origin: azimuth 0 faces +z, elevation lifts it. */
export function orbitPosition(distance: number, azimuthDeg: number, elevationDeg: number): Vec3 {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;
  return [distance * Math.cos(el) * Math.sin(az), distance * Math.sin(el), distance * Math.cos(el) * Math.cos(az)];
}

/**
 * Lefts for a row of pills in left-to-right order. Each wants its own left, no two may touch, and the
 * row stays between `min` and `max` where it can. When the row runs past `max`, it is pulled back from the right.
 */
function spreadRow(items: { want: number; width: number }[], min: number, max: number, gap: number): number[] {
  const lefts = items.map((item) => item.want);
  if (lefts.length === 0) return lefts;
  lefts[0] = Math.max(lefts[0], min);
  for (let k = 1; k < lefts.length; k++) lefts[k] = Math.max(lefts[k], lefts[k - 1] + items[k - 1].width + gap);
  const last = lefts.length - 1;
  if (lefts[last] + items[last].width > max) {
    lefts[last] = max - items[last].width;
    for (let k = last - 1; k >= 0; k--) lefts[k] = Math.min(lefts[k], lefts[k + 1] - gap - items[k].width);
  }
  return lefts;
}

/**
 * Pills alternate above and below the model's screen box (label 1 above, 2 below, and so on). Each row is
 * centred on its targets, spread so no two pills touch, and kept inside the canvas. A leader leaves the
 * pill's near edge and runs to the target, straight down or up when the target sits under the pill.
 */
export function placeLabels(anchors: LabelAnchor[], model: Rect, canvas: Size, gap = LABEL_GAP): LabelSlot[] {
  const slots: LabelSlot[] = anchors.map((): LabelSlot => ({ left: 0, top: 0, side: "above", lineX: 0, lineY: 0 }));
  for (const side of ["above", "below"] as const) {
    const ids = anchors
      .map((_, i) => i)
      .filter((i) => (i % 2 === 0) === (side === "above"))
      .sort((a, b) => anchors[a].x - anchors[b].x);
    const lefts = spreadRow(
      ids.map((i) => ({ want: anchors[i].x - anchors[i].width / 2, width: anchors[i].width })),
      EDGE,
      canvas.width - EDGE,
      gap,
    );
    ids.forEach((i, k) => {
      const a = anchors[i];
      const top = clamp(
        side === "above" ? model.y - gap - a.height : model.y + model.height + gap,
        EDGE,
        canvas.height - EDGE - a.height,
      );
      const left = lefts[k];
      slots[i] = {
        left,
        top,
        side,
        lineX: clamp(a.x, left + LEADER_INSET, left + a.width - LEADER_INSET),
        lineY: side === "above" ? top + a.height : top,
      };
    });
  }
  return slots;
}

/** The design token a tone reads its colour from. The view reads the colour itself at runtime. */
export function toneToken(tone: Tone): string {
  switch (tone) {
    case "blue":
      return "--color-hl-blue";
    case "lilac":
      return "--color-hl-lilac";
    case "mint":
      return "--color-status-cyan-background";
    case "sand":
      return "--color-status-orange-background";
    case "rose":
      return "--color-status-rose-background";
    case "ink":
      return "--color-ink";
  }
}

/** Fill token for a label: its own tone, or the next highlighter in turn when it has none. */
export function labelToken(index: number, tone?: Tone): string {
  return toneToken(tone ?? HIGHLIGHTS[index % HIGHLIGHTS.length]);
}

/** When part `index` of `count` starts its assemble fade, in ms, so that the last one ends at `totalMs`. */
export function assembleStart(index: number, count: number, totalMs = 900, partMs = 480): number {
  return count <= 1 ? 0 : (index * (totalMs - partMs)) / (count - 1);
}

/** Turn rate in radians a second: 14 degrees a second, reached with an ease-out over `rampMs`. */
export function spinRate(elapsedMs: number, rampMs = 1200): number {
  const t = clamp(elapsedMs / rampMs, 0, 1);
  return ((SPIN_DEG_PER_SEC * Math.PI) / 180) * (1 - (1 - t) ** 3);
}
