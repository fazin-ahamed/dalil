"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

export type DayPart = "morning" | "afternoon" | "evening" | "night";

/** Morning 5 to 11, afternoon 12 to 16, evening 17 to 20, night 21 to 4. */
export function dayPartForHour(hour: number): DayPart {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  if (h >= 17 && h < 21) return "evening";
  return "night";
}

/** Replace {name} style slots in a copy string. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? ""));
}

/**
 * Push-to-talk hotkey. Fires onDown on the key press that completes the combination and onUp as soon as
 * any key of it is released (or the window loses focus). Default combination is Ctrl + Alt.
 */
export function useHotkeyHold({
  onDown,
  onUp,
  keys = ["Control", "Alt"],
  enabled = true,
}: {
  onDown: () => void;
  onUp: () => void;
  keys?: string[];
  enabled?: boolean;
}) {
  const handlers = useRef({ onDown, onUp });
  useEffect(() => {
    handlers.current = { onDown, onUp };
  });
  const combo = keys.join("+");

  useEffect(() => {
    if (!enabled) return;
    const wanted = combo.split("+");
    const held = new Set<string>();
    let active = false;

    const down = (e: KeyboardEvent) => {
      if (wanted.includes(e.key)) held.add(e.key);
      if (!active && wanted.every((k) => held.has(k))) {
        active = true;
        handlers.current.onDown();
      }
    };
    const release = (e?: KeyboardEvent) => {
      if (e) held.delete(e.key);
      if (active && (!e || wanted.includes(e.key))) {
        active = false;
        handlers.current.onUp();
      }
      if (!e) held.clear();
    };
    const up = (e: KeyboardEvent) => release(e);
    const blur = () => release();

    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [combo, enabled]);
}

/**
 * A smooth random audio level between 0 and 1, sampled about 14 times a second. The notch bars ease
 * between samples with a short transform transition. Sample data for demos, not a microphone.
 */
export function useSmoothLevel(active: boolean): number {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!active) return;
    let current = 0.2;
    let target = 0.5;
    let tick = 0;
    const id = window.setInterval(() => {
      tick += 1;
      if (tick % 2 === 1) target = 0.12 + Math.random() * 0.88;
      current += (target - current) * 0.55;
      setLevel(current);
    }, 72);
    return () => {
      window.clearInterval(id);
      setLevel(0);
    };
  }, [active]);
  return active ? level : 0;
}

/** Types `text` out one character at a time while `active`. Pass a new restartKey to type again. */
export function useTypewriter(text: string, active: boolean, msPerChar = 72, restartKey = 0): string {
  const [out, setOut] = useState("");
  useEffect(() => {
    if (!active) return;
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setOut(text.slice(0, i));
      if (i >= text.length) window.clearInterval(id);
    }, msPerChar);
    return () => {
      window.clearInterval(id);
      setOut("");
    };
  }, [text, active, msPerChar, restartKey]);
  return active ? out : "";
}

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

/** prefers-reduced-motion that hydrates cleanly: false on the server, then the real value. */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mq = window.matchMedia(REDUCED_QUERY);
      mq.addEventListener("change", notify);
      return () => mq.removeEventListener("change", notify);
    },
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false,
  );
}
