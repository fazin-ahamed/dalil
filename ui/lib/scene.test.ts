import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { DiagramScene, Model3DScene } from "./contracts";
// Node resolves the explicit extension; tsc only allows it with allowImportingTsExtensions.
// @ts-expect-error TS5097
import * as scene from "./scene.ts";

const { EXAMPLE_DIAGRAM, EXAMPLE_JET, SCENE_PROMPT_VERSION, sanitizeScene, scenePrompt } = scene;

const roundTrip = (value: unknown): unknown => JSON.parse(JSON.stringify(value));

/** The sanitized value, which must be a note. */
function diagramOf(raw: unknown): DiagramScene {
  const out = sanitizeScene(raw);
  if (out?.type !== "diagram") throw new Error("expected a diagram");
  return out;
}

/** The sanitized value, which must be a model. */
function modelOf(raw: unknown): Model3DScene {
  const out = sanitizeScene(raw);
  if (out?.type !== "model3d") throw new Error("expected a model3d");
  return out;
}

/** Raw items and scenes for the tests, with any field overridden. */
const box = (id: string, extra: Record<string, unknown> = {}) => ({ id, kind: "box", x: 50, y: 50, w: 20, h: 10, text: id, ...extra });
const sphere = (id: string, extra: Record<string, unknown> = {}) => ({ id, shape: "sphere", pos: [0, 0, 0], radius: 1, ...extra });
const note = (items: unknown[], extra: Record<string, unknown> = {}) => ({ type: "diagram", title: "T", items, ...extra });
const model = (parts: unknown[], labels: unknown[] = []) => ({ type: "model3d", title: "M", parts, labels });

describe("examples", () => {
  it("both examples pass sanitizeScene and come back unchanged after a JSON round trip", () => {
    assert.deepEqual(sanitizeScene(roundTrip(EXAMPLE_DIAGRAM)), EXAMPLE_DIAGRAM);
    assert.deepEqual(sanitizeScene(roundTrip(EXAMPLE_JET)), EXAMPLE_JET);
  });

  it("the note has four boxes joined by two arrows, in draw order, with a footnote", () => {
    const kinds = EXAMPLE_DIAGRAM.items.map((item) => item.kind);
    assert.equal(kinds.filter((kind) => kind === "box").length, 4);
    assert.equal(kinds.filter((kind) => kind === "arrow").length, 2);
    assert.deepEqual(EXAMPLE_DIAGRAM.order, EXAMPLE_DIAGRAM.items.map((item) => item.id));
    assert.equal(EXAMPLE_DIAGRAM.footnote, "Both can be tensors");
  });

  it("the jet has 14 to 18 parts, four labels on existing parts, and cutaway and spin on", () => {
    const ids = new Set(EXAMPLE_JET.parts.map((part) => part.id));
    assert.ok(EXAMPLE_JET.parts.length >= 14 && EXAMPLE_JET.parts.length <= 18);
    assert.deepEqual(EXAMPLE_JET.labels.map((label) => `${label.n} ${label.text}`), ["1 Fan", "2 Compressor", "3 Combustor", "4 Turbine"]);
    assert.ok(EXAMPLE_JET.labels.every((label) => typeof label.target === "string" && ids.has(label.target)));
    assert.equal(EXAMPLE_JET.cutaway, true);
    assert.equal(EXAMPLE_JET.spin, true);
  });

  it("returns a new object and leaves its input unchanged", () => {
    const input = roundTrip(EXAMPLE_JET);
    const before = JSON.stringify(input);
    const out = sanitizeScene(input);
    assert.notEqual(out, input);
    assert.equal(JSON.stringify(input), before);
  });
});

describe("sanitizeScene on notes", () => {
  it("drops arrows and highlights that name a missing id, and arrows that join arrows", () => {
    const out = diagramOf(
      note([
        box("a"),
        { id: "b", kind: "text", x: 50, y: 80, text: "B" },
        { id: "ok", kind: "arrow", from: "a", to: "b", label: "then" },
        { id: "gone", kind: "arrow", from: "a", to: "ghost" },
        { id: "arrow-of-arrow", kind: "arrow", from: "ok", to: "b" },
        { id: "ring", kind: "highlight", target: "b" },
        { id: "lost-ring", kind: "highlight", target: "ghost" },
      ]),
    );
    assert.deepEqual(out.items.map((item) => item.id), ["a", "b", "ok", "ring"]);
  });

  it("keeps the first of two items that share an id, and drops an empty id", () => {
    const out = diagramOf(note([box("a", { text: "first" }), box("a", { text: "second" }), box("", {})]));
    assert.deepEqual(out.items, [box("a", { text: "first" })]);
  });

  it("clamps box positions to 0..100 and box sizes to 6..60", () => {
    const out = diagramOf(note([box("a", { x: 150, y: -5, w: 1, h: 500 })]));
    assert.deepEqual(out.items, [box("a", { x: 100, y: 0, w: 6, h: 60 })]);
  });

  it("reads numeric strings as numbers, and a bare number as text", () => {
    const out = diagramOf(note([box("a", { x: "42", y: " 7.5 ", w: "20", h: "10", text: 47 })]));
    assert.deepEqual(out.items, [box("a", { x: 42, y: 7.5, w: 20, h: 10, text: "47" })]);
  });

  it("drops a tone outside the six tones and keeps a valid one", () => {
    const out = diagramOf(note([box("a", { tone: "purple" }), box("b", { tone: "rose" })]));
    assert.deepEqual(out.items, [box("a"), box("b", { tone: "rose" })]);
  });

  it("cuts the title, text, captions, labels and footnote at their limits", () => {
    const long = "x".repeat(200);
    const out = diagramOf(
      note([box("a", { text: long, caption: long }), { id: "ar", kind: "arrow", from: "a", to: "a", label: long }], {
        title: long,
        footnote: long,
      }),
    );
    const sixty = "x".repeat(60);
    assert.deepEqual(out, {
      type: "diagram",
      title: sixty,
      footnote: sixty,
      items: [box("a", { text: "x".repeat(80), caption: sixty }), { id: "ar", kind: "arrow", from: "a", to: "a", label: sixty }],
    });
  });

  it("keeps at most 24 items", () => {
    const out = diagramOf(note(Array.from({ length: 30 }, (_, i) => box(`b${i}`))));
    assert.deepEqual(out.items.map((item) => item.id), Array.from({ length: 24 }, (_, i) => `b${i}`));
  });

  it("drops an arrow whose box was cut off by the item cap", () => {
    const boxes = Array.from({ length: 23 }, (_, i) => box(`b${i}`));
    const out = diagramOf(note([...boxes, { id: "link", kind: "arrow", from: "b0", to: "b23" }, box("b23"), box("b24")]));
    assert.deepEqual(out.items.map((item) => item.id), boxes.map((item) => item.id));
  });

  it("keeps only the order ids that exist, in the order given", () => {
    const out = diagramOf(note([box("a"), box("b")], { order: ["b", "ghost", "a"] }));
    assert.deepEqual(out.order, ["b", "a"]);
  });

  it("returns null for a note with no box or text left", () => {
    assert.equal(sanitizeScene(note([])), null);
    assert.equal(sanitizeScene(note([{ id: "a", kind: "arrow", from: "x", to: "y" }])), null);
  });
});

describe("sanitizeScene on models", () => {
  it("clamps positions to -12..12 and sizes to 0.02..12, reading numeric strings", () => {
    const out = modelOf(model([{ id: "p", shape: "sphere", pos: [40, -40, "3"], radius: 0 }]));
    assert.deepEqual(out.parts, [{ id: "p", shape: "sphere", pos: [12, -12, 3], radius: 0.02 }]);
  });

  it("clamps blade counts to 3..48 and rounds them, and clamps opacity to 0.05..1", () => {
    const blades = (id: string, count: number) => ({ id, shape: "blades", pos: [0, 0, 0], count, innerRadius: 1, outerRadius: 2, thickness: 0.1 });
    const out = modelOf(
      model([blades("few", 1), blades("many", 100), blades("odd", 18.6), sphere("faint", { opacity: 0 }), sphere("solid", { opacity: 3 })]),
    );
    assert.deepEqual(out.parts, [
      { id: "few", shape: "blades", pos: [0, 0, 0], count: 3, innerRadius: 1, outerRadius: 2, thickness: 0.1 },
      { id: "many", shape: "blades", pos: [0, 0, 0], count: 48, innerRadius: 1, outerRadius: 2, thickness: 0.1 },
      { id: "odd", shape: "blades", pos: [0, 0, 0], count: 19, innerRadius: 1, outerRadius: 2, thickness: 0.1 },
      { id: "faint", shape: "sphere", pos: [0, 0, 0], radius: 1, opacity: 0.05 },
      { id: "solid", shape: "sphere", pos: [0, 0, 0], radius: 1, opacity: 1 },
    ]);
  });

  it("drops parts with no position, an unknown shape or a missing size, and drops an unknown tone", () => {
    const out = modelOf(
      model([
        { id: "no-pos", shape: "sphere", radius: 1 },
        { id: "cone", shape: "cone", pos: [0, 0, 0], radius: 1 },
        { id: "no-size", shape: "box", pos: [0, 0, 0] },
        sphere("kept", { tone: "purple" }),
      ]),
    );
    assert.deepEqual(out.parts, [sphere("kept")]);
  });

  it("keeps the first of two parts that share an id, and at most 60 parts", () => {
    const out = modelOf(model([sphere("p0", { radius: 2 }), ...Array.from({ length: 70 }, (_, i) => sphere(`p${i}`))]));
    assert.equal(out.parts.length, 60);
    assert.deepEqual(out.parts[0], sphere("p0", { radius: 2 }));
  });

  it("drops labels with a bad number, text or target, sorts the rest and renumbers them 1 to k", () => {
    const out = modelOf(
      model(
        [sphere("fan"), sphere("turbine")],
        [
          { n: 3, text: "Turbine", target: "turbine" },
          { n: 9, text: "Out of range", target: "fan" },
          { n: "1", text: "Fan", target: "fan" },
          { n: 2, text: "Ghost", target: "nope" },
          { n: 2.5, text: "Fraction", target: "fan" },
          { n: 2, text: "Point", target: [40, 0, -40] },
          { n: 4, text: "", target: "fan" },
        ],
      ),
    );
    assert.deepEqual(out.labels, [
      { n: 1, text: "Fan", target: "fan" },
      { n: 2, text: "Point", target: [12, 0, -12] },
      { n: 3, text: "Turbine", target: "turbine" },
    ]);
  });

  it("keeps at most 8 labels", () => {
    const labels = Array.from({ length: 10 }, (_, i) => ({ n: (i % 8) + 1, text: `L${i}`, target: "fan" }));
    const out = modelOf(model([sphere("fan")], labels));
    assert.deepEqual(out.labels.map((label) => label.n), [1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("keeps cutaway and spin only when they are booleans", () => {
    const out = modelOf({ ...model([sphere("a")]), cutaway: "yes", spin: false });
    assert.deepEqual(out, { type: "model3d", title: "M", parts: [sphere("a")], labels: [], spin: false });
  });

  it("returns null for a model with no usable part", () => {
    assert.equal(sanitizeScene(model([])), null);
    assert.equal(sanitizeScene(model([{ id: "x", shape: "box", pos: [0, 0, 0] }])), null);
  });
});

describe("sanitizeScene on garbage", () => {
  it("returns null for anything that is not a usable note or model", () => {
    const garbage = [null, undefined, 42, "diagram", [], {}, { type: "diagram" }, { type: "model3d" }, { type: "chart", items: [] }, { type: "diagram", title: "x", items: "nope" }];
    for (const raw of garbage) assert.equal(sanitizeScene(raw), null, JSON.stringify(raw));
  });

  it("never throws, even when reading the input throws", () => {
    const hostile = {
      get type(): string {
        throw new Error("boom");
      },
    };
    assert.equal(sanitizeScene(hostile), null);
  });
});

describe("scenePrompt", () => {
  const prompt = scenePrompt();

  it("is under 3300 characters and has no em dash or en dash", () => {
    assert.ok(prompt.length < 3300, `${prompt.length} characters`);
    const dashCodes = [0x2013, 0x2014];
    assert.ok(![...prompt].some((char) => dashCodes.includes(char.codePointAt(0) ?? 0)));
  });

  it("names both types, every shape, the scene field and the null option", () => {
    for (const word of ["diagram", "model3d", "box", "text", "arrow", "highlight", "sphere", "cylinder", "torus", "blades", "scene", "null"]) {
      assert.match(prompt, new RegExp(`\\b${word}\\b`), word);
    }
  });

  it("ends with a worked note of 3 items that sanitizes to itself", () => {
    const example = JSON.parse(prompt.trimEnd().split("\n").pop() ?? "");
    assert.equal(example.type, "diagram");
    assert.equal(example.items.length, 3);
    assert.deepEqual(sanitizeScene(example), example);
  });

  it("is version 2", () => {
    assert.equal(SCENE_PROMPT_VERSION, 2);
  });
});
