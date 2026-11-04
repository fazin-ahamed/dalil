import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Mark, ScreenShot } from "./contracts";
// @ts-expect-error TS5097
import { applyRefinement, refineMessages, REFINE_SYSTEM } from "./refine.ts";

const marks: Mark[] = [
  { n: 1, label: "Fan", x: 100, y: 500 },
  { n: 2, label: "Turbine", x: 800, y: 500 },
  { n: 3, label: "Gone", x: 400, y: 100 },
];
const shot: ScreenShot = { dataUrl: "data:image/jpeg;base64,AAAA", width: 100, height: 50 };

describe("applyRefinement", () => {
  it("moves a mark to the corrected point", () => {
    const out = applyRefinement(marks, '{"marks":[{"n":1,"x":130,"y":480},{"n":2,"x":800,"y":500},{"n":3,"x":400,"y":100}]}');
    assert.deepEqual(out[0], { n: 1, label: "Fan", x: 130, y: 480 });
  });
  it("drops a mark the model left out and renumbers", () => {
    const out = applyRefinement(marks, '{"marks":[{"n":1,"x":100,"y":500},{"n":2,"x":800,"y":500}]}');
    assert.deepEqual(out.map((m: Mark) => [m.n, m.label]), [[1, "Fan"], [2, "Turbine"]]);
  });
  it("keeps the marks when the reply is not usable", () => {
    assert.equal(applyRefinement(marks, "sorry"), marks);
    assert.equal(applyRefinement(marks, '{"marks":"no"}'), marks);
    assert.equal(applyRefinement(marks, '{"marks":[]}'), marks);
  });
  it("ignores a move of more than 400 and clamps to 0..1000", () => {
    const far = applyRefinement(marks, '{"marks":[{"n":1,"x":900,"y":500},{"n":2,"x":1200,"y":500}]}');
    assert.equal(far[0].x, 100);
    assert.equal(far[1].x, 1000);
  });
  it("reads a reply wrapped in a fence and numeric strings", () => {
    const out = applyRefinement(marks, '```json\n{"marks":[{"n":1,"x":"120","y":"510"}]}\n```');
    assert.deepEqual(out, [{ n: 1, label: "Fan", x: 120, y: 510 }]);
  });
});

describe("refineMessages", () => {
  it("sends the rules, the list and the annotated image", () => {
    const [system, user] = refineMessages(marks, shot);
    assert.equal(system.content, REFINE_SYSTEM);
    assert.ok(Array.isArray(user.content));
    const parts = user.content as { type: string }[];
    assert.deepEqual(parts.map((p) => p.type), ["text", "image_url"]);
    assert.match((parts[0] as unknown as { text: string }).text, /1\. Fan at x 100, y 500/);
  });
});
