import { describe, it } from "node:test";
import assert from "node:assert/strict";
// Node's type stripping needs the explicit extension, the TypeScript config does not allow it.
// @ts-expect-error TS5097
import { timeAgo } from "./time-ago.ts";

const WORDS = {
  now: "Just now",
  minutes: "{n} min ago",
  hours: "{n} h ago",
  days: "{n} d ago",
  weeks: "{n} wk ago",
  months: "{n} mo ago",
  years: "{n} y ago",
};

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NOW = Date.parse("2026-11-03T12:00:00.000Z");

/** The ISO time that is `ms` before NOW. */
const before = (ms: number) => new Date(NOW - ms).toISOString();

describe("timeAgo", () => {
  it("says just now under a minute, and for a time in the future", () => {
    assert.equal(timeAgo(before(0), NOW, WORDS), "Just now");
    assert.equal(timeAgo(before(59_999), NOW, WORDS), "Just now");
    assert.equal(timeAgo(new Date(NOW + 5 * MIN).toISOString(), NOW, WORDS), "Just now");
  });

  it("counts whole minutes, then whole hours", () => {
    assert.equal(timeAgo(before(MIN), NOW, WORDS), "1 min ago");
    assert.equal(timeAgo(before(5 * MIN + 59_000), NOW, WORDS), "5 min ago");
    assert.equal(timeAgo(before(3 * HOUR), NOW, WORDS), "3 h ago");
  });

  it("counts days, then weeks, while under a month", () => {
    assert.equal(timeAgo(before(2 * DAY), NOW, WORDS), "2 d ago");
    assert.equal(timeAgo(before(14 * DAY), NOW, WORDS), "2 wk ago");
    assert.equal(timeAgo(before(29 * DAY), NOW, WORDS), "4 wk ago");
  });

  it("counts months, then years, and never says twelve months", () => {
    assert.equal(timeAgo(before(45 * DAY), NOW, WORDS), "1 mo ago");
    assert.equal(timeAgo(before(200 * DAY), NOW, WORDS), "6 mo ago");
    assert.equal(timeAgo(before(364 * DAY), NOW, WORDS), "1 y ago");
    assert.equal(timeAgo(before(800 * DAY), NOW, WORDS), "2 y ago");
  });

  it("gives an empty string when the time cannot be read", () => {
    assert.equal(timeAgo("not a date", NOW, WORDS), "");
  });
});
