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
  done: Promise<boolean>;
  /** Resolves true only after audio or a browser utterance actually starts. */
  audible: Promise<boolean>;
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
export interface SpeechProgress {onStart?:()=>void;onProgress?:(characterOffset:number)=>void}
export async function speak(text: string,progress:SpeechProgress={}): Promise<Speech> {
  const spoken = text.trim();
  if (!spoken) return silence();
  if (!inTauri()) return hasBrowserVoice() ? speakInBrowser(spoken,progress) : silence();
  const chunks = speechChunks(spoken);
  const finished = deferred<boolean>(),audible=deferred<boolean>();
  let stopped = false,current:Speech|null=null,offset=0,complete=true;
  const observe=(value:Speech)=>{void value.audible.then(heard=>{if(heard&&!stopped){audible.resolve(true);progress.onStart?.();}});};
  void (async () => {
    for (let i = 0; i < chunks.length && !stopped; i++) {
      try {
        const wav = await invoke<string>("voice_speak", { text: chunks[i] });
        if (stopped) break;
        current = playWav(wav,fraction=>progress.onProgress?.(offset+chunks[i].length*fraction));
        observe(current);
        if(!await current.done)throw new Error("tts-unavailable");
        offset+=chunks[i].length+1;
      } catch (error) {
        complete=false;
        if (!stopped && ["tts-unsupported", "tts-unavailable"].includes(voiceCode(error)) && hasBrowserVoice()) {
          current = speakInBrowser(chunks.slice(i).join(" "),{onProgress:at=>progress.onProgress?.(offset+at)});
          observe(current);complete=await current.done;
        }
        break;
      }
    }
  })().catch(() => {complete=false;}).finally(() => {audible.resolve(false);finished.resolve(complete&&!stopped);});
  return {stop:()=>{stopped=true;current?.stop();audible.resolve(false);finished.resolve(false);},done:finished.promise,audible:audible.promise};
}

/** Stay below the native speech route's 1200-character cap without cutting off an explanation. */
export function speechChunks(text: string): string[] {
  const chars = Array.from(text.trim());
  const chunks: string[] = [];
  for (let start = 0; start < chars.length;) {
    let end = Math.min(start + 1100, chars.length);
    if (end < chars.length) {
      const space = chars.slice(start, end).findLastIndex((ch) => /\s/.test(ch));
      if (space > 550) end = start + space;
    }
    chunks.push(chars.slice(start, end).join("").trim());
    start = end;
    while (start < chars.length && /\s/.test(chars[start])) start++;
  }
  return chunks;
}

/** Plays a WAV that `voice_speak` sent as base64. Done resolves when it ends, fails or is stopped. */
function playWav(encoded:string,onProgress:(fraction:number)=>void):Speech {
  const url=URL.createObjectURL(new Blob([base64ToBytes(encoded)],{type:"audio/wav"}));
  const audio=new Audio(url),finished=deferred<boolean>(),audible=deferred<boolean>();
  let ended=false;
  const end=(complete:boolean)=>{if(ended)return;ended=true;audio.onplaying=null;audio.ontimeupdate=null;audio.onended=null;audio.onerror=null;URL.revokeObjectURL(url);audible.resolve(false);finished.resolve(complete);};
  audio.onplaying=()=>audible.resolve(true);
  // shortcut: WAV cues use proportional audio time; use forced alignment if word-level timing is required.
  audio.ontimeupdate=()=>{if(Number.isFinite(audio.duration)&&audio.duration>0)onProgress(audio.currentTime/audio.duration);};
  audio.onended=()=>{onProgress(1);end(true);};audio.onerror=()=>end(false);
  audio.play().catch(()=>end(false));
  return {stop:()=>{audio.pause();end(false);},done:finished.promise,audible:audible.promise};
}

/** Word boundaries drive the lesson when supported; elapsed time covers engines without them. */
function speakInBrowser(text:string,progress:SpeechProgress={}):Speech {
  const synth=window.speechSynthesis,finished=deferred<boolean>(),audible=deferred<boolean>();
  const utterance=new SpeechSynthesisUtterance(text);
  let timer:ReturnType<typeof setInterval>|undefined,last=0,ended=false;
  const report=(at:number)=>{last=Math.max(last,Math.min(text.length,at));progress.onProgress?.(last);};
  const end=(complete:boolean)=>{if(ended)return;ended=true;clearInterval(timer);utterance.onstart=null;utterance.onboundary=null;utterance.onend=null;utterance.onerror=null;audible.resolve(false);finished.resolve(complete);};
  utterance.onstart=()=>{
    audible.resolve(true);progress.onStart?.();
    const started=performance.now(),duration=Math.max(1500,text.split(/\s+/).length*370);
    timer=setInterval(()=>report(Math.round((performance.now()-started)/duration*text.length)),180);
  };
  utterance.onboundary=event=>{clearInterval(timer);report(event.charIndex);};
  utterance.onend=()=>{report(text.length);end(true);};utterance.onerror=()=>end(false);
  try{synth.speak(utterance);}catch{end(false);}
  return {stop:()=>{end(false);synth.cancel();},done:finished.promise,audible:audible.promise};
}
function hasBrowserVoice():boolean {
  return typeof window!=="undefined"&&"speechSynthesis"in window&&window.speechSynthesis.getVoices().length>0;
}
function silence():Speech {return{stop:()=>{},done:Promise.resolve(false),audible:Promise.resolve(false)};}

/** Resolve once, including stop/error paths, so narration never waits on a dead audio source. */
function deferred<T>():{promise:Promise<T>;resolve:(value:T)=>void} {
  let resolve!:(value:T)=>void;const promise=new Promise<T>(done=>{resolve=done;});return{promise,resolve};
}
