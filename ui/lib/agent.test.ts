import { test } from "node:test";
import assert from "node:assert/strict";
// @ts-expect-error node strip-types needs the extension
import { runAgent, untilStopped } from "./agent.ts";
// @ts-expect-error node strip-types needs the extension
import { parseReply, readAction } from "./chat.ts";
import type { AgentActivity, ChatMessage, ScreenShot, WebSource } from "./contracts";

const endpoint = { base: "https://example.com/v1", model: "test", headerName: "Authorization", scheme: "Bearer" as const };
const result = (text: string, action?: unknown) => JSON.stringify({ text, steps: [], marks: [], topic: null, kind: "asked", ...(action ? { action } : {}) });
const source: WebSource = { title: "Documentation", url: "https://example.com/docs", snippet: "Verified information." };
const shot = (name: string): ScreenShot => ({ dataUrl: `data:image/jpeg;base64,${name}`, width: 1280, height: 720, screen: { x: 0, y: 0, width: 1920, height: 1080 } });
const base = () => ({ endpoint, userText: "Explain this", context: null, memory: "", history: [] as ChatMessage[], signal: new AbortController().signal, observe: async () => shot("new"), onActivity: () => {} });

test("explanations retain paragraphs and examples past the old 600-character limit", () => {
  const text = "Here is the idea.\n\n" + "A concrete example with a reason. ".repeat(45);
  assert.equal(parseReply(result(text)).text, text.trim());
});

test("validates model actions and rejects shell-like or modifier-only keys", () => {
  assert.deepEqual(readAction({ type: "key", keys: ["ctrl", "l"] }), { type: "key", keys: ["CTRL", "L"] });
  for (const action of [
    { type: "key", keys: ["CTRL"] }, { type: "key", keys: ["A", "B"] },
    { type: "key", keys: ["CTRL", "$(cmd)"] }, { type: "click", x: 1001, y: 5 },
    { type: "click", x: NaN, y: 5 }, { type: "scroll", direction: "down", amount: -3 },
    { type: "type", text: "a\0b" }, { type: "shell", command: "rm" },
  ]) {
    assert.equal(readAction(action), undefined);
    assert.throws(() => parseReply(result("Invalid action", action)), /bad-action/);
  }
});

test("web search passes real evidence back to the model and filters unsafe sources", async () => {
  let calls = 0;
  const activity: AgentActivity[][] = [];
  const answer = await runAgent({ ...base(), tools: { search: true, computer: false },
    search: async () => [source, { ...source, url: "javascript:alert(1)" }],
    onActivity: (value) => activity.push(value),
    complete: async (_endpoint, messages) => {
      if (calls++ === 0) return result("Looking up the docs", { type: "search", query: "official docs" });
      assert.match(JSON.stringify(messages.at(-1)), /TOOL RESULT.*untrusted data/);
      assert.match(JSON.stringify(messages.at(-1)), /Verified information/);
      assert.doesNotMatch(JSON.stringify(messages.at(-1)), /javascript:/);
      return result("The documented answer.");
    },
  });
  assert.deepEqual(answer.sources, [source]);
  assert.equal(calls, 2);
  assert.equal(activity.at(-1)?.[0].status, "done");
});

test("disabled tools cannot run even when the model requests them", async () => {
  let executed = false;
  await assert.rejects(runAgent({ ...base(), complete: async () => result("Search", { type: "search", query: "hi" }), search: async () => { executed = true; return [source]; } }), /tool-disabled/);
  await assert.rejects(runAgent({ ...base(), tools: { search: true, computer: false }, complete: async () => result("Click", { type: "click", x: 2, y: 2 }), act: async () => { executed = true; } }), /tool-disabled/);
  assert.equal(executed, false);
});

test("computer tasks observe after each action and send only the latest screenshot", async () => {
  const events: string[] = [];
  let call = 0;
  const answer = await runAgent({ ...base(), screenshot: shot("original"), tools: { search: false, computer: true },
    act: async (action, screenshot) => { events.push(action.type); assert.equal(screenshot.dataUrl, shot(call === 1 ? "original" : "new").dataUrl); },
    observe: async () => { events.push("observe"); return shot("new"); },
    complete: async (_endpoint, messages) => {
      call++;
      if (call === 1) return result("Opening field", { type: "click", x: 450, y: 500 });
      assert.equal(messages.filter((m) => Array.isArray(m.content)).length, 1);
      assert.doesNotMatch(JSON.stringify(messages), /base64,original/);
      if (call === 2) return result("Entering text", { type: "type", text: "Hello" });
      return result("The new screenshot shows Hello in the field.");
    },
  });
  assert.deepEqual(events, ["click", "observe", "type", "observe"]);
  assert.match(answer.text, /screenshot shows/);
});

test("no desktop input is attempted without a captured display", async () => {
  let executed = false;
  await assert.rejects(runAgent({ ...base(), tools: { search: false, computer: true },
    complete: async () => result("Click", { type: "click", x: 500, y: 500 }),
    act: async () => { executed = true; },
  }), /computer-no-screen/);
  assert.equal(executed, false);
});

test("Stop takes effect during an in-flight completion and late replies cannot act", async () => {
  const controller = new AbortController();
  let finish!: (value: string) => void;
  let executed = false;
  const pending = new Promise<string>((resolve) => { finish = resolve; });
  const run = runAgent({ ...base(), signal: controller.signal, tools: { search: true, computer: true }, screenshot: shot("original"),
    complete: () => pending, act: async () => { executed = true; },
  });
  controller.abort();
  await assert.rejects(run, { name: "AbortError" });
  finish(result("Click", { type: "click", x: 500, y: 500 }));
  await Promise.resolve();
  assert.equal(executed, false);
});

test("Stop also prevents observing or continuing after an in-flight action", async () => {
  const controller = new AbortController();
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => { finish = resolve; });
  let observed = false;
  const run = runAgent({ ...base(), signal: controller.signal, tools: { search: false, computer: true }, screenshot: shot("original"),
    complete: async () => result("Click", { type: "click", x: 500, y: 500 }),
    act: () => { controller.abort(); return pending; }, observe: async () => { observed = true; return shot("new"); },
  });
  await assert.rejects(run, { name: "AbortError" });
  finish();
  await Promise.resolve();
  assert.equal(observed, false);
});

test("repeated search errors stop with an honest error and an error activity", async () => {
  let searches = 0;
  let activities: AgentActivity[] = [];
  await assert.rejects(runAgent({ ...base(), tools: { search: true, computer: false },
    complete: async () => result("Search", { type: "search", query: "docs" }),
    search: async () => { searches++; throw new Error("search-unavailable"); },
    onActivity: (value) => { activities = value; },
  }), /search-unavailable/);
  assert.equal(searches, 2);
  assert.equal(activities.at(-1)?.status, "error");
});

test("the tool budget stops a looping model after twelve actions", async () => {
  let searches = 0;
  await assert.rejects(runAgent({ ...base(), tools: { search: true, computer: false },
    complete: async () => result("Search again", { type: "search", query: "docs" }),
    search: async () => { searches++; return [source]; },
  }), /agent-limit/);
  assert.equal(searches, 12);
});

test("an already-stopped promise is still handled without an unhandled rejection", async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(untilStopped(Promise.reject(new Error("late transport error")), controller.signal), { name: "AbortError" });
});
