"use client";

import "./notch.css";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Focusable } from "react-aria-components";
import {
  RiArrowRightLine,
  RiCheckLine,
  RiCursorLine,
  RiErrorWarningLine,
  RiGlobalLine,
  RiFolderLine,
  RiStopCircleLine,
  RiMacbookLine,
  RiMicLine,
  RiReceiptLine,
  RiSettings3Line,
} from "@remixicon/react";
import copy from "@/lib/copy.json";
import { BrandMark } from "@/components/dalil/brand-mark";
import { Button } from "@/components/base/buttons/button";
import { IconButton } from "@/components/base/buttons/icon-button";
import { Chip } from "@/components/base/badges/chip";
import { Tooltip, TooltipTrigger } from "@/components/base/tooltip/tooltip";
import { cx } from "@/utils/cx";
import { dayPartForHour, fill, usePrefersReducedMotion } from "./hooks";
import { ChatPanel, type ChatPanelActions, type ChatPanelData } from "./chat-panel";
import type { AgentTask, WebSource, Scene } from "@/lib/contracts";

/* ------------------------------------------------------------------ types */

export type NotchState =
  | "rest"
  | "home"
  | "listening"
  | "thinking"
  | "guiding"
  | "waiting"
  | "correcting"
  | "done"
  | "error"
  | "setup"
  | "ask";

/** One bubble in the Ask conversation. Steps are the numbered things to do, shown under an assistant bubble. */
export interface ChatBubble {
  role: "user" | "assistant";
  text: string;
  steps?: string[];
  taskId?: string;
  status?: AgentTask["status"];
  sources?: WebSource[];
  scene?: Scene | null;
}

export type NotchAction = "open-setup" | "open-ask" | "open-talk" | "open-receipts" | "open-projects" | "stop-task" | "dismiss" | "skip" | "retry";

export interface NotchEndpoint {
  model: string;
  host: string;
  /** True for a loopback or LAN host. The chip then reads "On this computer". */
  local: boolean;
}

interface NotchCommon {
  onAction?: (action: NotchAction) => void;
  /** Microphone level from 0 to 1. Drives the Listening waveform. 0 plays the idle motion. */
  level?: number;
  className?: string;
  /** Height of the persistent element. Raise it when a panel such as Setup needs more than 200px. */
  stageHeight?: number;
  /** The Setup face. Always mounted so it can fade in; only visible while `state` is "setup". */
  setupPanel?: ReactNode;
  /** Called with the visible shape (logical pixels) whenever it changes, for input regions. */
  onShape?: (shape: { w: number; h: number; y: number }) => void;
  working?: number;
  compact?: boolean;
  shortcutHint?: string;
  projectName?: string;
  thinkingText?: string;
}

export type NotchProps = NotchCommon &
  (
    | { state: "rest" }
    | { state: "home"; name: string; hour: number; endpoint?: NotchEndpoint }
    | { state: "listening"; transcript: string }
    | { state: "thinking" }
    | { state: "setup" }
    | { state: "guiding"; step: number; total: number; text: string }
    | { state: "waiting"; step: number; total: number; text: string }
    | { state: "correcting"; text: string; hint: string }
    | { state: "done"; text: string }
    | {
        state: "error";
        title: string;
        actionLabel: string;
        /** The action the button fires. Defaults to "retry". */
        action?: "retry" | "open-setup";
      }
    | ({ state: "ask" } & ChatPanelData & ChatPanelActions)
  );

/* ------------------------------------------------------------------ geometry */

/** Logical size of each state in pixels. Guiding, waiting, correcting, error and ask grow with their text. */
export const NOTCH_SHAPES: Record<NotchState, { w: number; h: number }> = {
  rest: { w: 132, h: 30 },
  home: { w: 536, h: 220 },
  listening: { w: 300, h: 64 },
  thinking: { w: 400, h: 56 },
  guiding: { w: 440, h: 96 },
  waiting: { w: 440, h: 96 },
  correcting: { w: 440, h: 104 },
  done: { w: 280, h: 46 },
  error: { w: 400, h: 84 },
  setup: { w: 560, h: 300 },
  ask: { w: 536, h: 360 },
};

/** The persistent element is this size. States are revealed from it with clip-path. */
export const NOTCH_STAGE = { w: 560, h: 200 } as const;
export const NOTCH_COMPACT = { w: 64, h: 18, y: 6 } as const;

const RADIUS_REST = 16;
const RADIUS_OPEN = 28;

/* ------------------------------------------------------------------ layer data */

interface HomeData {
  name: string;
  hour: number;
  endpoint?: NotchEndpoint;
}
interface ListeningData {
  transcript: string;
}
interface GuideData {
  step: number;
  total: number;
  text: string;
  waiting: boolean;
}
interface CorrectingData {
  text: string;
  hint: string;
}
interface DoneData {
  text: string;
}
interface ErrorData {
  title: string;
  actionLabel: string;
  action: "retry" | "open-setup";
}

type AskData = ChatPanelData;

interface LayerMap {
  home: HomeData;
  listening: ListeningData;
  guide: GuideData;
  correcting: CorrectingData;
  done: DoneData;
  error: ErrorData;
  ask: AskData;
}
type DataLayer = keyof LayerMap;
type LayerKey = DataLayer | "rest" | "thinking" | "setup";

const DEFAULTS: LayerMap = {
  home: { name: "", hour: 12 },
  listening: { transcript: "" },
  guide: { step: 1, total: 1, text: "", waiting: false },
  correcting: { text: "", hint: "" },
  done: { text: "" },
  error: { title: "", actionLabel: "", action: "retry" },
  ask: { draft: "", busy: false, messages: [], error: null, contextLabel: "" },
};

type Live = { [K in DataLayer]: { layer: K; data: LayerMap[K] } }[DataLayer];

function liveData(p: NotchProps): Live | null {
  switch (p.state) {
    case "home":
      return { layer: "home", data: { name: p.name, hour: p.hour, endpoint: p.endpoint } };
    case "listening":
      return { layer: "listening", data: { transcript: p.transcript } };
    case "guiding":
    case "waiting":
      return {
        layer: "guide",
        data: { step: p.step, total: p.total, text: p.text, waiting: p.state === "waiting" },
      };
    case "correcting":
      return { layer: "correcting", data: { text: p.text, hint: p.hint } };
    case "done":
      return { layer: "done", data: { text: p.text } };
    case "error":
      return {
        layer: "error",
        data: { title: p.title, actionLabel: p.actionLabel, action: p.action ?? "retry" },
      };
    case "ask":
      return {
        layer: "ask",
        data: {
          draft: p.draft,
          busy: p.busy,
          messages: p.messages,
          error: p.error,
          contextLabel: p.contextLabel ?? "",
          tasks: p.tasks,
          searchEnabled: p.searchEnabled,
          computerEnabled: p.computerEnabled,
          screenEnabled: p.screenEnabled,
          screenChanging: p.screenChanging,
          shortcuts: p.shortcuts,
          computerSupported: p.computerSupported,
          computerReason: p.computerReason,
        },
      };
    default:
      return null;
  }
}

function layerOf(state: NotchState): LayerKey {
  return state === "guiding" || state === "waiting" ? "guide" : state;
}

const STATES = copy.aria.states;

function captionFor(p: NotchProps): string {
  switch (p.state) {
    case "rest":
      return "";
    case "home":
      return p.endpoint ? STATES.home : copy.setup.first_run;
    case "listening":
      return STATES.listening;
    case "thinking":
      return STATES.thinking;
    case "setup":
      return STATES.setup;
    case "ask":
      return STATES.ask;
    case "guiding":
      return `${fill(copy.notch.guiding.step, { n: p.step, total: p.total })}. ${p.text}`;
    case "waiting":
      return `${fill(copy.notch.guiding.step, { n: p.step, total: p.total })}. ${p.text} ${copy.notch.waiting.label}.`;
    case "correcting":
      return `${p.text} ${p.hint}`;
    case "done":
      return p.text;
    case "error":
      return `${p.title} ${STATES.error}`;
  }
}

/* ------------------------------------------------------------------ component */

/**
 * The notch: one persistent black shape hanging from the top edge. It is a fixed 560 by 200 element
 * revealed with clip-path, so the shape morphs between states without animating width or height.
 * Each state's content is its own layer and cross-fades with opacity, a 2px blur and a few pixels
 * of travel. Controlled: change `state` at any moment and everything retargets from where it is.
 */
export function Notch(props: NotchProps) {
  const { state, onAction, level = 0, className, stageHeight = NOTCH_STAGE.h, setupPanel, onShape, working = 0, compact = false, shortcutHint } = props;
  const reduced = usePrefersReducedMotion();

  /* Keep each layer's last data so a layer fading out still shows what it showed. */
  const live = liveData(props);
  const [cache, setCache] = useState<Partial<LayerMap>>({});
  if (live && JSON.stringify(cache[live.layer]) !== JSON.stringify(live.data)) {
    setCache((c) => ({ ...c, [live.layer]: live.data }));
  }
  const dataFor = <K extends DataLayer>(key: K): LayerMap[K] =>
    ((live && live.layer === key ? live.data : cache[key]) ?? DEFAULTS[key]) as LayerMap[K];

  /* Layers that grow with their text report their natural height. */
  const [heights, setHeights] = useState<Partial<Record<LayerKey, number>>>({});
  const reportHeight = useCallback((key: LayerKey, h: number) => {
    setHeights((prev) => (prev[key] === h ? prev : { ...prev, [key]: h }));
  }, []);

  const active = layerOf(state);
  const spec = NOTCH_SHAPES[state];
  const w = compact ? NOTCH_COMPACT.w : spec.w;
  const h = compact ? NOTCH_COMPACT.h : Math.min(stageHeight, Math.max(spec.h, heights[active] ?? 0));
  const top = compact ? NOTCH_COMPACT.y : 0;
  const r = compact ? h / 2 : state === "rest" ? RADIUS_REST : RADIUS_OPEN;
  const x = (NOTCH_STAGE.w - w) / 2;
  const y = stageHeight - h - top;

  const onShapeRef = useRef(onShape);
  useEffect(() => {
    onShapeRef.current = onShape;
  });
  useEffect(() => {
    onShapeRef.current?.({ w, h, y: top });
  }, [w, h, top]);

  const bodyClip = `inset(${top}px ${x}px ${y}px ${x}px round ${compact ? `${r}px` : `0px 0px ${r}px ${r}px`})`;
  const edgeClip = `inset(${Math.max(0, top - 1)}px ${Math.max(0, x - 1)}px ${Math.max(0, y - 1)}px ${Math.max(0, x - 1)}px round ${compact ? `${r + 1}px` : `0px 0px ${r + 1}px ${r + 1}px`})`;

  /* Timing. Any state that enters Listening takes the fast path: no delay, 160ms. */
  const fast = state === "listening";
  const timing = {
    "--shape-dur": reduced ? "0ms" : fast ? "160ms" : "360ms",
    "--in-dur": reduced ? "120ms" : fast ? "120ms" : "220ms",
    "--in-delay": reduced || fast ? "0ms" : "90ms",
    "--out-dur": reduced ? "120ms" : fast ? "70ms" : "120ms",
  } as CSSProperties;

  /* Reduced motion: the shape snaps and fades in over 120ms instead of morphing. */
  const fadeRef = useRef<HTMLDivElement>(null);
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (!reduced) return;
    fadeRef.current?.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 120, easing: "linear" });
  }, [state, reduced]);

  /* Esc leaves any state. */
  const actionRef = useRef(onAction);
  useEffect(() => {
    actionRef.current = onAction;
  });
  useEffect(() => {
    if (state === "rest") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") actionRef.current?.("dismiss");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state]);

  const fire = (a: NotchAction) => onAction?.(a);

  const home = dataFor("home");
  const listening = dataFor("listening");
  const guide = dataFor("guide");
  const correcting = dataFor("correcting");
  const done = dataFor("done");
  const error = dataFor("error");
  const ask = dataFor("ask");
  const askProps = props.state === "ask" ? props : null;

  return (
    <div
      role="group"
      aria-label={copy.aria.notch_region}
      data-notch-compact={compact}
      style={{ ...timing, height: stageHeight }}
      className={cx("pointer-events-none relative w-140 select-none", className)}
    >
      <p role="status" className="sr-only">
        {captionFor(props)}
      </p>

      {/* Soft shadow follows the clipped shape because the filter sits on the parent. */}
      <div
        ref={fadeRef}
        className="absolute inset-0"
        style={{
          filter:
            "drop-shadow(0 2px 2px color-mix(in srgb, var(--color-notch) 30%, transparent)) drop-shadow(0 16px 18px color-mix(in srgb, var(--color-notch) 26%, transparent))",
        }}
      >
        {/* One pixel keyline */}
        <div
          aria-hidden
          className={cx(
            "absolute inset-0 bg-notch-ink/10 transition-[clip-path] duration-(--shape-dur)",
            fast ? "ease-dalil-out" : "ease-dalil-drawer",
            "motion-reduce:transition-none",
          )}
          style={{ clipPath: edgeClip }}
        />
        {/* The night glass body. The dark class flips every BoardUI token inside it. */}
        <div
          className={cx(
            "dark absolute inset-0 bg-notch font-sans text-notch-ink transition-[clip-path] duration-(--shape-dur)",
            fast ? "ease-dalil-out" : "ease-dalil-drawer",
            "motion-reduce:transition-none",
          )}
          style={{ clipPath: bodyClip }}
        >
          <Layer active={active === "rest"} reduced={reduced}>
            <Button variant="ghost" aria-label={working ? `Open chat, ${working} tasks running` : "Open Dalil chat"}
              onClick={() => fire("open-ask")} className={cx("pointer-events-auto gap-2 bg-transparent px-0 text-notch-ink hover:bg-notch-raised", compact ? "mt-1.5 h-4.5 w-16 rounded-full" : "h-7.5 w-33 rounded-none")}>
              {compact ? <span aria-hidden className={cx("size-1.5 rounded-full", working ? "bg-notch-accent motion-safe:animate-pulse" : "bg-notch-raised-2")} /> : <BrandMark className="size-3.5" />}
              {!compact && working > 0 && <span className="flex items-center gap-1.5 text-caption-1-medium text-notch-ink-2"><span className="size-1.5 rounded-full bg-notch-accent motion-safe:animate-pulse" />{working}</span>}
            </Button>
          </Layer>

          <Layer active={active === "setup"} reduced={reduced}>
            <SetupLayer report={reportHeight}>{setupPanel}</SetupLayer>
          </Layer>

          <Layer active={active === "home"} reduced={reduced}>
            <HomeLayer data={home} onAction={fire} active={active === "home"} shortcutHint={shortcutHint} projectName={props.projectName} />
          </Layer>

          <Layer active={active === "listening"} reduced={reduced}>
            <ListeningLayer data={listening} level={level} live={active === "listening" && !reduced} />
          </Layer>

          <Layer active={active === "thinking"} reduced={reduced}>
            <ThinkingLayer live={active === "thinking" && !reduced} text={props.thinkingText} onOpen={()=>fire("open-ask")} onStop={()=>fire("stop-task")} />
          </Layer>

          <Layer active={active === "guide"} reduced={reduced}>
            <GuideLayer data={guide} onAction={fire} live={active === "guide" && !reduced} report={reportHeight} />
          </Layer>

          <Layer active={active === "correcting"} reduced={reduced}>
            <CorrectingLayer data={correcting} report={reportHeight} />
          </Layer>

          <Layer active={active === "done"} reduced={reduced}>
            <DoneLayer data={done} active={active === "done"} reduced={reduced} />
          </Layer>

          <Layer active={active === "error"} reduced={reduced}>
            <ErrorLayer data={error} onAction={fire} report={reportHeight} />
          </Layer>

          <Layer active={active === "ask"} reduced={reduced}>
            <AskLayer
              data={ask}
              active={active === "ask"}
              actions={askProps ?? {}}
              report={reportHeight}
            />
          </Layer>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ layers */

/** A state's content. Leaves faster than it arrives, and an inactive layer is inert and invisible. */
function Layer({
  active,
  reduced,
  children,
}: {
  active: boolean;
  reduced: boolean;
  children: ReactNode;
}) {
  return (
    <div
      inert={!active}
      className={cx(
        "absolute inset-x-0 top-0 flex justify-center ease-dalil-out",
        reduced
          ? "transition-[opacity,visibility]"
          : "transition-[opacity,filter,translate,visibility]",
        active
          ? "visible opacity-100 blur-none translate-y-0 duration-(--in-dur) delay-(--in-delay)"
          : cx("invisible opacity-0 duration-(--out-dur)", !reduced && "blur-[2px] -translate-y-1"),
      )}
    >
      {children}
    </div>
  );
}

/** The Setup panel. It is as tall as its content, up to the stage. */
function SetupLayer({ children, report }: { children: ReactNode; report: (key: LayerKey, h: number) => void }) {
  const ref = useReportHeight("setup", report);
  return (
    <div ref={ref} className="pointer-events-auto w-140">
      {children}
    </div>
  );
}

function useReportHeight(key: LayerKey, report: (key: LayerKey, h: number) => void) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    report(key, el.offsetHeight);
    const ro = new ResizeObserver(() => report(key, el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [key, report]);
  return ref;
}

const FOCUS_ON_NOTCH = "pointer-events-auto focus-visible:ring-offset-notch";

/* Home */

function HomeLayer({
  data,
  onAction,
  active,
  shortcutHint,
  projectName,
}: {
  data: HomeData;
  onAction: (a: NotchAction) => void;
  active: boolean;
  shortcutHint?: string;
  projectName?: string;
}) {
  const part = dayPartForHour(data.hour);
  const greeting = fill(copy.notch.home.greeting[part], { name: data.name });
  const endpoint = data.endpoint;

  return (
    <div className="flex h-55 w-134 flex-col px-5 pt-4 pb-5">
      <div className="flex h-9 items-center justify-between gap-3">
        {endpoint ? <EndpointChip endpoint={endpoint} /> : <span />}
        <div className="flex items-center gap-2">
          <HintIconButton icon={RiFolderLine} label="Projects" active={active} onPress={()=>onAction("open-projects")} />
          <HintIconButton
            icon={RiReceiptLine}
            label={copy.aria.icon_buttons.receipts}
            active={active}
            onPress={() => onAction("open-receipts")}
          />
          <HintIconButton
            icon={RiSettings3Line}
            label={copy.aria.icon_buttons.gear}
            active={active}
            onPress={() => onAction("open-setup")}
          />
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-1.5 text-center">
        <p className="text-title-2-semibold text-notch-ink">{greeting}</p>
        {endpoint ? (
          <>
            <Hint text={shortcutHint ?? copy.notch.home.hint_bind} />
            <Button size="xs" variant="ghost" leadingIcon={RiFolderLine} onClick={()=>onAction("open-projects")} className="text-notch-muted">{projectName ? `Working in ${projectName}` : "Choose a project"}</Button>
            <div className="mt-1.5 flex items-center gap-2">
              <Button size="medium" leadingIcon={RiMicLine} className={FOCUS_ON_NOTCH} onClick={() => onAction("open-talk")}>
                {copy.notch.home.talk_button}
              </Button>
              <Button size="medium" variant="secondary" className={FOCUS_ON_NOTCH} onClick={() => onAction("open-ask")}>
                {copy.notch.home.ask_button}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-body-regular text-notch-ink-2">{copy.setup.first_run}</p>
            <Button
              size="medium"
              trailingIcon={RiArrowRightLine}
              className={cx(FOCUS_ON_NOTCH, "mt-2")}
              onClick={() => onAction("open-setup")}
            >
              {copy.setup.buttons.connect_endpoint}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function Hint({ text }: { text: string }) {
  const parts = text.split(/(Ctrl|Alt)/);
  return (
    <p className="text-body-regular leading-6 text-notch-ink-2">
      {parts.map((part, i) =>
        part === "Ctrl" || part === "Alt" ? (
          <kbd key={i} className="keycap mx-0.5 align-middle">
            {part}
          </kbd>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}

function HintIconButton({
  icon,
  label,
  active,
  onPress,
}: {
  icon: typeof RiSettings3Line;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const button = (
    <IconButton
      icon={icon}
      aria-label={label}
      onClick={onPress}
      className={cx(FOCUS_ON_NOTCH, "before:absolute before:-inset-1 before:content-['']")}
    />
  );
  /* An inert layer cannot take focus, so only an active layer gets the tooltip wiring. */
  if (!active) return button;
  return (
    <TooltipTrigger delay={350}>
      <Focusable>{button}</Focusable>
      <Tooltip className="dark" placement="bottom">
        {label}
      </Tooltip>
    </TooltipTrigger>
  );
}

function EndpointChip({ endpoint }: { endpoint: NotchEndpoint }) {
  const Icon = endpoint.local ? RiMacbookLine : RiGlobalLine;
  return (
    <Chip color="soft" variant="caption" className="h-7 gap-1.5 rounded-full py-0 ps-2 pe-3">
      <Icon className="size-4 shrink-0 text-foreground-icon-secondary" aria-hidden />
      <span>{endpoint.local ? copy.notch.home.endpoint_chip_local : endpoint.host}</span>
      <span className="sr-only">, model {endpoint.model}</span>
    </Chip>
  );
}

/* Listening */

const BAR_WEIGHTS = [0.55, 0.78, 0.92, 1, 0.9, 0.72, 0.5];

function ListeningLayer({
  data,
  level,
  live,
}: {
  data: ListeningData;
  level: number;
  live: boolean;
}) {
  /* A short history makes the level travel across the bars like a ripple. */
  const [history, setHistory] = useState<number[]>(() => BAR_WEIGHTS.map(() => 0));
  const [seen, setSeen] = useState(level);
  if (seen !== level) {
    setSeen(level);
    setHistory((hs) => [...hs.slice(1), level]);
  }
  const silent = level < 0.02;

  return (
    <div className="flex h-16 w-75 items-center gap-4 ps-5 pe-5">
      <div aria-hidden className="flex h-8 shrink-0 items-center gap-1">
        {BAR_WEIGHTS.map((weight, i) => {
          const scale = silent ? 0.5 : Math.min(1, 0.22 + history[i] * weight * 0.78);
          return (
            <span
              key={i}
              className="flex h-8 w-0.75 items-center justify-center transition-transform duration-100 ease-dalil-out"
              style={{ transform: `scaleY(${scale})` }}
            >
              <span
                className={cx("block h-8 w-full rounded-full bg-notch-ink", live && silent && "dalil-notch-idle")}
                style={
                  {
                    "--delay": `${i * 130}ms`,
                    "--idle-low": 0.28 + (i % 3) * 0.08,
                  } as CSSProperties
                }
              />
            </span>
          );
        })}
      </div>
      <TranscriptLine text={data.transcript} />
    </div>
  );
}

/** One line that shows its newest words: scrolled to the end when it overflows, fading at the start. */
function TranscriptLine({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollLeft = el.scrollWidth;
    setOverflowing(el.scrollWidth > el.clientWidth + 1);
  }, [text]);
  return (
    <div
      ref={ref}
      className={cx(
        "min-w-0 flex-1 overflow-hidden whitespace-nowrap text-body-medium text-notch-ink",
        overflowing && "[mask-image:linear-gradient(to_right,transparent,black_28px)]",
      )}
    >
      {text}
    </div>
  );
}

/* Thinking */

/** Three bars that shimmer while Dalil works. The Thinking layer and the Ask field both show them. */
function ShimmerBars({ live }: { live: boolean }) {
  return (
    <div aria-hidden className="flex h-4 items-center gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cx("block h-4 w-0.75 rounded-full bg-notch-ink", live && "dalil-notch-shimmer")}
          style={{ "--delay": `${i * 180}ms` } as CSSProperties}
        />
      ))}
    </div>
  );
}

function ThinkingLayer({live,text,onOpen,onStop}:{live:boolean;text?:string;onOpen:()=>void;onStop:()=>void}) {
  return <div className="pointer-events-auto flex h-14 w-100 items-center gap-3 px-4" role="status" aria-live="polite">
    <ShimmerBars live={live}/>
    <button type="button" onClick={onOpen} aria-label="Open task conversation" className="min-w-0 flex-1 rounded-lg py-2 text-start focus-visible:outline-2 focus-visible:outline-border-focus-ring">
      <span className="block truncate text-body-medium text-notch-ink">{text??copy.notch.thinking.label}</span>
      <span className="block text-caption-1-medium text-notch-muted">Working on your request</span>
    </button>
    <IconButton icon={RiStopCircleLine} size="small" aria-label="Stop current task" onClick={onStop} className="border-transparent bg-transparent text-notch-muted shadow-none hover:bg-notch-raised-2"/>
  </div>;
}

/* Guiding and waiting share one layer, so a step that starts waiting does not re-fade its text. */

const TICK_TILT = ["-rotate-2", "rotate-1", "-rotate-1", "rotate-2"];

function StepTicks({ step, total }: { step: number; total: number }) {
  return (
    <ol aria-hidden className="flex items-end gap-1.5">
      {Array.from({ length: total }, (_, i) => {
        const done = i < step - 1;
        const current = i === step - 1;
        return (
          <li key={i} className={cx("relative h-2 w-6", TICK_TILT[i % TICK_TILT.length])}>
            <span className="absolute inset-x-0 bottom-0 block rounded-full border-b-[3px] border-notch-edge" />
            <span
              className="absolute inset-x-0 bottom-0 block rounded-full border-b-[3px] border-notch-ink transition-[clip-path] duration-220 ease-dalil-out motion-reduce:transition-none"
              style={{ clipPath: done ? "inset(0 0 0 0)" : "inset(0 100% 0 0)" }}
            />
            <span
              className="absolute inset-x-0 bottom-0 block rounded-full border-b-[3px] border-notch-accent transition-[clip-path] duration-220 ease-dalil-out motion-reduce:transition-none"
              style={{ clipPath: current ? "inset(0 0 0 0)" : "inset(0 100% 0 0)" }}
            />
          </li>
        );
      })}
    </ol>
  );
}

function GuideLayer({
  data,
  onAction,
  live,
  report,
}: {
  data: GuideData;
  onAction: (a: NotchAction) => void;
  live: boolean;
  report: (key: LayerKey, h: number) => void;
}) {
  const ref = useReportHeight("guide", report);
  return (
    <div ref={ref} className="flex min-h-24 w-110 flex-col gap-2.5 px-5 pt-3 pb-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-caption-1-medium text-notch-muted">
            {fill(copy.notch.guiding.step, { n: data.step, total: data.total })}
          </p>
          <p key={data.text} className="dalil-notch-text-in mt-0.5 text-body-medium text-notch-ink">
            {data.text}
          </p>
        </div>
        <Button
          variant="ghost"
          size="small"
          className={cx(
            FOCUS_ON_NOTCH,
            "-me-2 -mt-1 h-11 shrink-0 bg-none bg-transparent px-2 text-notch-ink-2 hover:bg-notch-raised-2 hover:text-notch-ink active:bg-notch-rule",
          )}
          onClick={() => onAction("skip")}
        >
          {copy.notch.guiding.skip}
        </Button>
      </div>
      <div className="mt-auto flex h-5 items-center justify-between gap-3">
        <StepTicks step={data.step} total={data.total} />
        <span
          aria-hidden={!data.waiting}
          className={cx(
            "flex items-center gap-1.5 text-caption-1-medium text-notch-ink-2 transition-opacity duration-220 ease-dalil-out motion-reduce:transition-none",
            data.waiting ? "opacity-100" : "opacity-0",
          )}
        >
          <RiCursorLine
            aria-hidden
            className={cx("size-4 text-notch-accent", live && data.waiting && "dalil-notch-breathe")}
          />
          {copy.notch.waiting.label}
        </span>
      </div>
    </div>
  );
}

/* Correcting */

function CorrectingLayer({
  data,
  report,
}: {
  data: CorrectingData;
  report: (key: LayerKey, h: number) => void;
}) {
  const ref = useReportHeight("correcting", report);
  return (
    <div ref={ref} className="flex min-h-26 w-110 items-center px-5 py-4">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <RiErrorWarningLine aria-hidden className="mt-0.5 size-5 shrink-0 text-notch-warn" />
        <div className="min-w-0 flex-1">
          <p className="text-body-medium text-notch-ink">{data.text}</p>
          <p className="mt-1 text-body-regular text-notch-ink-2">{data.hint}</p>
        </div>
      </div>
    </div>
  );
}

/* Done */

function DoneLayer({ data, active, reduced }: { data: DoneData; active: boolean; reduced: boolean }) {
  return (
    <div className="flex h-11.5 w-70 items-center justify-center gap-2">
      {/* The check is drawn left to right with a clip-path wipe. */}
      <span
        aria-hidden
        className={cx(
          "flex",
          !reduced && "transition-[clip-path] duration-300 ease-dalil-out",
          !reduced && active && "delay-150",
        )}
        style={{ clipPath: active || reduced ? "inset(0 0 0 0)" : "inset(0 100% 0 0)" }}
      >
        <RiCheckLine className="size-5 text-notch-ok" aria-hidden />
      </span>
      <span className="text-body-medium text-notch-ink">{data.text}</span>
    </div>
  );
}

/* Error */

function ErrorLayer({
  data,
  onAction,
  report,
}: {
  data: ErrorData;
  onAction: (a: NotchAction) => void;
  report: (key: LayerKey, h: number) => void;
}) {
  const ref = useReportHeight("error", report);
  return (
    <div ref={ref} className="flex min-h-21 w-100 items-center gap-3 ps-5 pe-4 py-4">
      <RiErrorWarningLine aria-hidden className="size-5 shrink-0 text-notch-error" />
      <p className="min-w-0 flex-1 text-body-medium text-notch-ink">{data.title}</p>
      <Button size="small" className={cx(FOCUS_ON_NOTCH, "h-10 shrink-0 px-3")} onClick={() => onAction(data.action)}>
        {data.actionLabel}
      </Button>
    </div>
  );
}

/* Ask */

function AskLayer({ data, active, actions, report }: {
  data: AskData;
  active: boolean;
  actions: ChatPanelActions;
  report: (key: LayerKey, h: number) => void;
}) {
  const ref = useReportHeight("ask", report);
  return <div ref={ref}><ChatPanel data={data} active={active} actions={actions} /></div>;
}
