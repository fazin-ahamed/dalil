import type { Dispatch } from "react";
import copy from "@/lib/copy.json";
import { fill } from "@/components/dalil/notch/hooks";
import type { PointerLayerHandle } from "@/components/dalil/pointer/pointer-layer";
import {
  CARD_BLOCKS,
  CARD_BLOCKS_NO_PILL,
  SECTION_LABEL,
  STAGE_COPY,
  type Mode,
  type PressId,
  type SectionId,
  type StageAction,
  type StageEvent,
} from "./script";

/**
 * The flight, as an explicit script driven by one AbortController. There are no loose timeouts: every
 * pause is `wait(ms)`, every pause and every pointer flight rejects the moment the controller aborts,
 * and the only code that runs after an abort is cleanup. Esc, Play and a new run all go through
 * `abort()`, so nothing from an old run can touch the desk afterwards.
 *
 * Verification is real. The stand-in (Play and Wrong click) performs a click through the same
 * `commit` the panel's own controls call, and the script only moves on when that event arrives.
 */

export interface RunnerDeps {
  dispatch: Dispatch<StageAction>;
  layer: () => PointerLayerHandle | null;
  /** The real controls on the desk, for the pointer to fly to. */
  target: (id: "network" | "wifi" | "bluetooth") => HTMLElement | null;
  reduced: () => boolean;
  /** True when the desk is the narrow portrait stage, where labels sit above the ring. */
  compact: () => boolean;
  /** Where the pointer leaves the notch, in desk coordinates. */
  notchTip: () => { x: number; y: number };
  /** Measure the desk and put the card beside the panel with placeCard. */
  placeCard: () => void;
  /** Resolves after the next paint, so a freshly mounted control can be measured. */
  frame: () => Promise<void>;
}

class Aborted extends Error {
  constructor() {
    super("aborted");
  }
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new Aborted());
    const onAbort = () => {
      window.clearTimeout(t);
      reject(new Aborted());
    };
    const t = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** Settle with the promise, or reject at once if the run is aborted first. */
function abortable<T>(signal: AbortSignal, promise: Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) return reject(new Aborted());
    const onAbort = () => reject(new Aborted());
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (v) => {
        signal.removeEventListener("abort", onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener("abort", onAbort);
        reject(e);
      },
    );
  });
}

type Outcome = { ok: true } | { ok: false; section: SectionId };

export function createRunner(deps: RunnerDeps) {
  let ctl: AbortController | null = null;
  let running = false;
  let mode: Mode = "play";
  let wrongDone = false;
  let stage: "network" | "wifi" = "network";

  /* What the panel shows now. The runner is the only writer, so it can answer without a render. */
  const live = { section: "sound" as SectionId, wifi: true };
  const queue: StageEvent[] = [];
  let wake: (() => void) | null = null;

  const { dispatch } = deps;

  /* ---------------------------------------------------------------- events */

  /** The one door every click goes through: a real click on the panel or the stand-in's. */
  function commit(ev: StageEvent) {
    if (ev.type === "nav") {
      live.section = ev.id;
      dispatch({ type: "panel", patch: { section: ev.id } });
    } else {
      live.wifi = ev.on;
      dispatch({ type: "panel", patch: { wifi: ev.on } });
    }
    if (running) {
      queue.push(ev);
      wake?.();
    }
  }

  function nextEvent(signal: AbortSignal) {
    return new Promise<StageEvent>((resolve, reject) => {
      if (signal.aborted) return reject(new Aborted());
      const take = () => {
        const ev = queue.shift();
        if (!ev) return false;
        wake = null;
        signal.removeEventListener("abort", onAbort);
        resolve(ev);
        return true;
      };
      const onAbort = () => {
        wake = null;
        reject(new Aborted());
      };
      if (take()) return;
      wake = take;
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  /** The demo clicks for the user: a visible press, then the same event a real click would send. */
  async function standIn(ev: StageEvent, signal: AbortSignal) {
    const press: PressId = ev.type === "nav" ? ev.id : "wifi";
    dispatch({ type: "panel", patch: { press } });
    await sleep(160, signal);
    commit(ev);
    await sleep(200, signal);
    dispatch({ type: "panel", patch: { press: null } });
  }

  /* ---------------------------------------------------------------- pieces */

  async function typeQuestion(signal: AbortSignal) {
    const text = STAGE_COPY.question;
    if (deps.reduced()) {
      dispatch({ type: "notch", view: { kind: "listening", transcript: text } });
      return;
    }
    for (let i = 1; i <= text.length; i++) {
      dispatch({ type: "notch", view: { kind: "listening", transcript: text.slice(0, i) } });
      await sleep(text[i - 1] === " " ? 70 : 46, signal);
    }
  }

  async function drawCard(signal: AbortSignal) {
    dispatch({ type: "card", patch: { blocks: 0, ticks: [false, false] } });
    await deps.frame();
    if (signal.aborted) throw new Aborted();
    deps.placeCard();
    dispatch({ type: "card", patch: { open: true } });
    if (deps.reduced()) {
      dispatch({ type: "card", patch: { blocks: CARD_BLOCKS_NO_PILL } });
      await sleep(260, signal);
      return;
    }
    const pauses = [200, 260, 220, 120];
    for (let n = 1; n <= CARD_BLOCKS_NO_PILL; n++) {
      dispatch({ type: "card", patch: { blocks: n } });
      await sleep(pauses[n - 1], signal);
    }
  }

  function tick(index: number) {
    dispatch({
      type: "card",
      patch: { ticks: index === 0 ? [true, false] : [true, true] },
    });
  }

  async function fly(signal: AbortSignal, el: HTMLElement | null, label: string, step: number, fresh: boolean) {
    const layer = deps.layer();
    if (!layer || !el) throw new Aborted();
    /* On the portrait stage the switch sits at the row's end, so its label goes above the ring and keeps the row's title readable. */
    const labelSide = deps.compact() && step === 2 ? "above" : undefined;
    const landed = await abortable(
      signal,
      layer.flyTo(el, { label, step: [step, STAGE_COPY.total], from: fresh ? deps.notchTip() : undefined, labelSide }),
    );
    if (!landed) throw new Aborted();
  }

  /** Wait for the right click. Play and Wrong click supply it; Try it yourself waits for the real one. */
  async function outcome(signal: AbortSignal): Promise<Outcome> {
    if (mode !== "try") {
      await sleep(1100, signal);
      if (mode === "wrong" && stage === "network" && !wrongDone) {
        wrongDone = true;
        await standIn({ type: "nav", id: "display" }, signal);
      } else {
        await standIn(stage === "network" ? { type: "nav", id: "network" } : { type: "wifi", on: false }, signal);
      }
    }
    for (;;) {
      const ev = await nextEvent(signal);
      if (stage === "network") {
        if (ev.type === "nav") return ev.id === "network" ? { ok: true } : { ok: false, section: ev.id };
      } else {
        if (ev.type === "wifi" && !ev.on) return { ok: true };
        if (ev.type === "nav" && ev.id !== "network") return { ok: false, section: ev.id };
      }
    }
  }

  async function drive(signal: AbortSignal) {
    let recovering = false;
    let cardShown = false;
    const total = STAGE_COPY.total;

    for (;;) {
      queue.length = 0;

      if (stage === "network") {
        if (!recovering) {
          dispatch({
            type: "notch",
            view: { kind: "guiding", step: 1, total, text: STAGE_COPY.step1, waiting: false },
          });
        } else {
          /* Correcting stays on the notch while the pointer re-points from where it started. */
          await sleep(900, signal);
          deps.layer()?.clear();
          await sleep(140, signal);
        }
        await fly(signal, deps.target("network"), STAGE_COPY.label1, 1, true);
        if (!cardShown) {
          await drawCard(signal);
          cardShown = true;
        }
        if (!recovering) {
          dispatch({
            type: "notch",
            view: { kind: "guiding", step: 1, total, text: STAGE_COPY.step1, waiting: true },
          });
        }
        dispatch({ type: "lock", locked: mode !== "try" });

        const result = await outcome(signal);
        if (result.ok) {
          tick(0);
          recovering = false;
          stage = "wifi";
          await sleep(deps.reduced() ? 400 : 700, signal);
          continue;
        }
        await correct(result.section, signal);
        recovering = true;
        continue;
      }

      /* Step 2: the switch exists only once Network is open. */
      dispatch({
        type: "notch",
        view: { kind: "guiding", step: 2, total, text: STAGE_COPY.step2, waiting: false },
      });
      await deps.frame();
      await fly(signal, deps.target("wifi"), STAGE_COPY.label2, 2, false);
      dispatch({
        type: "notch",
        view: { kind: "guiding", step: 2, total, text: STAGE_COPY.step2, waiting: true },
      });
      const result = await outcome(signal);
      if (result.ok) {
        tick(1);
        return;
      }
      await correct(result.section, signal);
      recovering = true;
      stage = "network";
    }
  }

  /** The click opened the wrong section: say so in the notch and let the loop re-point at Network. */
  async function correct(section: SectionId, signal: AbortSignal) {
    dispatch({
      type: "notch",
      view: {
        kind: "correcting",
        text: fill(copy.notch.correcting.happened, { name: SECTION_LABEL[section] }),
        hint: STAGE_COPY.correctingHint,
      },
    });
    if (signal.aborted) throw new Aborted();
  }

  async function finish(signal: AbortSignal) {
    dispatch({ type: "notch", view: { kind: "done", text: STAGE_COPY.done } });
    deps.layer()?.clear();
    await sleep(deps.reduced() ? 200 : 700, signal);
    dispatch({ type: "card", patch: { blocks: CARD_BLOCKS } });
    await sleep(2400, signal);
    dispatch({ type: "notch", view: { kind: "rest" } });
    dispatch({ type: "status", status: "idle" });
    dispatch({ type: "lock", locked: false });
  }

  /* ---------------------------------------------------------------- public */

  function abort() {
    ctl?.abort();
    ctl = null;
    running = false;
    wake = null;
    queue.length = 0;
    deps.layer()?.clear();
  }

  async function play(next: Mode) {
    abort();
    const controller = new AbortController();
    ctl = controller;
    const { signal } = controller;
    mode = next;
    running = true;
    wrongDone = false;
    stage = "network";
    live.section = "sound";
    live.wifi = true;
    dispatch({ type: "start", mode: next });

    try {
      await sleep(900, signal);
      dispatch({ type: "keys", patch: { ctrl: true } });
      await sleep(130, signal);
      dispatch({ type: "keys", patch: { alt: true } });
      dispatch({ type: "notch", view: { kind: "listening", transcript: "" } });
      await sleep(650, signal);
      await typeQuestion(signal);
      await sleep(700, signal);
      dispatch({ type: "keys", patch: { ctrl: false, alt: false } });
      dispatch({ type: "notch", view: { kind: "thinking" } });
      await sleep(1400, signal);
      await drive(signal);
      await finish(signal);
    } catch (e) {
      if (!(e instanceof Aborted)) throw e;
    } finally {
      if (ctl === controller) {
        running = false;
      }
    }
  }

  /** The pill under the card: a short follow-up flight to the Bluetooth row. */
  async function follow() {
    abort();
    const controller = new AbortController();
    ctl = controller;
    const { signal } = controller;
    running = true;
    dispatch({ type: "status", status: "running" });
    dispatch({ type: "lock", locked: true });
    try {
      if (live.section !== "network") {
        commit({ type: "nav", id: "network" });
        await deps.frame();
      }
      dispatch({
        type: "notch",
        view: { kind: "guiding", step: 1, total: 1, text: STAGE_COPY.follow, waiting: false },
      });
      const layer = deps.layer();
      const el = deps.target("bluetooth");
      if (!layer || !el) throw new Aborted();
      const landed = await abortable(
        signal,
        layer.flyTo(el, {
          label: STAGE_COPY.followLabel,
          from: deps.notchTip(),
          labelSide: deps.compact() ? "above" : undefined,
        }),
      );
      if (!landed) throw new Aborted();
      await sleep(3400, signal);
      layer.clear();
      dispatch({ type: "notch", view: { kind: "rest" } });
      dispatch({ type: "status", status: "idle" });
      dispatch({ type: "lock", locked: false });
    } catch (e) {
      if (!(e instanceof Aborted)) throw e;
    } finally {
      if (ctl === controller) running = false;
    }
  }

  /** Esc: stop everything and take the pointer, ring, card and notch status off the desk. */
  function cancel() {
    abort();
    dispatch({ type: "clear" });
  }

  /** Skip: the demo does the current step for the user. */
  function skip() {
    const controller = ctl;
    if (!controller || !running) return;
    void standIn(
      stage === "network" ? { type: "nav", id: "network" } : { type: "wifi", on: false },
      controller.signal,
    ).catch(() => undefined);
  }

  return { play, follow, cancel, commit, skip, dispose: abort };
}

export type Runner = ReturnType<typeof createRunner>;
