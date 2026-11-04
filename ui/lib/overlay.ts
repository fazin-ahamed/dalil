import type { OverlayCommand, ScreenBounds } from "./contracts";
import { isTauri } from "./native-bridge";

/** Time for the overlay's own 200 ms fade to finish before its window is hidden. */
const HIDE_AFTER_CLEAR_MS = 400;
let revision = 0;

/**
 * Sends one command to the overlay window and shows that window for it. A clear fades the scene out
 * and then hides the window. Does nothing outside the desktop app.
 */
/** Lets the mouse reach these rectangles (window pixels) on the overlay and nowhere else. [] = click-through. */
export async function setOverlayInput(rects: [number, number, number, number][]): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("overlay_set_input", { rects });
}

export async function sendOverlay(cmd: OverlayCommand, screen?: ScreenBounds): Promise<void> {
  if (!isTauri()) return;
  const current = ++revision;
  const { invoke } = await import("@tauri-apps/api/core");
  const { emitTo } = await import("@tauri-apps/api/event");
  if (cmd.kind !== "clear" && cmd.kind !== "stop-teaching") await invoke("overlay_show", { screen: screen ?? ("screen" in cmd ? cmd.screen : undefined) ?? null });
  await emitTo("overlay", "dalil://overlay", cmd);
  if (cmd.kind === "clear") {
    await new Promise((resolve) => setTimeout(resolve, HIDE_AFTER_CLEAR_MS));
    if (current === revision) await invoke("overlay_hide");
  }
}
