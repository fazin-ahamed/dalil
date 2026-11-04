import { describe, it } from "node:test";
import assert from "node:assert/strict";
// Node resolves the explicit extension; tsc only allows it with allowImportingTsExtensions.
// @ts-expect-error TS5097
import * as voice from "./voice.ts";

const { base64ToBytes, clampLevel, friendlyVoiceError, voiceCode, speak, speechChunks, startListening, stopAndTranscribe, cancelListening, onLevel, LEVEL_EVENT } =
  voice;

describe("long spoken explanations", () => {
  it("keeps all words within the native limit, including Unicode and unbroken text", () => {
    const text = "A useful explanation. ".repeat(180) + "مرحبا 😀 ".repeat(160);
    const chunks = speechChunks(text);
    assert.ok(chunks.length > 1);
    assert.ok(chunks.every((chunk) => Array.from(chunk).length <= 1100));
    assert.equal(chunks.join(" ").replace(/\s+/g, " "), text.trim().replace(/\s+/g, " "));
    assert.equal(speechChunks("😀".repeat(2400)).join(""), "😀".repeat(2400));
    assert.deepEqual(speechChunks("  "), []);
  });
});

const SENTENCE = /^[A-Z][^.!?]*\.$/;
const CODES = [
  "no-microphone",
  "mic-busy",
  "no-speech",
  "stt-unsupported",
  "tts-unsupported",
  "no-endpoint",
  "key-rejected",
  "timeout",
  "unreachable",
  "desktop-only",
];

describe("base64ToBytes", () => {
  it("decodes the RIFF header of a WAV file", () => {
    assert.deepEqual(Array.from(base64ToBytes("UklGRg==")), [82, 73, 70, 70]);
  });

  it("decodes an empty string to no bytes", () => {
    assert.equal(base64ToBytes("").length, 0);
  });

  it("rejects text that is not base64", () => {
    assert.throws(() => base64ToBytes("%%%"));
  });
});

describe("clampLevel", () => {
  it("keeps a meter value between 0 and 1 and reads anything else as silence", () => {
    assert.equal(clampLevel(0.42), 0.42);
    assert.equal(clampLevel(1.7), 1);
    assert.equal(clampLevel(-0.2), 0);
    assert.equal(clampLevel(Number.NaN), 0);
    assert.equal(clampLevel(Number.POSITIVE_INFINITY), 0);
    assert.equal(clampLevel("0.5"), 0);
  });
});

describe("voiceCode", () => {
  it("reads the short code from a Tauri rejection or an Error", () => {
    assert.equal(voiceCode("no-speech"), "no-speech");
    assert.equal(voiceCode(new Error("mic-busy")), "mic-busy");
  });

  it("is unknown for anything without a code", () => {
    assert.equal(voiceCode("   "), "unknown");
    assert.equal(voiceCode(new Error("")), "unknown");
    assert.equal(voiceCode({ code: "timeout" }), "unknown");
    assert.equal(voiceCode(undefined), "unknown");
  });
});

describe("friendlyVoiceError", () => {
  it("gives one plain sentence per code, and each code its own", () => {
    for (const code of CODES) assert.match(friendlyVoiceError(code), SENTENCE, code);
    assert.equal(new Set(CODES.map((code) => friendlyVoiceError(code))).size, CODES.length);
  });

  it("gives a general line for a code it does not know", () => {
    assert.match(friendlyVoiceError("something-new"), /could not finish the voice step/);
    assert.match(friendlyVoiceError("constructor"), /could not finish the voice step/);
  });
});

describe("voice outside the desktop app", () => {
  it("refuses to start or stop a recording with desktop-only", async () => {
    await assert.rejects(startListening(), { message: "desktop-only" });
    await assert.rejects(stopAndTranscribe(), { message: "desktop-only" });
  });

  it("treats cancel as a no-op and subscribes to levels as a no-op", async () => {
    await cancelListening();
    const unsubscribe = await onLevel(() => {});
    unsubscribe();
    assert.equal(LEVEL_EVENT, "dalil://level");
  });

  it("speaks nothing and resolves at once when there is no voice to use", async () => {
    const reply = await speak("Press Ctrl+S to save.");
    await reply.done;
    reply.stop();
    const blank = await speak("   ");
    await blank.done;
  });
});
