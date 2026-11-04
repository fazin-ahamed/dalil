import type { FetchInit, FetchLike, FetchResponseLike } from "@/lib/endpoint";

/** True inside the Tauri webview. In a plain browser every bridge call is skipped. */
export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

interface NativeResponse {
  status: number;
  url: string;
  headers: Record<string, string>;
  body: string;
}

function abortError(): Error {
  const error = new Error("The operation was aborted.");
  error.name = "AbortError";
  return error;
}

/**
 * fetch for the desktop app: the request leaves from Rust, so there is no CORS and redirects come
 * back as plain 3xx responses for the caller to check. Network failures reject with a TypeError,
 * the way a browser does, so the shared classifier treats both worlds the same.
 */
export const nativeFetch: FetchLike = async (url: string, init: FetchInit = {}): Promise<FetchResponseLike> => {
  if (init.signal?.aborted) throw abortError();
  let response: NativeResponse;
  try {
    response = await invoke<NativeResponse>("http_request", {
      req: { url, method: init.method ?? "GET", headers: init.headers ?? {}, body: init.body ?? null, timeoutMs: 20000 },
    });
  } catch (error) {
    if (init.signal?.aborted || error === "timeout") throw abortError();
    throw new TypeError("fetch failed");
  }
  if (init.signal?.aborted) throw abortError();
  return {
    status: response.status,
    ok: response.status >= 200 && response.status < 300,
    url: response.url,
    headers: { get: (name: string) => response.headers[name.toLowerCase()] ?? null },
    text: async () => response.body,
  };
};

export interface StoredEndpoint {
  base: string;
  host: string;
  local: boolean;
  model: string;
  useScreenshots: boolean;
  headerName: string;
  scheme: string;
  /** Voice settings. Missing or empty means the defaults. */
  sttModel?: string;
  ttsModel?: string;
  ttsVoice?: string;
}

export interface LoadedEndpoint extends StoredEndpoint {
  hasKey: boolean;
}

export const saveEndpoint = (endpoint: StoredEndpoint, key: string) => invoke<void>("save_endpoint", { endpoint, key });
export const loadEndpoint = () => (isTauri() ? invoke<LoadedEndpoint | null>("load_endpoint") : Promise.resolve(null));
export const setInteractive = (on: boolean) => (isTauri() ? invoke<void>("set_interactive", { on }) : Promise.resolve());
/** "region": the page hears the pointer itself. "poll": Rust reports the cursor. See set_input_rect. */
export const inputMode = () => (isTauri() ? invoke<"region" | "poll">("input_mode") : Promise.resolve("poll" as const));
export const setInputRect = (x: number, y: number, w: number, h: number) =>
  isTauri() ? invoke<void>("set_input_rect", { x, y, w, h }) : Promise.resolve();
export const setKeyboard = (on: boolean) => (isTauri() ? invoke<void>("set_keyboard", { on }) : Promise.resolve());
export const quitApp = () => invoke<void>("quit_app");
export interface DesktopShortcut { command: string; label: string; keys: string; registered: boolean }
export const desktopShortcuts = () => isTauri() ? invoke<DesktopShortcut[]>("desktop_shortcuts") : Promise.resolve([]);

export async function onShortcutsChanged(handler: (shortcuts: DesktopShortcut[]) => void): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen<DesktopShortcut[]>("dalil://shortcuts-changed", (event) => handler(event.payload));
}
export const openWebUrl = (url: string) => invoke<void>("open_web_url", { url });
export const setScreenshots = (enabled: boolean) => isTauri() ? invoke<void>("set_screenshots", { enabled }) : Promise.reject(new Error("desktop-only"));

/** Clicking another app dismisses the notch while its tasks keep running. */
export async function onWindowBlur(handler: () => void): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  return getCurrentWindow().onFocusChanged(({ payload }) => { if (!payload) handler(); });
}

/** Calls `handler` whenever the saved endpoint changes. Returns an unsubscribe function. */
export async function onEndpointChanged(handler: () => void): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen("dalil://endpoint-changed", handler);
}

export type DesktopCommand = "talk" | "ask" | "quit" | "toggle" | "hide" | "setup";
/** Launch flags, tray actions and Windows global shortcuts share this command channel. */
export async function onCommand(handler: (c: DesktopCommand) => void): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen<DesktopCommand>("dalil://command", (event) => handler(event.payload));
}
