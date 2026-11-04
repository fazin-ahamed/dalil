import { describe, it } from "node:test";
import assert from "node:assert/strict";
// Node resolves the explicit extension; tsc only allows it with allowImportingTsExtensions.
// @ts-expect-error TS5097
import * as context from "./context.ts";
import type { ContextSnapshot } from "./contracts";

const { describeContext, shortApp, getContext } = context;

const snap = (app: string, title = "", source = "niri"): ContextSnapshot => ({ app, title, source });

describe("describeContext", () => {
  it("names the app and the window title", () => {
    assert.equal(describeContext(snap("Figma", "Frame 12 - Design")), 'Using Figma: "Frame 12 - Design"');
  });

  it("is empty without a context, or without an app or a title", () => {
    assert.equal(describeContext(null), "");
    assert.equal(describeContext(snap("", "")), "");
  });

  it("drops the title part when the title is blank", () => {
    assert.equal(describeContext(snap("Figma", "   ")), "Using Figma");
  });

  it("falls back to the window title when the app is unknown", () => {
    assert.equal(describeContext(snap("  ", "Inbox")), 'Window: "Inbox"');
  });

  it("collapses whitespace and line breaks in the title", () => {
    assert.equal(describeContext(snap("Notes", "Line one\n\tLine two  ")), 'Using Notes: "Line one Line two"');
  });

  it("cuts a long title to 80 characters and marks the cut with dots", () => {
    assert.equal(describeContext(snap("Figma", "a".repeat(120))), `Using Figma: "${"a".repeat(77)}..."`);
    assert.equal(describeContext(snap("Figma", "b".repeat(80))), `Using Figma: "${"b".repeat(80)}"`);
  });

  it("counts characters, not UTF-16 code units", () => {
    const pen = "\u{1F58B}";
    assert.equal(describeContext(snap("Figma", pen.repeat(90))), `Using Figma: "${pen.repeat(77)}..."`);
  });
});

describe("shortApp", () => {
  it("turns app ids and executable names into readable names", () => {
    const cases: [string, string][] = [
      ["org.mozilla.firefox", "Firefox"],
      ["org.gnome.Nautilus.desktop", "Nautilus"],
      ["com.github.hluk.copyq", "Copyq"],
      ["figma.exe", "Figma"],
      ["google-chrome_beta", "Google Chrome Beta"],
      ["Visual Studio Code", "Visual Studio Code"],
      ["Node.js", "Node.js"],
    ];
    for (const [app, name] of cases) assert.equal(shortApp(snap(app)), name, app);
  });

  it("is empty when the app is unknown", () => {
    assert.equal(shortApp(null), "");
    assert.equal(shortApp(snap("   ")), "");
    assert.equal(shortApp(snap("-_-")), "");
  });
});

describe("getContext", () => {
  it("is null outside Tauri", async () => {
    assert.equal(await getContext(), null);
  });

  it("is null when the Tauri bridge is present but the call fails", async () => {
    const host = globalThis as { window?: unknown };
    host.window = { __TAURI_INTERNALS__: {} };
    try {
      assert.equal(await getContext(), null);
    } finally {
      delete host.window;
    }
  });
});
