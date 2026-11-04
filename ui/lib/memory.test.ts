import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Lesson, Mark } from "./contracts";
// Node resolves the explicit extension; tsc only allows it with allowImportingTsExtensions.
// @ts-expect-error TS5097
import * as memory from "./memory.ts";

const { listLessons, addLesson, deleteLesson, clearLessons, recall, formatForPrompt } = memory;

const at = (day: number) => `2026-01-${String(day).padStart(2, "0")}T09:00:00Z`;

const lesson = (id: string, topic: string, note: string, overrides: Partial<Lesson> = {}): Lesson => ({
  id,
  topic,
  note,
  kind: "learned",
  createdAt: at(1),
  seen: 1,
  ...overrides,
});

const mark = (n: number, label: string): Mark => ({ n, label, x: 100, y: 200 });

const figma = lesson("1", "Figma auto layout", "Padding and spacing are separate.", { kind: "struggled" });
const layers = lesson("2", "Figma frames", "Rename layers before you group them.", { createdAt: at(2) });
const shortcuts = lesson("3", "Keyboard shortcuts", "Cmd K opens search.", { seen: 50, createdAt: at(3) });

describe("recall", () => {
  it("puts the lesson that shares the most words first", () => {
    const ids = recall([layers, figma], "figma auto layout padding").map((l) => l.id);
    assert.deepEqual(ids, ["1", "2"]);
  });

  it("drops lessons that share no word, however often they were seen", () => {
    const ids = recall([figma, shortcuts], "figma auto layout padding").map((l) => l.id);
    assert.deepEqual(ids, ["1"]);
  });

  it("ignores case and punctuation", () => {
    assert.deepEqual(recall([figma], "FIGMA, auto-layout!").map((l) => l.id), ["1"]);
  });

  it("uses the seen count to break a tie", () => {
    const once = lesson("a", "Frames", "Group first.", { seen: 1 });
    const often = lesson("b", "Frames", "Group first.", { seen: 4 });
    assert.deepEqual(recall([once, often], "frames").map((l) => l.id), ["b", "a"]);
  });

  it("uses the newer lesson to break a tie when seen counts match", () => {
    const older = lesson("a", "Frames", "Group first.", { createdAt: at(1) });
    const newer = lesson("b", "Frames", "Group first.", { createdAt: at(9) });
    assert.deepEqual(recall([older, newer], "frames").map((l) => l.id), ["b", "a"]);
  });

  it("lets shared words outweigh seen count and recency", () => {
    const broad = lesson("a", "Frames", "Group first.", { seen: 5, createdAt: at(9) });
    const exact = lesson("b", "Figma frames", "Group first.", { seen: 1, createdAt: at(1) });
    assert.deepEqual(recall([broad, exact], "figma frames").map((l) => l.id), ["b", "a"]);
  });

  it("puts a lesson of the active project before a global one with the same words", () => {
    const global = lesson("g", "Frames", "Group first.");
    const mine = lesson("p", "Frames", "Group first.", { projectId: "p1" });
    assert.deepEqual(recall([global, mine], "frames", 5, "p1").map((l) => l.id), ["p", "g"]);
  });

  it("still puts a global lesson with one more shared word first", () => {
    const mine = lesson("p", "Frames", "Group first.", { projectId: "p1" });
    const global = lesson("g", "Figma frames", "Group first.");
    assert.deepEqual(recall([mine, global], "figma frames", 5, "p1").map((l) => l.id), ["g", "p"]);
  });

  it("returns five lessons by default and at most the limit you ask for", () => {
    const many = Array.from({ length: 7 }, (_, i) => lesson(`m${i}`, `Frames ${i}`, "Group first.", { createdAt: at(i + 1) }));
    assert.equal(recall(many, "frames").length, 5);
    assert.equal(recall(many, "frames", 2).length, 2);
    assert.equal(recall(many, "frames", 0).length, 0);
  });

  it("recalls nothing for an empty query or an empty list", () => {
    assert.deepEqual(recall([figma], ""), []);
    assert.deepEqual(recall([figma], "  !! "), []);
    assert.deepEqual(recall([], "figma"), []);
  });
});

describe("formatForPrompt", () => {
  it("is an empty string for no lessons", () => {
    assert.equal(formatForPrompt([]), "");
  });

  it("writes one bullet per lesson with its kind, and never an id", () => {
    const text = formatForPrompt([
      lesson("SECRET-ID-1", "Figma auto layout", "Padding and spacing are\nseparate.", { kind: "struggled" }),
      lesson("SECRET-ID-2", "Keyboard shortcuts", "Cmd K opens search.", { kind: "asked" }),
    ]);
    assert.equal(
      text,
      "- Figma auto layout (struggled): Padding and spacing are separate.\n- Keyboard shortcuts (asked): Cmd K opens search.",
    );
    assert.equal(text.includes("SECRET-ID"), false);
  });
});

describe("the store outside Tauri", () => {
  beforeEach(async () => {
    await clearLessons();
  });

  it("merges a repeated topic, ignoring case and spaces, and keeps the first id and topic text", async () => {
    const first = await addLesson("Figma auto layout", "Padding vs spacing.", "struggled", "Figma");
    const again = await addLesson("  figma AUTO layout ", "Set spacing first.", "learned");
    assert.equal(first.seen, 1);
    assert.equal(again.id, first.id);
    assert.equal(again.topic, "Figma auto layout");
    assert.equal(again.note, "Set spacing first.");
    assert.equal(again.kind, "learned");
    assert.equal(again.seen, 2);
    assert.equal((await listLessons()).length, 1);
  });

  it("rejects an empty topic or note", async () => {
    await assert.rejects(addLesson("  ", "note", "asked"), /empty-topic/);
    await assert.rejects(addLesson("topic", "  ", "asked"), /empty-note/);
    assert.deepEqual(await listLessons(), []);
  });

  it("lists newest first, deletes one lesson and clears the rest", async () => {
    const frames = await addLesson("Frames", "Group first.", "learned");
    await addLesson("Pen tool", "Click, do not drag.", "struggled");
    assert.deepEqual((await listLessons()).map((l) => l.topic), ["Pen tool", "Frames"]);
    await deleteLesson(frames.id);
    assert.deepEqual((await listLessons()).map((l) => l.topic), ["Pen tool"]);
    await clearLessons();
    assert.deepEqual(await listLessons(), []);
  });

  it("keeps one topic per project, and lists a project with the global lessons", async () => {
    const global = await addLesson("Frames", "Group first.", "learned");
    const mine = await addLesson("Frames", "Group inside the frame.", "struggled", undefined, "p1");
    const theirs = await addLesson("Pen tool", "Click, do not drag.", "asked", undefined, "p2");
    assert.notEqual(mine.id, global.id);
    assert.deepEqual((await listLessons("p1")).map((l) => l.id), [mine.id, global.id]);
    assert.deepEqual((await listLessons()).map((l) => l.id), [theirs.id, mine.id, global.id]);
  });

  it("keeps the newest marks when a topic is refreshed, and a refresh without marks keeps them", async () => {
    const first = await addLesson("Pen tool", "Click, do not drag.", "struggled", undefined, undefined, [mark(1, "Anchor")]);
    const again = await addLesson("Pen tool", "Click at each corner.", "learned", undefined, undefined, [mark(1, "Corner")]);
    assert.equal(again.id, first.id);
    assert.deepEqual(again.marks?.map((m) => m.label), ["Corner"]);
    const kept = await addLesson("pen tool", "Click at each corner.", "learned");
    assert.deepEqual(kept.marks?.map((m) => m.label), ["Corner"]);
  });
});
