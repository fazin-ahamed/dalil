"use client";

import "./stage.css";
import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { RiCursorLine, RiErrorWarningLine, RiPlayFill } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { GuideCard } from "@/components/dalil/cards/guide-card";
import { RoughFilters } from "@/components/dalil/cards/rough-filters";
import type { ChecklistData } from "@/components/dalil/cards/types";
import { Notch, type NotchProps } from "@/components/dalil/notch/notch";
import { useSmoothLevel } from "@/components/dalil/notch/hooks";
import { PointerLayer, type PointerLayerHandle } from "@/components/dalil/pointer/pointer-layer";
import { placeCard } from "@/lib/placement";
import { cx } from "@/utils/cx";
import { KeyHint, SettingsPanel, Wallpaper } from "./desk";
import { createRunner } from "./runner";
import {
  CARD_BLOCKS,
  STAGE_COPY,
  STATIC_STATE,
  stageReducer,
  type Mode,
  type NotchView,
} from "./script";

const CARD_DATA: ChecklistData = {
  strip: STAGE_COPY.card.strip,
  heading: STAGE_COPY.card.heading,
  subtitle: STAGE_COPY.card.subtitle,
  items: [...STAGE_COPY.card.items],
  pill: STAGE_COPY.card.pill,
};

/** The notch hangs over the top of the desk; cards stay below this line. */
const NOTCH_BAND = 104;
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), Math.max(lo, hi));

function notchProps(view: NotchView, level: number): NotchProps {
  switch (view.kind) {
    case "rest":
      return { state: "rest" };
    case "listening":
      return { state: "listening", transcript: view.transcript, level };
    case "thinking":
      return { state: "thinking" };
    case "guiding":
      return {
        state: view.waiting ? "waiting" : "guiding",
        step: view.step,
        total: view.total,
        text: view.text,
      };
    case "correcting":
      return { state: "correcting", text: view.text, hint: view.hint };
    case "done":
      return { state: "done", text: view.text };
  }
}

/**
 * The signature flight on a desk: ask a question, the notch listens, the pointer flies out of it,
 * lands on the control and rings it while a paper card draws beside it. The server renders a static
 * frame of that moment so the page is never empty; the client takes over and plays the scenario.
 */
export function Stage() {
  const [state, dispatch] = useReducer(stageReducer, STATIC_STATE);
  const reduced = Boolean(useReducedMotion());
  const reducedRef = useRef(reduced);
  useEffect(() => {
    reducedRef.current = reduced;
  }, [reduced]);

  const deskRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<PointerLayerHandle>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<HTMLButtonElement>(null);
  const wifiRef = useRef<HTMLLabelElement>(null);
  const bluetoothRef = useRef<HTMLLabelElement>(null);

  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  /* placeCard: keep the card outside the panel plus 24px, inside the desk and below the notch. */
  const place = useCallback(() => {
    const desk = deskRef.current;
    const panel = panelRef.current;
    const card = cardRef.current;
    if (!desk || !panel || !card) return;
    const d = desk.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    const target = { x: p.left - d.left, y: p.top - d.top, width: p.width, height: p.height };
    const size = { width: card.offsetWidth, height: card.offsetHeight };
    const container = { x: 0, y: NOTCH_BAND, width: d.width, height: d.height - NOTCH_BAND - 16 };
    const spot = placeCard(target, container, size);
    /* Beside the panel, the card lines up with its top edge, next to the sidebar the pointer visits first. */
    const y =
      spot.side === "left" || spot.side === "right"
        ? clamp(target.y, container.y, container.y + container.height - size.height)
        : spot.y;
    setPos((prev) => (prev && prev.x === spot.x && prev.y === y ? prev : { x: spot.x, y }));
  }, []);

  /* Getters the runner calls later, from effects and timers, never during render. */
  const getLayer = useCallback(() => layerRef.current, []);
  const getTarget = useCallback(
    (id: "network" | "wifi" | "bluetooth") =>
      id === "network" ? networkRef.current : id === "wifi" ? wifiRef.current : bluetoothRef.current,
    [],
  );
  const getReduced = useCallback(() => reducedRef.current, []);
  const getDeskWidth = useCallback(() => deskRef.current?.clientWidth ?? 0, []);

  /* The runner only calls these getters from events, effects and timers; nothing reads a ref while rendering. */
  // eslint-disable-next-line react-hooks/refs
  const [runner] = useState(() =>
    createRunner({
      dispatch,
      layer: getLayer,
      target: getTarget,
      reduced: getReduced,
      compact: () => !window.matchMedia("(min-width: 1280px)").matches,
      notchTip: () => {
        const width = getDeskWidth();
        const small = window.matchMedia("(max-width: 519px)").matches;
        return { x: width / 2, y: small ? 62 : 78 };
      },
      placeCard: place,
      frame: () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
    }),
  );

  /* Measure the static frame before the first paint, and again whenever the desk reflows. */
  useLayoutEffect(() => {
    place();
    const desk = deskRef.current;
    if (!desk) return;
    const ro = new ResizeObserver(() => place());
    ro.observe(desk);
    return () => ro.disconnect();
  }, [place]);

  /* Esc clears everything, from any state. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") runner.cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [runner]);

  /* The flight plays once, when the desk first scrolls into view. ?still keeps the static frame. */
  useEffect(() => {
    const desk = deskRef.current;
    if (!desk || new URLSearchParams(window.location.search).has("still")) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          void runner.play("play");
        }
      },
      { threshold: 0.3 },
    );
    io.observe(desk);
    return () => io.disconnect();
  }, [runner]);

  useEffect(() => () => runner.dispose(), [runner]);

  const level = useSmoothLevel(state.notch.kind === "listening" && !reduced);
  const isStatic = state.status === "static";
  const pillShown = state.card.open && state.card.blocks >= CARD_BLOCKS;

  const modeButton = (mode: Mode) =>
    state.status === "running" && state.mode === mode ? "border-accent-600 text-accent-700" : undefined;

  return (
    <div className="flex flex-col gap-4">
      <RoughFilters />
      <div
        ref={deskRef}
        role="group"
        aria-label="Sample desktop with the Dalil notch, a settings app and a guide card"
        className="relative isolate mx-auto min-h-232 w-full max-w-136 overflow-hidden rounded-card shadow-card xl:aspect-[16/10] xl:min-h-0 xl:max-w-300"
      >
        <Wallpaper />

        <div className="pointer-events-none absolute start-1/2 top-0 z-20 -ms-70 origin-top max-[519px]:scale-80">
          <Notch
            {...notchProps(state.notch, level)}
            onAction={(a) => {
              if (a === "dismiss") runner.cancel();
              else if (a === "skip") runner.skip();
            }}
          />
        </div>

        <SettingsPanel
          panelRef={panelRef}
          networkRef={networkRef}
          wifiRef={wifiRef}
          bluetoothRef={bluetoothRef}
          state={state.panel}
          locked={state.locked}
          staticRing={isStatic}
          onNav={(id) => runner.commit({ type: "nav", id })}
          onWifi={(on) => runner.commit({ type: "wifi", on })}
          onBluetooth={(on) => dispatch({ type: "panel", patch: { bluetooth: on } })}
          className="relative z-10 mx-4 mt-28 h-96 xl:absolute xl:start-[40%] xl:end-[4%] xl:top-28 xl:mx-0 xl:mt-0 xl:h-100"
        />

        <div
          ref={cardRef}
          inert={!isStatic && !pillShown}
          className={cx(
            "absolute z-20 w-[min(380px,calc(100%-1.5rem))] transition-opacity duration-200 ease-dalil-out motion-reduce:transition-none xl:w-95",
            state.card.open ? "opacity-100" : "pointer-events-none opacity-0",
            pos
              ? "start-0 top-0"
              : "inset-x-0 top-130 mx-auto xl:inset-x-auto xl:end-[calc(60%+1.5rem)] xl:top-28 xl:mx-0",
          )}
          style={pos ? { transform: `translate(${pos.x}px, ${pos.y}px)` } : undefined}
        >
          <GuideCard
            type="checklist"
            data={CARD_DATA}
            width={380}
            drawn={state.card.blocks}
            checked={state.card.ticks}
            pill={isStatic ? null : STAGE_COPY.card.pill}
            onPill={() => void runner.follow()}
          />
        </div>

        <KeyHint ctrl={state.keys.ctrl} alt={state.keys.alt} className="absolute inset-x-4 bottom-5 z-10" />
        <PointerLayer ref={layerRef} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" leadingIcon={RiPlayFill} data-stage="play" onClick={() => void runner.play("play")}>
          Play
        </Button>
        <Button
          variant="secondary"
          leadingIcon={RiCursorLine}
          data-stage="try"
          className={modeButton("try")}
          onClick={() => void runner.play("try")}
        >
          Try it yourself
        </Button>
        <Button
          variant="secondary"
          leadingIcon={RiErrorWarningLine}
          data-stage="wrong"
          className={modeButton("wrong")}
          onClick={() => void runner.play("wrong")}
        >
          Wrong click
        </Button>
        <p className="w-full text-body-regular text-text-tertiary sm:ms-auto sm:w-auto">
          Esc clears everything. The settings app is a Sample.
        </p>
      </div>
    </div>
  );
}
