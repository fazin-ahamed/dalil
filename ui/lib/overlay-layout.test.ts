import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error Node's type stripping needs the explicit extension, the TypeScript config does not allow it.
import { EDGE, LEADER, labelWidth, layoutMarks, toPixels } from "./overlay-layout.ts";

const W = 1280;
const H = 800;
const mark = (n: number, x: number, y: number, label = "Fan") => ({ n, label, x, y });

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

function insideViewport(box: Rect): boolean {
  return box.x >= EDGE && box.y >= EDGE && box.x + box.width <= W - EDGE && box.y + box.height <= H - EDGE;
}

describe("layoutMarks", () => {
  it("centres a single label over its dot, above it, with the leader running up to its bottom edge", () => {
    const [only] = layoutMarks([mark(1, 500, 500)], W, H);
    assert.equal(only.x, 640);
    assert.equal(only.y, 400);
    assert.equal(only.placement, "above");
    assert.equal(only.box.x + only.box.width / 2, 640);
    assert.equal(only.box.y + only.box.height, only.y - LEADER);
    assert.equal(only.leader.x1, only.leader.x2);
    assert.equal(only.leader.y2, only.box.y + only.box.height);
  });

  it("converts the normalised 0 to 1000 coordinates with the viewport size", () => {
    const [only] = layoutMarks([mark(1, 250, 750)], W, H);
    assert.equal(only.x, 320);
    assert.equal(only.y, 600);
  });

  it("alternates above and below for neighbours that do not collide", () => {
    const layout = layoutMarks([mark(1, 200, 500), mark(2, 800, 500)], W, H);
    assert.deepEqual(
      layout.map((item) => item.placement),
      ["above", "below"],
    );
  });

  it("flips a label to the other side when its own side would sit on a label already placed", () => {
    const layout = layoutMarks([mark(1, 200, 500), mark(2, 800, 500), mark(3, 210, 510)], W, H);
    assert.equal(layout[0].placement, "above");
    assert.equal(layout[2].placement, "below");
    assert.equal(intersects(layout[0].box, layout[2].box), false);
  });

  it("keeps every label at least 12px inside the viewport, including the corners", () => {
    const corners = [mark(1, 0, 0), mark(2, 1000, 0), mark(3, 0, 1000), mark(4, 1000, 1000), mark(5, 500, 500)];
    for (const item of layoutMarks(corners, W, H)) {
      assert.ok(insideViewport(item.box), `label ${item.n} leaves the viewport: ${JSON.stringify(item.box)}`);
    }
    const [topLeft] = layoutMarks([mark(1, 0, 0)], W, H);
    assert.equal(topLeft.box.x, EDGE);
    assert.equal(topLeft.placement, "below");
    assert.equal(topLeft.box.y, LEADER);
  });

  it("moves a label that would leave the top edge to the side below its dot", () => {
    const [top] = layoutMarks([mark(1, 500, 0)], W, H);
    assert.equal(top.placement, "below");
    assert.equal(top.box.y, LEADER);
  });

  it("keeps the preferred side when it fits, even near the bottom edge", () => {
    const [bottom] = layoutMarks([mark(1, 500, 1000)], W, H);
    assert.equal(bottom.placement, "above");
    assert.ok(insideViewport(bottom.box));
  });

  it("lays out eight marks in a row with no two labels overlapping", () => {
    const labels = ["Fan", "Compressor", "Combustor", "Turbine", "Shaft", "Nozzle", "Bearing", "Casing"];
    const marks = labels.map((label, i) => mark(i + 1, 60 + i * 120, 500, label));
    const layout = layoutMarks(marks, W, H);
    assert.equal(layout.length, 8);
    for (const item of layout) assert.ok(insideViewport(item.box), `label ${item.n} leaves the viewport`);
    for (let i = 0; i < layout.length; i++) {
      for (let j = i + 1; j < layout.length; j++) {
        assert.equal(intersects(layout[i].box, layout[j].box), false, `labels ${i + 1} and ${j + 1} overlap`);
      }
    }
  });

  it("points each leader from the dot to the label edge that faces it, inside the label's width", () => {
    const layout = layoutMarks([mark(1, 200, 500), mark(2, 800, 500), mark(3, 1000, 1000)], W, H);
    for (const item of layout) {
      const edge = item.placement === "above" ? item.box.y + item.box.height : item.box.y;
      assert.equal(item.leader.x1, item.x);
      assert.equal(item.leader.y1, item.y);
      assert.equal(item.leader.y2, edge);
      assert.ok(item.leader.x2 >= item.box.x && item.leader.x2 <= item.box.x + item.box.width);
    }
  });

  it("sorts the marks by n and rotates the colour index with n", () => {
    const layout = layoutMarks([mark(5, 100, 500), mark(1, 300, 500), mark(3, 500, 500), mark(2, 700, 500), mark(4, 900, 500)], W, H);
    assert.deepEqual(
      layout.map((item) => item.n),
      [1, 2, 3, 4, 5],
    );
    assert.deepEqual(
      layout.map((item) => item.tone),
      [0, 1, 2, 3, 0],
    );
  });

  it("keeps a crowd of marks on the same point inside the viewport", () => {
    const crowd = [mark(1, 500, 500), mark(2, 500, 500), mark(3, 500, 500), mark(4, 500, 500)];
    for (const item of layoutMarks(crowd, W, H)) assert.ok(insideViewport(item.box), `label ${item.n} leaves the viewport`);
  });

  it("keeps labels on a viewport smaller than one label", () => {
    const [tiny] = layoutMarks([mark(1, 500, 500, "Combustion chamber")], 120, 90);
    assert.equal(tiny.box.x, EDGE);
  });

  it("estimates a longer label as wider than a shorter one", () => {
    assert.ok(labelWidth("1 · Turbine") > labelWidth("1 · Fan"));
    assert.equal(Number.isInteger(labelWidth("2 · Compressor")), true);
  });
});

describe("toPixels", () => {
  it("maps 0 to 1000 onto the viewport and clamps anything outside it", () => {
    assert.deepEqual(toPixels(1000, 500, W, H), { x: W, y: 400 });
    assert.deepEqual(toPixels(-50, 2000, W, H), { x: 0, y: H });
  });
});
