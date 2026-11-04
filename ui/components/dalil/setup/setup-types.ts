import type { ErrorReason, ModelEntry } from "@/lib/endpoint";

export type SetupPhase = "idle" | "connecting" | "connected" | "error";
export type TestState = "idle" | "sending" | "pass" | "fail";
export type Scheme = "Bearer" | "None";

export interface SetupFailure {
  reason: ErrorReason;
  message: string;
  status?: number;
}

export interface SavedEndpoint {
  base: string;
  host: string;
  local: boolean;
  model: string;
  useScreenshots: boolean;
}

/** Everything the Setup panel draws. The panel is a pure function of this and the actions. */
export interface SetupModel {
  baseUrl: string;
  apiKey: string;
  showKey: boolean;
  advancedOpen: boolean;
  headerName: string;
  scheme: Scheme;
  /** Speech settings for voice. Empty means the defaults: whisper-1, tts-1 and alloy. */
  sttModel: string;
  ttsModel: string;
  ttsVoice: string;

  phase: SetupPhase;
  models: ModelEntry[];
  urlUsed: string | null;
  failure: SetupFailure | null;
  urlError: "empty" | "invalid" | null;

  search: string;
  selected: string | null;
  manual: boolean;
  manualId: string;

  useScreenshots: boolean;
  test: TestState;
  testMessage: string | null;

  /** Which face of the notch is showing. */
  screen: "setup" | "home";
  saved: SavedEndpoint | null;
  /** True right after Save, until Setup opens again. */
  justSaved: boolean;
}

export interface SetupActions {
  setBaseUrl(value: string): void;
  setApiKey(value: string): void;
  setShowKey(value: boolean): void;
  setAdvancedOpen(value: boolean): void;
  setHeaderName(value: string): void;
  setScheme(value: Scheme): void;
  setSttModel(value: string): void;
  setTtsModel(value: string): void;
  setTtsVoice(value: string): void;
  /** Fetch the model list. Pass a URL to replace the Base URL first (the sample chips do). */
  fetchModels(baseUrl?: string): void;
  selectModel(id: string): void;
  setSearch(value: string): void;
  setManual(value: boolean): void;
  setManualId(value: string): void;
  setUseScreenshots(value: boolean): void;
  sendTest(): void;
  save(): void;
  /** Esc and the close button: back to Home. */
  close(): void;
  openSetup(): void;
}

export const EMPTY_MODEL: SetupModel = {
  baseUrl: "",
  apiKey: "",
  showKey: false,
  advancedOpen: false,
  headerName: "Authorization",
  scheme: "Bearer",
  sttModel: "",
  ttsModel: "",
  ttsVoice: "",
  phase: "idle",
  models: [],
  urlUsed: null,
  failure: null,
  urlError: null,
  search: "",
  selected: null,
  manual: false,
  manualId: "",
  useScreenshots: true,
  test: "idle",
  testMessage: null,
  screen: "setup",
  saved: null,
  justSaved: false,
};

export const NOOP_ACTIONS: SetupActions = {
  setBaseUrl() {},
  setApiKey() {},
  setShowKey() {},
  setAdvancedOpen() {},
  setHeaderName() {},
  setScheme() {},
  setSttModel() {},
  setTtsModel() {},
  setTtsVoice() {},
  fetchModels() {},
  selectModel() {},
  setSearch() {},
  setManual() {},
  setManualId() {},
  setUseScreenshots() {},
  sendTest() {},
  save() {},
  close() {},
  openSetup() {},
};

/** The model id Save will use: the picked one, or the typed one. */
export function chosenModel(model: SetupModel): string {
  return model.manual ? model.manualId.trim() : (model.selected ?? "");
}
