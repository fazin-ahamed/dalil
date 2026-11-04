import type { ContextSnapshot } from "./contracts";

/** Longest window title shown, in characters. */
const TITLE_LIMIT = 80;

/** True inside the Tauri webview. The same check as native-bridge.ts, kept local so tests can load this file. */
function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * The focused app and window title from Rust. Null outside Tauri, when Rust finds no supported source
 * (no compositor tool, no X11 window, macOS), and on any error.
 */
export async function getContext(): Promise<ContextSnapshot | null> {
  if (!inTauri()) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return (await invoke<ContextSnapshot | null>("active_context")) ?? null;
  } catch {
    return null;
  }
}

/**
 * A readable app name: `org.mozilla.firefox` becomes `Firefox`, `figma.exe` becomes `Figma` and
 * `google-chrome_beta` becomes `Google Chrome Beta`. Empty when the app is unknown.
 */
export function shortApp(c: ContextSnapshot | null): string {
  const name = (c?.app ?? "")
    .trim()
    .replace(/\.(?:desktop|exe)$/i, "")
    .replace(/^(?:[a-z][\w-]*\.){2,}/i, "")
    .replace(/[-_]+/g, " ");
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** One line for the prompt, e.g. `Using Figma: "Frame 12 - Design"`. Empty when nothing is known. */
export function describeContext(c: ContextSnapshot | null): string {
  if (!c) return "";
  const app = shortApp(c);
  const title = clip(c.title);
  if (!app) return title ? `Window: "${title}"` : "";
  return title ? `Using ${app}: "${title}"` : `Using ${app}`;
}

/** Collapses whitespace and cuts the title to TITLE_LIMIT characters, ending a cut title with "...". */
function clip(title: string): string {
  const text = title.replace(/\s+/g, " ").trim();
  const chars = Array.from(text);
  return chars.length > TITLE_LIMIT ? `${chars.slice(0, TITLE_LIMIT - 3).join("")}...` : text;
}
