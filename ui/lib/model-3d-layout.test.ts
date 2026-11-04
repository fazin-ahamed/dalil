import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error Node's type stripping needs the explicit extension, the TypeScript config does not allow it.
import { assembleStart, boundsCentre, boundsRadius, cameraDistance, HIGHLIGHTS, labelToken, LABEL_GAP, orbitPosition, partBounds, placeLabels, sceneBounds, spinRate, toneToken, TONES } from "./model-3d-layout.ts";

const near = (actual: number, expected: number, eps = 1e-9) =>
  assert.ok(Math.abs(actual - expected) < eps, `${actual} is not ${expected}`);

describe("partBounds", () => {
  it("gives a plain box its extents around pos", () => {
    const b = partBounds({ id: "b", shape: "box", pos: [1, 2, 3], size: [2, 4, 6] });
    assert.deepEqual(b.min, [0, 0, 0]);
    assert.deepEqual(b.max, [2, 4, 6]);
  });

  it("swaps the x and y extents of a box turned a quarter turn about z", () => {
    const b = partBounds({ id: "b", shape: "box", pos: [0, 0, 0], size: [4, 2, 2], rot: [0, 0, Math.PI / 2] });
    near(b.max[0], 1);
    near(b.max[1], 2);
    near(b.max[2], 1);
  });

  it("runs a cylinder along x and takes its radius from the wider end of a cone", () => {
    const b = partBounds({ id: "c", shape: "cylinder", pos: [0, 0, 0], length: 10, radiusTop: 1, radiusBottom: 3, open: true });
    near(b.max[0], 5);
    near(b.max[1], 3);
    near(b.max[2], 3);
  });

  it("lays a torus ring along x", () => {
    const b = partBounds({ id: "t", shape: "torus", pos: [0, 0, 0], radius: 2, tube: 0.5 });
    near(b.max[0], 0.5);
    near(b.max[1], 2.5);
  });

  it("reaches the outer radius for blades", () => {
    const b = partBounds({ id: "f", shape: "blades", pos: [0, 0, 0], count: 12, innerRadius: 1, outerRadius: 3, thickness: 0.05 });
    near(b.max[1], 3);
    near(b.min[2], -3);
  });

  it("places a sphere around its centre", () => {
    const b = partBounds({ id: "s", shape: "sphere", pos: [0, 5, 0], radius: 1 });
    assert.deepEqual(b.min, [-1, 4, -1]);
    assert.deepEqual(b.max, [1, 6, 1]);
  });
});

describe("scene bounds and framing", () => {
  it("unions every part, and an empty model is a point at the origin", () => {
    const b = sceneBounds([
      { id: "a", shape: "sphere", pos: [-2, 0, 0], radius: 1 },
      { id: "b", shape: "sphere", pos: [3, 0, 0], radius: 1 },
    ]);
    assert.deepEqual(b.min, [-3, -1, -1]);
    assert.deepEqual(b.max, [4, 1, 1]);
    assert.deepEqual(sceneBounds([]), { min: [0, 0, 0], max: [0, 0, 0] });
  });

  it("finds the centre and a radius that holds the whole box", () => {
    const b = { min: [-1, -2, -2] as [number, number, number], max: [1, 2, 2] as [number, number, number] };
    assert.deepEqual(boundsCentre(b), [0, 0, 0]);
    near(boundsRadius(b), 3);
  });

  it("frames a sphere at the distance where it just fills the vertical field", () => {
    near(cameraDistance(1, 30, 1.6, 1), 1 / Math.sin(Math.PI / 12));
  });

  it("backs the camera off further on a narrow screen", () => {
    assert.ok(cameraDistance(1, 30, 0.5) > cameraDistance(1, 30, 1.6));
  });

  it("places the camera on the orbit", () => {
    const front = orbitPosition(10, 0, 0);
    near(front[0], 0);
    near(front[1], 0);
    near(front[2], 10);
    const above = orbitPosition(10, 0, 90);
    near(above[1], 10);
    near(above[2], 0);
  });
});

describe("placeLabels", () => {
  const model = { x: 300, y: 200, width: 400, height: 200 };
  const canvas = { width: 1000, height: 600 };

  it("puts label 1 above the model and label 2 below it", () => {
    const slots = placeLabels(
      [
        { x: 400, y: 300, width: 100, height: 32 },
        { x: 600, y: 300, width: 100, height: 32 },
      ],
      model,
      canvas,
    );
    assert.equal(slots[0].side, "above");
    assert.ok(slots[0].top + 32 <= model.y);
    assert.equal(slots[1].side, "below");
    assert.ok(slots[1].top >= model.y + model.height);
  });

  it("keeps pills on one side from touching when they aim at the same spot", () => {
    const anchors = [0, 1, 2, 3, 4].map(() => ({ x: 500, y: 300, width: 120, height: 32 }));
    const slots = placeLabels(anchors, model, canvas);
    const row = [0, 2, 4].map((i) => slots[i]).sort((p, q) => p.left - q.left);
    for (let k = 1; k < row.length; k++) assert.ok(row[k].left >= row[k - 1].left + 120 + LABEL_GAP - 1e-9);
  });

  it("keeps the row inside the canvas at both edges", () => {
    const anchors = [
      { x: 0, y: 300, width: 120, height: 32 },
      { x: 1000, y: 300, width: 120, height: 32 },
      { x: 1000, y: 300, width: 120, height: 32 },
    ];
    const slots = placeLabels(anchors, model, canvas);
    for (const slot of slots) {
      assert.ok(slot.left >= 8, `left ${slot.left} is off the left edge`);
      assert.ok(slot.left + 120 <= canvas.width - 8, `right edge of ${slot.left} is off the canvas`);
    }
  });

  it("starts the leader from the pill's edge, straight across when the target sits under the pill", () => {
    const [slot] = placeLabels([{ x: 500, y: 300, width: 120, height: 32 }], model, canvas);
    assert.equal(slot.lineX, 500);
    assert.equal(slot.lineY, slot.top + 32);
  });
});

describe("tones and tokens", () => {
  it("gives every tone its own colour token", () => {
    const names = TONES.map(toneToken);
    assert.equal(new Set(names).size, TONES.length);
    for (const name of names) assert.ok(name.startsWith("--color-"), name);
  });

  it("rotates unlabelled pills through the highlighters, and an explicit tone wins", () => {
    const names = [0, 1, 2, 3, 4].map((i) => labelToken(i));
    assert.deepEqual(names.slice(0, 4), HIGHLIGHTS.map(toneToken));
    assert.equal(names[4], names[0]);
    assert.equal(labelToken(0, "rose"), toneToken("rose"));
  });
});

describe("timing", () => {
  it("staggers the assemble so the last part ends at 900 ms", () => {
    assert.equal(assembleStart(0, 5), 0);
    assert.equal(assembleStart(4, 5) + 480, 900);
    assert.equal(assembleStart(0, 1), 0);
  });

  it("eases the spin in and then turns at 14 degrees a second", () => {
    assert.equal(spinRate(0), 0);
    assert.ok(spinRate(300) < spinRate(900));
    near(spinRate(1200), (14 * Math.PI) / 180);
    near(spinRate(5000), (14 * Math.PI) / 180);
  });
});
