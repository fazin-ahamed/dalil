import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error Node's type stripping needs the explicit extension, the TypeScript config does not allow it.
import { placeCard } from "./placement.ts";

const container = { x: 0, y: 0, width: 1200, height: 800 };
const card = { width: 400, height: 300 };

describe("placeCard", () => {
  it("prefers the side with the most free space", () => {
    const target = { x: 100, y: 350, width: 120, height: 40 };
    const result = placeCard(target, container, card);
    assert.equal(result.side, "right");
    assert.equal(result.x, 100 + 120 + 24);
    assert.equal(result.y, 350 + 20 - 150);
  });

  it("goes left when the target sits near the right edge", () => {
    const target = { x: 1000, y: 350, width: 120, height: 40 };
    const result = placeCard(target, container, card);
    assert.equal(result.side, "left");
    assert.equal(result.x, 1000 - 24 - 400);
  });

  it("never overlaps the target and keeps the 24px margin", () => {
    const target = { x: 500, y: 300, width: 100, height: 60 };
    const result = placeCard(target, container, card);
    const gap =
      result.side === "right" ? result.x - (target.x + target.width)
      : result.side === "left" ? target.x - (result.x + card.width)
      : result.side === "bottom" ? result.y - (target.y + target.height)
      : target.y - (result.y + card.height);
    assert.ok(gap >= 24);
  });

  it("uses top or bottom when neither horizontal side fits", () => {
    const narrow = { x: 0, y: 0, width: 420, height: 900 };
    const target = { x: 150, y: 120, width: 120, height: 40 };
    const result = placeCard(target, narrow, card);
    assert.equal(result.side, "bottom");
    assert.equal(result.y, 120 + 40 + 24);
    assert.ok(result.x >= 0 && result.x + card.width <= 420);
  });

  it("goes above a target near the bottom of a narrow container", () => {
    const narrow = { x: 0, y: 0, width: 420, height: 900 };
    const target = { x: 150, y: 780, width: 120, height: 40 };
    const result = placeCard(target, narrow, card);
    assert.equal(result.side, "top");
    assert.equal(result.y, 780 - 24 - 300);
  });

  it("clamps the card inside the container", () => {
    const target = { x: 100, y: 10, width: 120, height: 40 };
    const result = placeCard(target, container, card);
    assert.equal(result.side, "right");
    assert.equal(result.y, 0);
    const low = placeCard({ x: 100, y: 780, width: 120, height: 20 }, container, card);
    assert.equal(low.y, 800 - 300);
  });

  it("respects a container that does not start at the origin", () => {
    const offset = { x: 200, y: 100, width: 1000, height: 700 };
    const target = { x: 260, y: 400, width: 100, height: 40 };
    const result = placeCard(target, offset, card);
    assert.equal(result.side, "right");
    assert.ok(result.x >= 200 && result.y >= 100);
    assert.ok(result.x + card.width <= 1200 && result.y + card.height <= 800);
  });

  it("falls back to the roomiest side when nothing fits", () => {
    const small = { x: 0, y: 0, width: 300, height: 200 };
    const target = { x: 40, y: 80, width: 60, height: 40 };
    const result = placeCard(target, small, card);
    assert.equal(result.side, "right");
    assert.equal(result.x, 0);
  });

  it("honours a custom margin", () => {
    const target = { x: 100, y: 350, width: 120, height: 40 };
    const result = placeCard(target, container, card, 40);
    assert.equal(result.x, 100 + 120 + 40);
  });
});
