import copy from "@/lib/copy.json";

/**
 * The stage's data and its reducer. Everything the desk shows lives in one StageState. The runner
 * (runner.ts) is the only thing that dispatches while a scenario plays, so what you see is always
 * a pure function of this state plus the pointer layer.
 */

export type SectionId = "network" | "display" | "sound" | "power";
export type PressId = SectionId | "wifi";
export type Mode = "play" | "try" | "wrong";
export type Status = "static" | "running" | "idle";

export type StageEvent = { type: "nav"; id: SectionId } | { type: "wifi"; on: boolean };

export type NotchView =
  | { kind: "rest" }
  | { kind: "listening"; transcript: string }
  | { kind: "thinking" }
  | { kind: "guiding"; step: number; total: number; text: string; waiting: boolean }
  | { kind: "correcting"; text: string; hint: string }
  | { kind: "done"; text: string };

export interface CardState {
  /** The card is on the desk. Closing fades it out along the path it arrived. */
  open: boolean;
  /** Blocks drawn so far: heading, subtitle, item 1, item 2, then the follow-up pill. */
  blocks: number;
  ticks: boolean[];
}

export interface PanelState {
  section: SectionId;
  wifi: boolean;
  bluetooth: boolean;
  /** The control the stand-in is pressing right now. */
  press: PressId | null;
}

export interface StageState {
  status: Status;
  mode: Mode | null;
  /** The panel ignores input while a scenario drives it. */
  locked: boolean;
  notch: NotchView;
  keys: { ctrl: boolean; alt: boolean };
  card: CardState;
  panel: PanelState;
}

/* Strings the scenario needs that copy.json does not carry. */
export const STAGE_COPY = {
  question: "How do I turn off Wi-Fi?",
  total: 2,
  step1: "Open Network in the sidebar.",
  step2: "Switch Wi-Fi off.",
  label1: copy.pointer.labels.open,
  label2: copy.pointer.labels.turn_off,
  correctingHint: "Go back and pick Network.",
  card: {
    strip: "Network settings",
    heading: "Turn off Wi-Fi",
    subtitle: "Dalil ticks each step as you do it.",
    items: ["Open Network", "Switch Wi-Fi off"],
    pill: "Show me Bluetooth",
  },
  follow: "Bluetooth is the row below Wi-Fi. Switch it the same way.",
  followLabel: "Bluetooth",
  done: copy.notch.done.other.replace("{n}", "2"),
} as const;

export const SECTION_LABEL: Record<SectionId, string> = {
  network: "Network",
  display: "Display",
  sound: "Sound",
  power: "Power",
};

/** Card blocks: heading, subtitle, two checklist items, then the pill. */
export const CARD_BLOCKS = 5;
export const CARD_BLOCKS_NO_PILL = 4;

const PANEL_START: PanelState = { section: "sound", wifi: true, bluetooth: true, press: null };

/** What the server renders and what the page shows without scripting: Guiding, ring on Network, drawn card. */
export const STATIC_STATE: StageState = {
  status: "static",
  mode: null,
  locked: false,
  notch: { kind: "guiding", step: 1, total: STAGE_COPY.total, text: STAGE_COPY.step1, waiting: false },
  keys: { ctrl: false, alt: false },
  card: { open: true, blocks: CARD_BLOCKS_NO_PILL, ticks: [false, false] },
  panel: PANEL_START,
};

export const START_STATE: StageState = {
  status: "running",
  mode: null,
  locked: true,
  notch: { kind: "rest" },
  keys: { ctrl: false, alt: false },
  card: { open: false, blocks: 0, ticks: [false, false] },
  panel: PANEL_START,
};

export type StageAction =
  | { type: "start"; mode: Mode }
  | { type: "clear" }
  | { type: "notch"; view: NotchView }
  | { type: "keys"; patch: Partial<StageState["keys"]> }
  | { type: "card"; patch: Partial<CardState> }
  | { type: "panel"; patch: Partial<PanelState> }
  | { type: "lock"; locked: boolean }
  | { type: "status"; status: Status };

export function stageReducer(state: StageState, action: StageAction): StageState {
  switch (action.type) {
    case "start":
      /* A fresh run keeps the card's drawn blocks so it can fade out; the runner resets them while hidden. */
      return {
        ...START_STATE,
        mode: action.mode,
        card: { ...state.card, open: false },
      };
    case "clear":
      return {
        ...state,
        status: "idle",
        locked: false,
        notch: { kind: "rest" },
        keys: { ctrl: false, alt: false },
        card: { ...state.card, open: false },
        panel: { ...state.panel, press: null },
      };
    case "notch":
      return { ...state, notch: action.view };
    case "keys":
      return { ...state, keys: { ...state.keys, ...action.patch } };
    case "card":
      return { ...state, card: { ...state.card, ...action.patch } };
    case "panel":
      return { ...state, panel: { ...state.panel, ...action.patch } };
    case "lock":
      return { ...state, locked: action.locked };
    case "status":
      return { ...state, status: action.status };
  }
}
