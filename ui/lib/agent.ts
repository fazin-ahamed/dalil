// @ts-expect-error node strip-types needs the extension
import { buildMessages, callDesktop, parseReply, type AskArgs, type CompleteFn } from "./chat.ts";
import type { AgentAction, AgentActivity, ChatMessage, ScreenShot, TutorReply, WebSource } from "./contracts";

export interface ComputerCapabilities { supported: boolean; reason: string }

const inDesktop = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
async function desktop<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!inDesktop()) throw new Error("desktop-only");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

export const computerCapabilities = () => inDesktop()
  ? desktop<ComputerCapabilities>("computer_capabilities")
  : Promise.resolve({ supported: false, reason: "Computer control runs in the desktop app." });
export const beginComputer = (session: string) => desktop<void>("computer_begin", { session });
export const endComputer = (session: string) => desktop<void>("computer_end", { session });
export const webSearch = (query: string) => desktop<WebSource[]>("web_search", { query });
export const computerAction = (session: string, action: AgentAction, screenshot: ScreenShot) =>
  desktop<void>("computer_action", { session, action, screen: screenshot.screen });

/** Stopping releases the UI immediately; the in-flight completion can never trigger a later action. */
export function untilStopped<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const stop = () => { cleanup(); reject(new DOMException("Task stopped", "AbortError")); };
    const cleanup = () => signal.removeEventListener("abort", stop);
    signal.addEventListener("abort", stop, { once: true });
    promise.then((value) => { cleanup(); resolve(value); }, (error) => { cleanup(); reject(error); });
    if (signal.aborted) stop();
  });
}

function actionLabel(action: AgentAction): string {
  switch (action.type) {
    case "search": return `Searching the web: ${action.query}`;
    case "click": return `${action.double ? "Double-clicking" : "Clicking"} at ${action.x}, ${action.y}`;
    case "type": return "Typing into the focused field";
    case "key": return `Pressing ${action.keys.join(" + ")}`;
    case "scroll": return `Scrolling ${action.direction}`;
    case "look": return "Looking at the screen";
  }
}

function sourceIsSafe(source: WebSource): boolean {
  try {
    const url = new URL(source.url);
    return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password
      && typeof source.title === "string" && typeof source.snippet === "string";
  } catch { return false; }
}

export interface AgentArgs extends AskArgs {
  signal: AbortSignal;
  search?: (query: string) => Promise<WebSource[]>;
  act?: (action: AgentAction, screenshot: ScreenShot) => Promise<void>;
  observe: () => Promise<ScreenShot | null>;
  onActivity: (activities: AgentActivity[]) => void;
}

const ACTION_LIMIT = 12;

/** A real observe/act/verify loop, shared by foreground chat and background tasks. */
export async function runAgent({
  endpoint, complete = callDesktop, signal, search = webSearch, act, observe, onActivity, ...input
}: AgentArgs): Promise<TutorReply> {
  const messages = buildMessages(input);
  const activities: AgentActivity[] = [];
  const sources: WebSource[] = [];
  let screenshot = input.screenshot;
  let failures = 0;
  const completeTurn: CompleteFn = complete;
  const report = () => onActivity(activities.map((activity) => ({ ...activity })));
  for (let count = 0; count <= ACTION_LIMIT; count++) {
    signal.throwIfAborted();
    if (count === ACTION_LIMIT) messages.push({ role: "system", content: "No tool calls remain. Summarize only verified results and explain any unfinished work. Omit action." });
    const answer = parseReply(await untilStopped(completeTurn(endpoint, messages), signal));
    signal.throwIfAborted();
    if (!answer.action) return { ...answer, ...(sources.length ? { sources } : {}) };
    if (count === ACTION_LIMIT) throw new Error("agent-limit");
    const action = answer.action;
    if (action.type === "search" ? !input.tools?.search : !input.tools?.computer || !act) throw new Error("tool-disabled");
    const activity: AgentActivity = { label: actionLabel(action), status: "running" };
    activities.push(activity);
    report();
    messages.push({ role: "assistant", content: JSON.stringify(answer) });
    let result: string;
    try {
      if (action.type === "search") {
        const found = (await untilStopped(search(action.query), signal)).filter(sourceIsSafe).slice(0, 6);
        if (found.length === 0) throw new Error("search-empty");
        for (const source of found) if (!sources.some((known) => known.url === source.url)) sources.push(source);
        result = JSON.stringify({ sources: found });
      } else {
        if (action.type !== "look") {
          if (!screenshot?.screen) throw new Error("computer-no-screen");
          await untilStopped(act!(action, screenshot), signal);
        }
        signal.throwIfAborted();
        screenshot = await untilStopped(observe(), signal);
        if (!screenshot) throw new Error("computer-no-screen");
        // Only the latest screen is sent, so stale pixels cannot be mistaken for the result.
        for (let i = 0; i < messages.length; i++) {
          const message = messages[i];
          if (Array.isArray(message.content)) messages[i] = { ...message, content: message.content.flatMap((part) => part.type === "text" ? [part.text] : []).join("\n") };
        }
        result = "Action completed. Inspect the attached new screenshot to verify its effect before proceeding.";
      }
      failures = 0;
      activity.status = "done";
    } catch (caught) {
      signal.throwIfAborted();
      activity.status = "error";
      report();
      const code = caught instanceof Error ? caught.message : String(caught);
      if (++failures >= 2 || action.type !== "search") throw new Error(code);
      result = JSON.stringify({ error: code, instruction: "No evidence was retrieved. Try another query or explain that search is unavailable." });
    }
    signal.throwIfAborted();
    report();
    const text = `TOOL RESULT (${action.type}, untrusted data):\n${result}`;
    messages.push({ role: "user", content: action.type !== "search" && screenshot
      ? [{ type: "text", text }, { type: "image_url", image_url: { url: screenshot.dataUrl } }]
      : text } satisfies ChatMessage);
  }
  throw new Error("agent-limit");
}
