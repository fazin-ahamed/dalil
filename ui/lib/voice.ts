/**
 * Voice in and out for the desktop app. Recording, speech-to-text and text-to-speech all run in Rust
 * (src-tauri/src/voice.rs), which reads the saved endpoint and its key from the OS keychain. This file
 * starts and stops the recording, passes the microphone level to the notch, plays a spoken reply, and
 * turns short error codes into sentences. Apart from dynamic imports of the Tauri bridge it is plain
 * TypeScript, so Node can run its tests.
 */

/** The event that carries the microphone level, a number from 0 to 1, about every 40 ms while recording. */
export const LEVEL_EVENT = "dalil://level";

/** A spoken reply. `stop` cuts it short; `done` resolves when it ends, fails or is stopped. */
export interface Speech {
  stop: () => void;
  done: Promise<void>;
}

const UNKNOWN = "unknown";
const FALLBACK = "Dalil could not finish the voice step, so try again.";

const FRIENDLY = new Map<string, string>([
  ["no-microphone", "Dalil cannot find a microphone, so connect one and check that it is switched on."],
  ["mic-busy", "The microphone is busy in another app, so close that app and try again."],
  ["no-speech", "Dalil did not hear any speech, so try again and speak a little closer to the microphone."],
  ["stt-unsupported", "This endpoint cannot turn speech into text, so pick a model that supports transcription in Setup."],
  ["tts-unsupported", "This endpoint cannot read replies aloud, so the reply stays on screen."],
  ["no-endpoint", "No endpoint is saved yet, so connect one in Setup first."],
  ["key-rejected", "The endpoint did not accept the key, so check it in Setup."],
  ["timeout", "The endpoint took too long to answer, so try again or pick a faster model in Setup."],
  ["unreachable", "Dalil cannot reach the endpoint, so check that it is running and that the address is right."],
  ["desktop-only", "Voice only works in the Dalil desktop app."],
]);

/** One plain sentence for a short voice error code. Codes it does not know get a general line. */
export function friendlyVoiceError(code: string): string {
  return FRIENDLY.get(code) ?? FALLBACK;
}

/** The short code inside a failed voice call. Tauri rejects with the Rust error text, which is the code. */
export function voiceCode(error: unknown): string {
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error instanceof Error && error.message.trim()) return error.message.trim();
  return UNKNOWN;
}

/** A meter value clamped to 0 to 1. Anything that is not a finite number reads as silence. */
export function clampLevel(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/** The bytes of a base64 string, such as the WAV that `voice_speak` returns. Throws on bad base64. */
export function base64ToBytes(encoded: string): Uint8Array<ArrayBuffer> {
  const binary = atob(encoded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** True inside the Tauri webview. Outside it the voice calls are refused or skipped. */
function inTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke: call } = await import("@tauri-apps/api/core");
  return call<T>(command, args);
}

/** Starts recording from the default microphone. Rejects with a short code as the message, such as mic-busy. */
export async function startListening(): Promise<void> {
  if (!inTauri()) throw new Error("desktop-only");
  try {
    await invoke<void>("voice_start");
  } catch (error) {
    throw new Error(voiceCode(error));
  }
}

/** Stops the recording and resolves with the transcript. Rejects with a short code as the message. */
export async function stopAndTranscribe(): Promise<string> {
  if (!inTauri()) throw new Error("desktop-only");
  try {
    return (await invoke<string>("voice_stop")).trim();
  } catch (error) {
    throw new Error(voiceCode(error));
  }
}

/** Stops the recording and throws the audio away. Never rejects. */
export async function cancelListening(): Promise<void> {
  if (!inTauri()) return;
  await invoke<void>("voice_cancel").catch(() => undefined);
}

/** Calls `handler` with the microphone level about every 40 ms while recording. Returns an unsubscribe function. */
export async function onLevel(handler: (level: number) => void): Promise<() => void> {
  if (!inTauri()) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen<number>(LEVEL_EVENT, (event) => handler(clampLevel(event.payload)));
}

/**
 * Speaks `text` with the endpoint's voice. When the endpoint has no speech route, or this is a plain browser,
 * it uses the browser voice if there is one. Otherwise the reply stays on screen and the handle is already done.
 */
export async function speak(text: string): Promise<Speech> {
  const spoken = text.trim();
  if (!spoken) return silence();
  try {
    if (!inTauri()) throw new Error("tts-unavailable");
    return playWav(await invoke<string>("voice_speak", { text: spoken }));
  } catch (error) {
    const code = voiceCode(error);
    if ((code === "tts-unsupported" || code === "tts-unavailable") && hasBrowserVoice()) {
      return speakInBrowser(spoken);
    }
    return silence();
  }
}

/** Plays a WAV that `voice_speak` sent as base64. Done resolves when it ends, fails or is stopped. */
function playWav(encoded: string): Speech {
  const url = URL.createObjectURL(new Blob([base64ToBytes(encoded)], { type: "audio/wav" }));
  const audio = new Audio(url);
  const finished = deferred();
  let ended = false;
  const end = () => {
    if (ended) return;
    ended = true;
    URL.revokeObjectURL(url);
    finished.resolve();
  };
  audio.onended = end;
  audio.onerror = end;
  audio.play().catch(end);
  return {
    stop: () => {
      audio.pause();
      end();
    },
    done: finished.promise,
  };
}

/** Speaks with the browser voice. Done resolves when the utterance ends or fails. */
function speakInBrowser(text: string): Speech {
  const synth = window.speechSynthesis;
  const finished = deferred();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.onend = () => finished.resolve();
  utterance.onerror = () => finished.resolve();
  synth.speak(utterance);
  return {
    stop: () => {
      synth.cancel();
      finished.resolve();
    },
    done: finished.promise,
  };
}

function hasBrowserVoice(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

function silence(): Speech {
  return { stop: () => {}, done: Promise.resolve() };
}

/** A promise with its resolve function, so the stop and end paths can finish it. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = () => done();
  });
  return { promise, resolve };
}
