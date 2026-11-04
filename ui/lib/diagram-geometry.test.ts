import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { DiagramScene } from "./contracts";
// @ts-expect-error Node's type stripping needs the explicit extension, the TypeScript config does not allow it.
import * as geo from "./diagram-geometry.ts";

const dot = (p: geo.Point, q: geo.Point) => p.x * q.x + p.y * q.y;
const sub = (p: geo.Point, q: geo.Point) => ({ x: p.x - q.x, y: p.y - q.y });
const inside = (p: geo.Point, r: geo.Rect, pad = 0) =>
  p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;

function find(layout: geo.DiagramLayout, id: string): geo.ItemLayout {
  const hit = layout.items.find((item) => item.id === id);
  assert.ok(hit, `no layout for ${id}`);
  return hit;
}

function boxOf(layout: geo.DiagramLayout, id: string): geo.BoxLayout {
  const item = find(layout, id);
  assert.equal(item.kind, "box");
  return item as geo.BoxLayout;
}

describe("coordinates", () => {
  it("maps scene units onto the 500 by 300 paper", () => {
    assert.deepEqual(geo.toView(50, 50), { x: 250, y: 150 });
    assert.deepEqual(geo.toView(100, 100), { x: 500, y: 300 });
  });

  it("centres a box on its scene position", () => {
    assert.deepEqual(geo.boxRect({ x: 20, y: 50, w: 10, h: 20 }), { x: 75, y: 120, w: 50, h: 60 });
  });
});

describe("arrows", () => {
  const cases = [
    { name: "right", from: { x: 20, y: 50 }, to: { x: 60, y: 50 } },
    { name: "left", from: { x: 60, y: 50 }, to: { x: 20, y: 50 } },
    { name: "down", from: { x: 50, y: 20 }, to: { x: 50, y: 70 } },
    { name: "up", from: { x: 50, y: 70 }, to: { x: 50, y: 20 } },
    { name: "diagonal", from: { x: 20, y: 20 }, to: { x: 70, y: 75 } },
  ];

  for (const c of cases) {
    it(`runs ${c.name} from the edge of the first box to the edge of the second`, () => {
      const a = geo.boxRect({ ...c.from, w: 10, h: 20 });
      const b = geo.boxRect({ ...c.to, w: 10, h: 20 });
      const shape = geo.arrowShape(a, b);
      const travel = sub(geo.centre(b), geo.centre(a));
      assert.ok(dot(sub(shape.end, shape.start), travel) > 0, "arrow runs the wrong way");
      assert.ok(dot(sub(shape.end, shape.control), travel) > 0, "head does not point along the travel");
      assert.equal(inside(shape.start, a), false, "start is inside the first box");
      assert.equal(inside(shape.start, a, 6), true, "start is not next to the first box");
      assert.equal(inside(shape.end, b), false, "end is inside the second box");
      assert.equal(inside(shape.end, b, 6), true, "end is not next to the second box");
    });
  }

  it("starts and ends on the line between the centres for a diagonal, never at a centre", () => {
    const a = geo.boxRect({ x: 20, y: 20, w: 10, h: 20 });
    const b = geo.boxRect({ x: 70, y: 75, w: 10, h: 20 });
    const shape = geo.arrowShape(a, b);
    const travel = sub(geo.centre(b), geo.centre(a));
    const offStart = sub(shape.start, geo.centre(a));
    const cross = offStart.x * travel.y - offStart.y * travel.x;
    assert.ok(Math.abs(cross) < 1e-6, "start is off the line between the centres");
    assert.ok(Math.hypot(offStart.x, offStart.y) > 30, "start sits too close to the centre");
  });

  it("keeps a short arrow between overlapping boxes", () => {
    const a = geo.boxRect({ x: 50, y: 50, w: 20, h: 30 });
    const b = geo.boxRect({ x: 55, y: 50, w: 20, h: 30 });
    const shape = geo.arrowShape(a, b);
    const length = Math.hypot(shape.end.x - shape.start.x, shape.end.y - shape.start.y);
    assert.ok(Number.isFinite(length), "length is not finite");
    assert.ok(length > 0 && length <= 20, `unexpected length ${length}`);
    assert.ok(shape.end.x > shape.start.x, "overlapping arrow runs backwards");
  });

  it("stays finite when both boxes share a centre", () => {
    const a = geo.boxRect({ x: 50, y: 50, w: 20, h: 30 });
    const shape = geo.arrowShape(a, a);
    for (const p of [shape.start, shape.control, shape.end, shape.middle]) {
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), "point is not finite");
    }
    assert.ok(shape.end.x > shape.start.x, "arrow should point along +x by default");
  });
});

describe("text", () => {
  it("keeps short text on one line at its preferred size", () => {
    const fit = geo.fitText("Both can be tensors", 300, 60, 14);
    assert.equal(fit.lines.length, 1);
    assert.equal(fit.size, 14);
  });

  it("wraps long text so every line fits and no words are lost", () => {
    const text = "Pick the input tensor, then pick the target that the model should reach by the end of the step.";
    const lines = geo.wrapText(text, 120, 14);
    assert.ok(lines.length > 1, "long text should wrap");
    for (const line of lines) {
      assert.ok(geo.estimateWidth(line, 14) <= 120 + 1e-9, `line too wide: ${line}`);
    }
    assert.equal(lines.join(" "), text);
  });

  it("breaks a word longer than the line by character", () => {
    const word = "Supercalifragilisticexpialidocious";
    const lines = geo.wrapText(word, 60, 14);
    assert.ok(lines.length > 1);
    assert.equal(lines.join(""), word);
    for (const line of lines) assert.ok(geo.estimateWidth(line, 14) <= 60 + 1e-9);
  });

  it("shrinks text to fit its height and never goes below the minimum", () => {
    const fit = geo.fitText("Input tensor with one label", 110, 30, 16);
    assert.ok(fit.size < 16, `expected shrinking, got ${fit.size}`);
    assert.ok(fit.size >= geo.MIN_FONT);
    assert.ok(fit.lines.length <= 3);
    assert.ok(fit.height <= 30 + 1e-9, `text is taller than its box: ${fit.height}`);
  });

  it("ends a text that cannot fit with an ellipsis at the smallest size", () => {
    const fit = geo.fitText("A sentence far too long to ever fit in one small space at all", 60, 14, 16);
    assert.equal(fit.size, geo.MIN_FONT);
    assert.equal(fit.lines.length, 1);
    assert.ok(fit.lines[0].endsWith("…"), `no ellipsis: ${fit.lines[0]}`);
    assert.ok(geo.estimateWidth(fit.lines[0], geo.MIN_FONT) <= 60 + 1e-9);
  });

  it("estimates narrow glyphs and spaces narrower than wide ones, linear in size", () => {
    assert.ok(geo.estimateWidth("ii", 10) < geo.estimateWidth("mm", 10));
    assert.ok(geo.estimateWidth(" ", 10) < geo.estimateWidth("a", 10));
    assert.ok(Math.abs(geo.estimateWidth("abc", 20) - 2 * geo.estimateWidth("abc", 10)) < 1e-9);
  });
});

describe("layout", () => {
  it("draws items in order, then the rest in array order", () => {
    const text = (id: string): DiagramScene["items"][number] => ({ id, kind: "text", x: 10, y: 10, text: id });
    const items = [text("a"), text("b"), text("c"), text("d")];
    const ids = geo.drawOrder({ items, order: ["c", "missing", "a"] }).map((item) => item.id);
    assert.deepEqual(ids, ["c", "a", "b", "d"]);
  });

  it("keeps every box's text inside the box", () => {
    const layout = geo.layoutDiagram({
      type: "diagram",
      title: "Small box",
      items: [
        {
          id: "b",
          kind: "box",
          x: 30,
          y: 50,
          w: 14,
          h: 18,
          text: "A longer label that wraps over several lines in a small box",
        },
      ],
    });
    const box = boxOf(layout, "b");
    const t = box.text.rect;
    assert.ok(t.x >= box.rect.x - 1e-9 && t.x + t.w <= box.rect.x + box.rect.w + 1e-9, "text leaves the box sideways");
    assert.ok(t.y >= box.rect.y - 1e-9 && t.y + t.h <= box.rect.y + box.rect.h + 1e-9, "text leaves the box vertically");
    for (const line of box.text.lines) {
      assert.ok(geo.estimateWidth(line, box.text.size) <= box.rect.w - 16 + 1e-9, `line too wide: ${line}`);
    }
  });

  it("places a caption above its box, or below when there is no room above", () => {
    const layout = geo.layoutDiagram({
      type: "diagram",
      title: "Captions",
      items: [
        { id: "high", kind: "box", x: 50, y: 50, w: 20, h: 20, text: "47", caption: "Target: known answer" },
        { id: "top", kind: "box", x: 50, y: 6, w: 20, h: 20, text: "18", caption: "Input" },
      ],
    });
    const high = boxOf(layout, "high");
    assert.ok(high.caption, "caption missing");
    assert.ok(high.caption.rect.y + high.caption.rect.h <= high.rect.y + 1e-9, "caption overlaps its box");
    const top = boxOf(layout, "top");
    assert.ok(top.caption, "caption missing");
    assert.ok(top.caption.rect.y >= top.rect.y + top.rect.h - 1e-9, "caption should drop below the box");
  });

  it("leaves an arrow to a missing id as none", () => {
    const layout = geo.layoutDiagram({
      type: "diagram",
      title: "Missing",
      items: [
        { id: "in", kind: "box", x: 20, y: 50, w: 10, h: 20, text: "a" },
        { id: "go", kind: "arrow", from: "in", to: "nowhere" },
      ],
    });
    assert.equal(find(layout, "go").kind, "none");
  });

  it("keeps every path finite for a note with arrows, labels and highlights", () => {
    const layout = geo.layoutDiagram({
      type: "diagram",
      title: "Finite",
      items: [
        { id: "a", kind: "box", x: 22, y: 32, w: 28, h: 24, text: "[18]", tone: "blue", caption: "Input tensor" },
        { id: "b", kind: "box", x: 78, y: 32, w: 28, h: 24, text: "47", tone: "rose" },
        { id: "t", kind: "text", x: 50, y: 88, text: "Both can be tensors", size: "note" },
        { id: "go", kind: "arrow", from: "a", to: "b", label: "feeds" },
        { id: "hi", kind: "highlight", target: "b" },
        { id: "under", kind: "highlight", target: "t" },
      ],
    });
    const json = JSON.stringify(layout);
    assert.ok(!json.includes("NaN"), "a coordinate is NaN");
    assert.ok(!json.includes("Infinity"), "a coordinate is infinite");
  });

  it("draws a marker ring that encloses the box it marks", () => {
    const rect = geo.boxRect({ x: 50, y: 50, w: 20, h: 20 });
    const pts = geo.ringPoints(rect, 0.4);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    assert.ok(Math.min(...xs) <= rect.x, "ring does not reach the left edge");
    assert.ok(Math.max(...xs) >= rect.x + rect.w, "ring does not reach the right edge");
    assert.ok(Math.min(...ys) <= rect.y, "ring does not reach the top edge");
    assert.ok(Math.max(...ys) >= rect.y + rect.h, "ring does not reach the bottom edge");
  });

  it("underlines a text target instead of ringing it", () => {
    const layout = geo.layoutDiagram({
      type: "diagram",
      title: "Underline",
      items: [
        { id: "t", kind: "text", x: 50, y: 50, text: "Read this line" },
        { id: "hi", kind: "highlight", target: "t" },
      ],
    });
    const hi = find(layout, "hi");
    assert.equal(hi.kind, "highlight");
    if (hi.kind === "highlight") assert.ok(hi.path.includes("Q"), "expected a curved underline");
  });

  it("moves a box that sits on the paper edge back onto the paper", () => {
    const layout = geo.layoutDiagram({
      type: "diagram",
      title: "Edge",
      items: [{ id: "edge", kind: "box", x: 0, y: 50, w: 10, h: 20, text: "x" }],
    });
    const box = boxOf(layout, "edge");
    assert.ok(box.rect.x >= 2, `box still off the left edge at ${box.rect.x}`);
    assert.ok(box.rect.x + box.rect.w <= geo.VIEW_W, "box runs off the right edge");
  });

  it("points an arrow from a text item to a box", () => {
    const layout = geo.layoutDiagram({
      type: "diagram",
      title: "Text to box",
      items: [
        { id: "label", kind: "text", x: 20, y: 40, text: "Input" },
        { id: "box", kind: "box", x: 70, y: 40, w: 20, h: 20, text: "47" },
        { id: "go", kind: "arrow", from: "label", to: "box" },
      ],
    });
    assert.equal(find(layout, "go").kind, "arrow");
  });
});
