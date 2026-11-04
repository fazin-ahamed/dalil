"use client";

import { NotchPanel } from "@/components/dalil/notch-panel";
import { SAMPLE_TABLE, messageFor, parseModels, type ErrorReason } from "@/lib/endpoint";
import { GRID_PAPER } from "./grid-paper";
import { TooltipsEnabled } from "./hint-trigger";
import { HomePanel } from "./home-panel";
import { ScaledFrame } from "./scaled-frame";
import { SetupPanel } from "./setup-panel";
import { EMPTY_MODEL, NOOP_ACTIONS, type SetupModel } from "./setup-types";

const REMOTE_URL = "api.example.com/v1";
const REMOTE_MODELS = parseModels(SAMPLE_TABLE["https://api.example.com/v1/models"].json);
const LOCAL_MODELS = parseModels(SAMPLE_TABLE["http://localhost:11434/v1/models"].json);
const SAMPLE_KEY = "sample-key-0000";

function failed(baseUrl: string, host: string, reason: ErrorReason, timeoutMs = 8000): SetupModel {
  return {
    ...EMPTY_MODEL,
    baseUrl,
    apiKey: SAMPLE_KEY,
    phase: "error",
    failure: { reason, message: messageFor(reason, { host, timeoutMs }) },
  };
}

interface GalleryItem {
  id: string;
  title: string;
  note: string;
  face: "setup" | "home";
  model: SetupModel;
}

const ITEMS: GalleryItem[] = [
  {
    id: "empty",
    title: "Empty",
    note: "First run. Nothing typed, nothing fetched.",
    face: "setup",
    model: EMPTY_MODEL,
  },
  {
    id: "typing",
    title: "Typing",
    note: "The address is cleaned up as you type.",
    face: "setup",
    model: { ...EMPTY_MODEL, baseUrl: "api.example.com/v1/chat/completions", apiKey: SAMPLE_KEY },
  },
  {
    id: "connecting",
    title: "Connecting",
    note: "Skeleton rows hold the shape of the list.",
    face: "setup",
    model: { ...EMPTY_MODEL, baseUrl: REMOTE_URL, apiKey: SAMPLE_KEY, phase: "connecting" },
  },
  {
    id: "connected",
    title: "Connected",
    note: "Seven sample models, one chosen, the test passed.",
    face: "setup",
    model: {
      ...EMPTY_MODEL,
      baseUrl: REMOTE_URL,
      apiKey: SAMPLE_KEY,
      phase: "connected",
      models: REMOTE_MODELS,
      urlUsed: "https://api.example.com/v1/models",
      selected: "sample-chat-medium",
      test: "pass",
    },
  },
  {
    id: "rejected",
    title: "Rejected key",
    note: "The server answered 401 or 403.",
    face: "setup",
    model: failed("badkey.example.com/v1", "badkey.example.com", "key-rejected"),
  },
  {
    id: "no-list",
    title: "No model list",
    note: "404 at every address. A model ID can be typed.",
    face: "setup",
    model: failed("nolist.example.com/v1", "nolist.example.com", "no-model-list"),
  },
  {
    id: "unreachable",
    title: "Unreachable",
    note: "Refused, no route or a TLS failure.",
    face: "setup",
    model: failed("down.example.com/v1", "down.example.com", "unreachable"),
  },
  {
    id: "timeout",
    title: "Timeout",
    note: "No answer within eight seconds.",
    face: "setup",
    model: failed("slow.example.com/v1", "slow.example.com", "timeout"),
  },
  {
    id: "bad-response",
    title: "Bad response",
    note: "The server answered, but not with a model list.",
    face: "setup",
    model: failed("html.example.com/v1", "html.example.com", "bad-response"),
  },
  {
    id: "cors",
    title: "Blocked by the browser",
    note: "Only in a browser. The desktop app has no such limit.",
    face: "setup",
    model: failed("cors.example.com/v1", "cors.example.com", "cors-blocked"),
  },
  {
    id: "local",
    title: "Local endpoint",
    note: "No key, and the disclosure says it stays here.",
    face: "setup",
    model: {
      ...EMPTY_MODEL,
      baseUrl: "http://localhost:11434",
      phase: "connected",
      models: LOCAL_MODELS,
      urlUsed: "http://localhost:11434/v1/models",
      selected: "llama3.2:3b",
    },
  },
  {
    id: "saved",
    title: "Saved",
    note: "The panel collapses to Home with the endpoint chip.",
    face: "home",
    model: {
      ...EMPTY_MODEL,
      screen: "home",
      justSaved: true,
      saved: { base: "https://api.example.com/v1", host: "api.example.com", local: false, model: "sample-chat-medium", useScreenshots: false },
    },
  },
];

/** The states, drawn by the same panels as the live flow and shrunk to about 0.72. Not interactive. */
export function StatesGallery() {
  return (
    <ul className="grid list-none grid-cols-1 gap-x-8 gap-y-10 p-0 md:grid-cols-2">
      {ITEMS.map((item) => (
        <li key={item.id} className="min-w-0">
          <figure className="flex min-w-0 flex-col gap-3">
            <figcaption className="flex flex-col gap-0.5">
              <span className="text-headline-medium text-text-primary">{item.title}</span>
              <span className="text-body-regular text-text-secondary">{item.note}</span>
            </figcaption>
            <div
              aria-hidden
              inert
              className="overflow-hidden rounded-2xl border border-separator-border bg-paper-2 px-4 pb-6"
              style={GRID_PAPER}
            >
              <TooltipsEnabled.Provider value={false}>
              <ScaledFrame>
                <NotchPanel>
                  {item.face === "home" ? (
                    <HomePanel model={item.model} actions={NOOP_ACTIONS} />
                  ) : (
                    <SetupPanel model={item.model} actions={NOOP_ACTIONS} sampleMode />
                  )}
                </NotchPanel>
              </ScaledFrame>
              </TooltipsEnabled.Provider>
            </div>
          </figure>
        </li>
      ))}
    </ul>
  );
}
