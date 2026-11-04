import type { OverlayCommand } from "./contracts";
import { isTauri } from "./native-bridge";

/** Time for the overlay's own 200 ms fade to finish before its window is hidden. */
const HIDE_AFTER_CLEAR_MS = 400;

/**
 * Sends one command to the overlay window and shows that window for it. A clear fades the scene out
 * and then hides the window. Does nothing outside the desktop app.
 */
export async function sendOverlay(cmd: OverlayCommand): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  const { emitTo } = await import("@tauri-apps/api/event");
  if (cmd.kind !== "clear") await invoke("overlay_show");
  await emitTo("overlay", "dalil://overlay", cmd);
  if (cmd.kind === "clear") {
    await new Promise((resolve) => setTimeout(resolve, HIDE_AFTER_CLEAR_MS));
    await invoke("overlay_hide");
  }
}
