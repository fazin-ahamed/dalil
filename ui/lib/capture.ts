import type { ScreenShot } from "./contracts";

/** True inside the Tauri webview. The same check as in context.ts, kept local so Node can load this file. */
function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * The focused screen as a JPEG data URL, captured by Rust. Null outside the desktop app, when no capture tool
 * is available or the image is too large, and on any error.
 */
export async function captureScreen(): Promise<ScreenShot | null> {
  if (!inTauri()) return null;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    return (await invoke<ScreenShot | null>("capture_screen")) ?? null;
  } catch {
    return null;
  }
}
