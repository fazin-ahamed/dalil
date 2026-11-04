import type { Mark } from "./contracts";

/**
 * Where the overlay puts each numbered mark. Pure geometry in pixels with no DOM: label boxes are
 * sized from their text, so the same code runs in the Node tests and in the browser.
 */

export type Placement = "above" | "below";

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Leader {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface MarkLayout {
  n: number;
  label: string;
  /** Colour index, 0 to 3, rotating with n. */
  tone: number;
  /** Dot centre in px. */
  x: number;
  y: number;
  placement: Placement;
  /** Label box in px. */
  box: Box;
  /** Leader from the dot to the label's near edge, in px. */
  leader: Leader;
}

/** Keep-out distance from each viewport edge, px. */
export const EDGE = 12;
/** Distance from the dot centre to the label's near edge, px. */
export const LEADER = 30;
/** Least space kept between two label boxes, px. */
const GAP = 8;
const LABEL_HEIGHT = 32;
/** Hand-ink advance per character at 22px, measured in the browser, px. */
const CHAR_WIDTH = 8.4;
const LABEL_PADDING = 26;
/** The leader meets the label this far in from its ends, so it never lands on a rounded corner. */
const LEADER_INSET = 14;
const TONE_COUNT = 4;

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), Math.max(lo, hi));

/** Estimated width of a label box that shows `text`, px. */
export function labelWidth(text: string): number {
  return Math.round(text.length * CHAR_WIDTH + LABEL_PADDING);
}

/** A point given as 0 to 1000 across and down the screen, in px of a w by h viewport. */
export function toPixels(x: number, y: number, w: number, h: number): { x: number; y: number } {
  return { x: (clamp(x, 0, 1000) / 1000) * w, y: (clamp(y, 0, 1000) / 1000) * h };
}

/** The label box for a dot at (x, y) on one side, kept inside the viewport. */
function boxOn(x: number, y: number, width: number, side: Placement, w: number, h: number): Box {
  const top = side === "above" ? y - LEADER - LABEL_HEIGHT : y + LEADER;
  return {
    x: clamp(x - width / 2, EDGE, w - EDGE - width),
    y: clamp(top, EDGE, h - EDGE - LABEL_HEIGHT),
    width,
    height: LABEL_HEIGHT,
  };
}

/** True when a label on this side fits without the viewport clamp moving it. */
function fitsOn(y: number, side: Placement, h: number): boolean {
  const top = side === "above" ? y - LEADER - LABEL_HEIGHT : y + LEADER;
  return top >= EDGE && top + LABEL_HEIGHT <= h - EDGE;
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.width + GAP && b.x < a.x + a.width + GAP && a.y < b.y + b.height + GAP && b.y < a.y + a.height + GAP;
}

/** The leader for a label box: from the dot to the box edge that faces it. Vertical while the label is centred on the dot. */
export function leaderFor(x: number, y: number, box: Box, placement: Placement): Leader {
  return {
    x1: x,
    y1: y,
    x2: clamp(x, box.x + LEADER_INSET, box.x + box.width - LEADER_INSET),
    y2: placement === "above" ? box.y + box.height : box.y,
  };
}

/**
 * Places every mark in order of n, with normalised 0 to 1000 coordinates converted to the w by h
 * viewport. Marks alternate above and below their dot. A label takes the other side when its own side
 * would leave the viewport, or when it would sit on a label already placed. Labels stay EDGE px inside.
 */
export function layoutMarks(marks: Mark[], w: number, h: number): MarkLayout[] {
  const placed: Box[] = [];
  return [...marks]
    .sort((a, b) => a.n - b.n)
    .map((mark, index) => {
      const { x, y } = toPixels(mark.x, mark.y, w, h);
      const width = labelWidth(`${mark.n} · ${mark.label}`);
      const preferred: Placement = index % 2 === 0 ? "above" : "below";
      const other: Placement = preferred === "above" ? "below" : "above";
      const sides = fitsOn(y, preferred, h) ? [preferred, other] : [other, preferred];
      const free = sides.find((side) => !placed.some((box) => overlaps(box, boxOn(x, y, width, side, w, h))));
      const placement = free ?? sides[0];
      const box = boxOn(x, y, width, placement, w, h);
      placed.push(box);
      return {
        n: mark.n,
        label: mark.label,
        tone: (((mark.n - 1) % TONE_COUNT) + TONE_COUNT) % TONE_COUNT,
        x,
        y,
        placement,
        box,
        leader: leaderFor(x, y, box, placement),
      };
    });
}
