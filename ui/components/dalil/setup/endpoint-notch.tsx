"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { NotchPanel } from "@/components/dalil/notch-panel";
import { normalizeBase } from "@/lib/endpoint";
import { cx } from "@/utils/cx";
import { HOME_HEIGHT, HomePanel } from "./home-panel";
import { copy, fill } from "./setup-copy";
import { SetupPanel } from "./setup-panel";
import type { SetupActions, SetupModel } from "./setup-types";

/** Radius of the notch's bottom corners, matched in the clip so the shape never squares off. */
const NOTCH_RADIUS = 28;

export interface EndpointNotchProps {
  model: SetupModel;
  actions: SetupActions;
  sampleMode?: boolean;
  /** Round all four corners, for a panel that floats in its own window instead of hanging from the top edge. */
  floating?: boolean;
}

/**
 * The notch for this flow: one persistent black shape that shows Setup, and collapses to Home
 * after Save. Size is never animated. The shape is as tall as Setup and is revealed with
 * `clip-path`; the two faces cross-fade with a 2px blur. The shadow lives on a parent as a
 * `drop-shadow` filter so it follows the clipped outline.
 */
export function EndpointNotch({ model, actions, sampleMode = false, floating = false }: EndpointNotchProps) {
  const collapsed = model.screen === "home";
  const setupRef = useRef<HTMLDivElement>(null);
  const homeRef = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(0);
  // Home mounts the first time it is needed, so it can fade in from nothing.
  const [homeEver, setHomeEver] = useState(collapsed);
  if (collapsed && !homeEver) setHomeEver(true);

  useLayoutEffect(() => {
    const el = setupRef.current;
    if (!el) return;
    setFull(el.offsetHeight);
    const observer = new ResizeObserver(() => setFull(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  /* Move focus into the face that just opened. */
  const previous = useRef(model.screen);
  useEffect(() => {
    if (previous.current === model.screen) return;
    previous.current = model.screen;
    const root = model.screen === "setup" ? setupRef : homeRef;
    const frame = requestAnimationFrame(() => {
      root.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [model.screen]);

  /* Esc leaves Setup even when focus is on the page itself. */
  useEffect(() => {
    if (model.screen !== "setup") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented && document.activeElement === document.body) {
        actions.close();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [model.screen, actions]);

  const cut = collapsed ? Math.max(0, full - HOME_HEIGHT) : 0;
  const host = normalizeBase(model.baseUrl).host;
  const announcement =
    model.justSaved
      ? copy.aria.live.saved
      : model.screen === "setup" && model.phase === "connected"
        ? fill(copy.aria.live.connected, { host })
        : model.test === "pass"
          ? copy.aria.live.test_pass
          : model.test === "fail"
            ? copy.aria.live.test_fail
            : "";

  const face = "col-start-1 row-start-1 transition-[opacity,filter] ease-dalil-out motion-reduce:blur-none motion-reduce:duration-120";

  return (
    <div
      className="mx-auto w-full max-w-140"
      style={{ filter: "drop-shadow(0 22px 22px color-mix(in oklab, var(--color-notch) 34%, transparent))" }}
    >
      <NotchPanel
        role="region"
        aria-label={copy.aria.notch_region}
        aria-describedby="setup-keyboard-hint"
        className={cx(
          "transition-[clip-path] duration-360 ease-dalil-drawer motion-reduce:transition-none",
          floating && "rounded-[28px]",
        )}
        style={{
          boxShadow: "none",
          clipPath: `inset(0 0 ${cut}px 0 round ${floating ? NOTCH_RADIUS : 0}px ${floating ? NOTCH_RADIUS : 0}px ${NOTCH_RADIUS}px ${NOTCH_RADIUS}px)`,
        }}
      >
        <div className="grid">
          <div
            ref={setupRef}
            inert={collapsed}
            className={cx(face, "min-w-0", collapsed ? "pointer-events-none opacity-0 blur-[2px] duration-140" : "opacity-100 duration-220 delay-100")}
          >
            <SetupPanel model={model} actions={actions} sampleMode={sampleMode} />
          </div>
          <div
            ref={homeRef}
            inert={!collapsed}
            className={cx(face, "min-w-0 self-start starting:opacity-0 starting:blur-[2px]", collapsed ? "opacity-100 duration-220 delay-100" : "pointer-events-none opacity-0 blur-[2px] duration-140")}
          >
            {homeEver ? <HomePanel model={model} actions={actions} /> : null}
          </div>
        </div>
        <p id="setup-keyboard-hint" className="sr-only">
          {copy.aria.keyboard_hint}
        </p>
        <p aria-live="polite" className="sr-only">
          {announcement}
        </p>
      </NotchPanel>
    </div>
  );
}
