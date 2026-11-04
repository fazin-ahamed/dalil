"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { RiPlayLine, RiStopLine } from "@remixicon/react";
import copy from "@/lib/copy.json";
import { Button } from "@/components/base/buttons/button";
import { SegmentedControl, SegmentedControlItem } from "@/components/base/segmented-control/segmented-control";
import { cx } from "@/utils/cx";
import { fill, useHotkeyHold, useSmoothLevel, useTypewriter } from "./hooks";
import { Notch, NOTCH_SHAPES, NOTCH_STAGE } from "./notch";
import type { NotchAction, NotchEndpoint, NotchProps, NotchState } from "./notch";

/* ---------------------------------------------------------------- sample data */

const SAMPLE_NAME = "FSquare";
const SAMPLE_HOUR = 19;
const SAMPLE_TRANSCRIPT = "How do I turn off Wi-Fi";
const SAMPLE_STEPS = [
  "Open the network menu in the top bar.",
  "Click Wi-Fi to open its settings.",
  "Turn the Wi-Fi switch off.",
];
const SAMPLE_HOST = "api.example.com";
const LOCAL_ENDPOINT: NotchEndpoint = { model: "llama3.1:8b", host: "localhost", local: true };
const REMOTE_ENDPOINT: NotchEndpoint = { model: "sample-model", host: SAMPLE_HOST, local: false };

/** The lab has no Setup panel to show, so Setup is not listed. */
const STATE_LABEL: Record<Exclude<NotchState, "setup">, string> = {
  rest: "Rest",
  home: "Home",
  listening: "Listening",
  thinking: "Thinking",
  guiding: "Guiding",
  waiting: "Waiting",
  correcting: "Correcting",
  done: "Done",
  error: "Error",
  ask: "Ask",
};
const STATE_ORDER = Object.keys(STATE_LABEL) as Exclude<NotchState, "setup">[];

/** Build the sample props for a state. Used by the live notch and the gallery. */
export function sampleProps(
  state: NotchState,
  opts: { step?: number; transcript?: string; endpoint?: NotchEndpoint | null } = {},
): NotchProps {
  const step = opts.step ?? 1;
  const endpoint = opts.endpoint === undefined ? LOCAL_ENDPOINT : (opts.endpoint ?? undefined);
  switch (state) {
    case "rest":
      return { state };
    case "home":
      return { state, name: SAMPLE_NAME, hour: SAMPLE_HOUR, endpoint };
    case "listening":
      return { state, transcript: opts.transcript ?? SAMPLE_TRANSCRIPT };
    case "thinking":
    case "setup":
      return { state };
    case "ask":
      return {
        state,
        draft: "",
        onDraft: () => {},
        onSubmit: () => {},
        busy: false,
        error: null,
        contextLabel: "Using Figma",
        messages: [
          { role: "user", text: "What does the gap setting do?" },
          {
            role: "assistant",
            text: "Gap sets the space between the frames inside auto layout, so they stay evenly spaced when you resize.",
            steps: ["Select the parent frame.", "Change Gap in the right panel."],
          },
        ],
      };
    case "guiding":
    case "waiting":
      return { state, step, total: 3, text: SAMPLE_STEPS[step - 1] };
    case "correcting":
      return {
        state,
        text: fill(copy.notch.correcting.happened, { name: "Display" }),
        hint: copy.notch.correcting.back,
      };
    case "done":
      return { state, text: fill(copy.notch.done.other, { n: 3 }) };
    case "error":
      return {
        state,
        title: fill(copy.notch.error.endpoint.message, { host: SAMPLE_HOST }),
        actionLabel: copy.notch.error.endpoint.action,
        action: "open-setup",
      };
  }
}

/* ---------------------------------------------------------------- live notch */

interface Scene {
  state: NotchState;
  step: number;
}

/** Rest, Home, Listening, Thinking, Guiding 1, Waiting, Correcting, Guiding 2, Done, Rest. */
const SEQUENCE: Array<Scene & { ms: number }> = [
  { state: "rest", step: 1, ms: 900 },
  { state: "home", step: 1, ms: 2000 },
  { state: "listening", step: 1, ms: 2700 },
  { state: "thinking", step: 1, ms: 1700 },
  { state: "guiding", step: 1, ms: 2300 },
  { state: "waiting", step: 1, ms: 2200 },
  { state: "correcting", step: 1, ms: 2800 },
  { state: "guiding", step: 2, ms: 2300 },
  { state: "done", step: 3, ms: 2600 },
  { state: "rest", step: 1, ms: 0 },
];

export function LiveNotch() {
  const [scene, setScene] = useState<Scene>({ state: "home", step: 1 });
  const [playing, setPlaying] = useState(false);
  const [listenRun, setListenRun] = useState(0);
  const [lastAction, setLastAction] = useState<NotchAction | null>(null);
  const run = useRef(0);
  const afterThinking = useRef<number | null>(null);

  const state = scene.state;
  const listening = state === "listening";
  const level = useSmoothLevel(listening);
  const transcript = useTypewriter(SAMPLE_TRANSCRIPT, listening, 70, listenRun);

  const cancel = useCallback(() => {
    run.current += 1;
    if (afterThinking.current !== null) window.clearTimeout(afterThinking.current);
    afterThinking.current = null;
    setPlaying(false);
  }, []);

  useEffect(() => () => cancel(), [cancel]);

  const play = useCallback(async () => {
    cancel();
    const id = run.current;
    setPlaying(true);
    for (const s of SEQUENCE) {
      if (run.current !== id) return;
      setScene({ state: s.state, step: s.step });
      if (s.state === "listening") setListenRun((n) => n + 1);
      if (s.ms) await new Promise<void>((r) => window.setTimeout(r, s.ms));
    }
    if (run.current === id) setPlaying(false);
  }, [cancel]);

  const choose = (next: NotchState) => {
    cancel();
    setScene({ state: next, step: next === "done" ? 3 : 1 });
    if (next === "listening") setListenRun((n) => n + 1);
  };

  /* Hold Ctrl + Alt: Listening at once, Thinking on release. Pressing again barges in. */
  useHotkeyHold({
    onDown: () => {
      cancel();
      setScene({ state: "listening", step: 1 });
      setListenRun((n) => n + 1);
    },
    onUp: () => {
      setScene({ state: "thinking", step: 1 });
      afterThinking.current = window.setTimeout(() => {
        afterThinking.current = null;
        setScene({ state: "rest", step: 1 });
      }, 2400);
    },
  });

  const handleAction = (action: NotchAction) => {
    setLastAction(action);
    if (action === "dismiss") {
      cancel();
      setScene({ state: "rest", step: 1 });
    }
    if (action === "skip") {
      cancel();
      setScene((s) => (s.step < 3 ? { state: "guiding", step: s.step + 1 } : { state: "done", step: 3 }));
    }
  };

  const props = sampleProps(state, { step: scene.step, transcript });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="-mx-1 max-w-full overflow-x-auto px-1 py-1 [scrollbar-width:none]">
          <SegmentedControl
            aria-label="Notch state"
            selectedKeys={[state]}
            onSelectionChange={(keys) => {
              const next = [...keys][0] as NotchState | undefined;
              if (next) choose(next);
            }}
          >
            {STATE_ORDER.map((s) => (
              <SegmentedControlItem key={s} id={s}>
                {STATE_LABEL[s]}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
        </div>
        <Button
          variant={playing ? "secondary" : "primary"}
          leadingIcon={playing ? RiStopLine : RiPlayLine}
          onClick={playing ? cancel : play}
        >
          {playing ? "Stop the sequence" : "Play the sequence"}
        </Button>
      </div>

      <div
        className={cx(
          "relative mx-auto h-75 w-full max-w-250 overflow-hidden rounded-card bg-paper-3",
        )}
      >
        <div className="absolute start-1/2 top-0 origin-top -translate-x-1/2 scale-[0.62] rtl:translate-x-1/2 min-[640px]:scale-100">
          <Notch {...props} level={level} onAction={handleAction} stageHeight={props.state === "ask" ? 480 : undefined} />
        </div>
        <p className="absolute inset-x-5 bottom-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-1 text-body-regular text-muted">
          <span>Hold Ctrl + Alt on this page to listen. Release to think.</span>
          <span>
            {lastAction ? `Last action: ${lastAction}. ` : ""}
            Transcript and audio level are Sample data.
          </span>
        </p>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- gallery */

interface Variant {
  id: string;
  name: string;
  state: NotchState;
  opts?: Parameters<typeof sampleProps>[1];
  size?: string;
  trigger: string;
  exit: string;
}

const size = (s: NotchState) => `${NOTCH_SHAPES[s].w} by ${NOTCH_SHAPES[s].h}`;

const GALLERY: Variant[] = [
  {
    id: "rest",
    name: "Rest",
    state: "rest",
    trigger: "Default. Also after any state is dismissed.",
    exit: "Hover for 200 ms, click, or a tap of the hotkey.",
  },
  {
    id: "home",
    name: "Home",
    state: "home",
    trigger: "Hover, click, or a tap of the hotkey.",
    exit: "Esc, a click outside, or 6 seconds without the pointer.",
  },
  {
    id: "home-first-run",
    name: "Home, first run",
    state: "home",
    opts: { endpoint: null },
    trigger: "Home before any endpoint is saved.",
    exit: "Connect endpoint opens setup. Esc closes.",
  },
  {
    id: "home-remote",
    name: "Home, remote endpoint",
    state: "home",
    opts: { endpoint: REMOTE_ENDPOINT },
    trigger: "Home with an endpoint that is not on this computer. The chip shows the host.",
    exit: "Same as Home.",
  },
  {
    id: "listening",
    name: "Listening",
    state: "listening",
    opts: { transcript: "How do I turn off Wi-Fi" },
    trigger: "Hotkey down. The fast path: 160 ms, no delay.",
    exit: "Hotkey up.",
  },
  {
    id: "thinking",
    name: "Thinking",
    state: "thinking",
    trigger: "Hotkey up with a transcript.",
    exit: "First step parsed.",
  },
  {
    id: "guiding",
    name: "Guiding",
    state: "guiding",
    size: `${size("guiding")}, grows to 3 lines`,
    trigger: "First step parsed.",
    exit: "Step verified, or Esc.",
  },
  {
    id: "waiting",
    name: "Waiting",
    state: "waiting",
    size: `${size("waiting")}, grows to 3 lines`,
    trigger: "Pointer landed.",
    exit: "Event seen, a pulse after 12 seconds, an ask after 30.",
  },
  {
    id: "correcting",
    name: "Correcting",
    state: "correcting",
    trigger: "A wrong event.",
    exit: "You are back on the path, or Dalil replans.",
  },
  {
    id: "done",
    name: "Done",
    state: "done",
    trigger: "The last step is verified.",
    exit: "After 2.4 seconds.",
  },
  {
    id: "error",
    name: "Error",
    state: "error",
    trigger: "Any failure.",
    exit: "The action, or Esc.",
  },
];

export function NotchGallery() {
  return (
    <ul className="flex flex-col gap-10">
      {GALLERY.map((v) => {
        const props = sampleProps(v.state, v.opts);
        const height = NOTCH_SHAPES[v.state].h;
        return (
          <li
            key={v.id}
            className="grid items-start gap-x-8 gap-y-4 lg:grid-cols-[minmax(0,1fr)_17rem]"
          >
            <div
              className="relative w-full overflow-hidden rounded-card bg-paper-3 [--s:0.62] min-[640px]:[--s:1]"
              style={{ "--h": `${Math.min(NOTCH_STAGE.h, height) + 48}px`, height: "calc(var(--h) * var(--s))" } as CSSProperties}
            >
              <div className="absolute start-1/2 top-0 origin-top -translate-x-1/2 scale-(--s) rtl:translate-x-1/2">
                <Notch {...props} stageHeight={props.state === "ask" ? 480 : undefined} />
              </div>
            </div>
            <dl className="flex flex-col gap-1.5">
              <dt className="sr-only">Name</dt>
              <dd className="text-title-3-semibold text-text-primary">{v.name}</dd>
              <div className="flex gap-2 text-body-regular">
                <dt className="w-20 shrink-0 text-text-tertiary">Size</dt>
                <dd className="text-text-primary tabular-nums">{v.size ?? size(v.state)}</dd>
              </div>
              <div className="flex gap-2 text-body-regular">
                <dt className="w-20 shrink-0 text-text-tertiary">Entered by</dt>
                <dd className="text-text-secondary">{v.trigger}</dd>
              </div>
              <div className="flex gap-2 text-body-regular">
                <dt className="w-20 shrink-0 text-text-tertiary">Leaves on</dt>
                <dd className="text-text-secondary">{v.exit}</dd>
              </div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
