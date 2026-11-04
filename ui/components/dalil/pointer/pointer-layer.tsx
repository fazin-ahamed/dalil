"use client";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  type AnimationPlaybackControls,
} from "motion/react";
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type Ref,
} from "react";
import { flushSync } from "react-dom";
import copy from "@/lib/copy.json";
import { cx } from "@/utils/cx";
import { LensFrame, PointerGlyph, PointerLabel, RingFrame, ringOutset } from "./pointer-parts";

export interface PointerRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** An element, or a rectangle in the layer's own coordinate space. */
export type PointerTarget = Element | PointerRect;

export interface FlyOptions {
  /** Ink pill beside the ring. 24 characters at most. */
  label?: string;
  /** Renders "i of n" in the label. */
  step?: [number, number];
  /** Draw the ring on landing. Defaults to true. */
  ring?: boolean;
  /** Flight time in ms. Defaults to 380 to 720 by distance. */
  duration?: number;
  /** Where the pointer appears when it was hidden. Defaults to the top centre, where the notch hangs. */
  from?: { x: number; y: number };
  /** Force the label's side. "above" lines the label up with the ring's end edge. Defaults to the side with room. */
  labelSide?: "end" | "start" | "below" | "above";
}

export type PointerEdge = "top" | "bottom" | "left" | "right";

export interface PointerLayerHandle {
  /** Fly to the target and land as a ring. Resolves true on landing, false if interrupted or cleared. */
  flyTo: (target: PointerTarget, options?: FlyOptions) => Promise<boolean>;
  /** Target is off screen: park at the nearest edge, pointing at it, with a short label. */
  park: (edge: PointerEdge, text?: string) => Promise<boolean>;
  /** For targets under 16px: land on it and show a 56px magnified lens beside it. */
  callout: (target: PointerTarget, options?: Omit<FlyOptions, "ring">) => Promise<boolean>;
  /** Remove the pointer, ring, label and lens. */
  clear: () => void;
  /** 28px pointer and 3px ring. */
  setLarge: (large: boolean) => void;
  /** Box around the ring, label and lens now on screen, in layer coordinates. Use it to keep a card clear of them. */
  bounds: () => PointerRect | null;
}

interface RingState {
  key: number;
  box: PointerRect;
  radius: number;
  label?: { text: string; stepText?: string; side: "end" | "start" | "below" | "above" };
}

interface ParkState {
  key: number;
  edge: PointerEdge;
  text: string;
  x: number;
  y: number;
}

interface LensState {
  key: number;
  x: number;
  y: number;
  stem: { x: number; y: number; length: number; angle: number };
  source: Element | null;
  scale: number;
}

const LEAD_EASE = [0.23, 1, 0.32, 1] as const;
const LAG_EASE = [0.45, 0, 0.25, 1] as const;
const EDGE_ANGLE: Record<PointerEdge, number> = { top: 45, right: 135, bottom: 225, left: 315 };
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), Math.max(lo, hi));

/** Polygon that wipes around the box clockwise from the top. p runs 0 to 1. */
function sweepPolygon(p: number, steps = 18) {
  const pts = ["50% 50%"];
  for (let i = 0; i <= steps; i++) {
    const a = -Math.PI / 2 + p * 2 * Math.PI * (i / steps);
    const c = Math.cos(a);
    const s = Math.sin(a);
    const t = 70 / Math.max(Math.abs(c), Math.abs(s));
    pts.push(`${(50 + c * t).toFixed(2)}% ${(50 + s * t).toFixed(2)}%`);
  }
  return `polygon(${pts.join(",")})`;
}

function RingMark({ ring, large, reduced }: { ring: RingState; large: boolean; reduced: boolean }) {
  const pulseRef = useRef<HTMLDivElement>(null);
  const sweepRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (reduced) return;
    const frames = Array.from({ length: 12 }, (_, i) => {
      const t = i / 11;
      return { clipPath: sweepPolygon(1 - Math.pow(1 - t, 3)), offset: t };
    });
    const sweep = sweepRef.current?.animate(frames, { duration: 260, easing: "linear", fill: "both" });
    const pulse = pulseRef.current?.animate(
      [
        { transform: "scale(0.94)", easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
        { transform: "scale(1.06)", easing: "cubic-bezier(0.23, 1, 0.32, 1)", offset: 0.5 },
        { transform: "scale(1)" },
      ],
      { duration: 240, fill: "both" },
    );
    return () => {
      sweep?.cancel();
      pulse?.cancel();
    };
  }, [reduced]);

  const { box, radius, label } = ring;
  const labelPlace =
    label?.side === "end"
      ? "start-full top-1/2 ms-3 -translate-y-1/2"
      : label?.side === "start"
        ? "end-full top-1/2 me-3 -translate-y-1/2"
        : label?.side === "above"
          ? "end-0 bottom-full mb-3"
          : "start-0 top-full mt-3";

  return (
    <motion.div
      data-pointer-mark
      className="absolute left-0 top-0"
      style={{ x: box.x, y: box.y, width: box.width, height: box.height }}
      initial={{ opacity: reduced ? 0 : 1 }}
      animate={{ opacity: 1, transition: { duration: reduced ? 0.16 : 0 } }}
      exit={{ opacity: 0, transition: { duration: 0.12, ease: LEAD_EASE } }}
    >
      <div ref={pulseRef} className="absolute inset-0">
        <div ref={sweepRef} className="absolute inset-0">
          <RingFrame radius={radius} large={large} />
        </div>
      </div>
      {label ? (
        <PointerLabel
          data-pointer-mark
          text={label.text}
          stepText={label.stepText}
          className={cx("absolute", labelPlace)}
        />
      ) : null}
    </motion.div>
  );
}

function LensMark({ lens, reduced }: { lens: LensState; reduced: boolean }) {
  const host = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const node = host.current;
    if (!node) return;
    node.replaceChildren();
    if (!lens.source) return;
    const clone = lens.source.cloneNode(true) as HTMLElement;
    clone.removeAttribute("id");
    clone.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
    clone.setAttribute("inert", "");
    Object.assign(clone.style, {
      position: "absolute",
      left: "50%",
      top: "50%",
      margin: "0",
      pointerEvents: "none",
      transformOrigin: "center",
      transform: `translate(-50%, -50%) scale(${lens.scale})`,
    });
    node.appendChild(clone);
  }, [lens]);

  return (
    <>
      <motion.div
        data-pointer-mark
        className="absolute left-0 top-0 h-0.5 origin-left rounded-full bg-ink shadow-[0_0_0_1px_var(--color-text-white)]"
        style={{ x: lens.stem.x, y: lens.stem.y, width: lens.stem.length, rotate: lens.stem.angle }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: reduced ? 0.16 : 0.2, ease: LEAD_EASE } }}
        exit={{ opacity: 0, transition: { duration: 0.12 } }}
      />
      <motion.div
        data-pointer-mark
        className="absolute left-0 top-0"
        style={{ x: lens.x - 28, y: lens.y - 28 }}
        initial={{ opacity: 0, scale: reduced ? 1 : 0.95 }}
        animate={{ opacity: 1, scale: 1, transition: { duration: reduced ? 0.16 : 0.22, ease: LEAD_EASE } }}
        exit={{ opacity: 0, transition: { duration: 0.12 } }}
      >
        <LensFrame>
          <span ref={host} className="absolute inset-0 block" />
          {!lens.source ? (
            <span className="absolute inset-0 grid place-items-center">
              <span className="block size-3 rounded-full bg-signal shadow-glow-signal" />
            </span>
          ) : null}
        </LensFrame>
      </motion.div>
    </>
  );
}

/**
 * Overlay that fills its relative parent and draws the guide's fingertip. It never takes input.
 * Drive it through the ref: flyTo, park, callout, clear, setLarge.
 */
export function PointerLayer({
  ref,
  className,
  large: largeProp = false,
}: {
  ref?: Ref<PointerLayerHandle>;
  className?: string;
  large?: boolean;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const stretchRef = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const opacity = useMotionValue(0);
  const rot = useMotionValue(0);
  const reducedPref = useReducedMotion();
  const reduced = Boolean(reducedPref);
  const reducedRef = useRef(reduced);
  const [large, setLargeState] = useState(largeProp);
  const largeRef = useRef(large);
  const [ring, setRing] = useState<RingState | null>(null);
  const [parked, setParked] = useState<ParkState | null>(null);
  const [lens, setLens] = useState<LensState | null>(null);

  const visible = useRef(false);
  const flight = useRef(0);
  const motions = useRef<AnimationPlaybackControls[]>([]);
  const pending = useRef<((landed: boolean) => void) | null>(null);
  const keySeed = useRef(0);

  useEffect(() => {
    reducedRef.current = reduced;
  }, [reduced]);
  useEffect(() => {
    largeRef.current = large;
  }, [large]);

  // Stretch along the velocity, at most 1.15x, from the live motion values.
  useEffect(() => {
    const update = () => {
      const el = stretchRef.current;
      if (!el) return;
      const vx = x.getVelocity();
      const vy = y.getVelocity();
      const speed = Math.hypot(vx, vy);
      if (speed < 40) {
        el.style.transform = "";
        return;
      }
      const s = 1 + 0.15 * Math.min(1, speed / 3200);
      const a = (Math.atan2(vy, vx) * 180) / Math.PI;
      el.style.transform = `rotate(${a}deg) scaleX(${s}) rotate(${-a}deg)`;
    };
    const offX = x.on("change", update);
    const offY = y.on("change", update);
    return () => {
      offX();
      offY();
    };
  }, [x, y]);

  const stopMotion = useCallback(() => {
    motions.current.forEach((m) => m.stop());
    motions.current = [];
    const settle = pending.current;
    pending.current = null;
    settle?.(false);
    if (stretchRef.current) stretchRef.current.style.transform = "";
  }, []);

  const layerSize = useCallback(() => {
    const r = rootRef.current?.getBoundingClientRect();
    return { w: r?.width ?? 0, h: r?.height ?? 0, left: r?.left ?? 0, top: r?.top ?? 0 };
  }, []);

  const measure = useCallback(
    (target: PointerTarget): { rect: PointerRect; radius: number; element: Element | null } => {
      if (!(target instanceof Element)) return { rect: target, radius: 10, element: null };
      const layer = layerSize();
      const r = target.getBoundingClientRect();
      const radius = parseFloat(getComputedStyle(target).borderTopLeftRadius) || 0;
      return {
        rect: { x: r.left - layer.left, y: r.top - layer.top, width: r.width, height: r.height },
        radius,
        element: target,
      };
    },
    [layerSize],
  );

  /** Shared flight. Resolves true on landing at (dx, dy). */
  const fly = useCallback(
    (dx: number, dy: number, from: { x: number; y: number } | undefined, duration: number | undefined) =>
      new Promise<boolean>((resolve) => {
        stopMotion();
        const id = ++flight.current;
        pending.current = resolve;

        if (!visible.current) {
          const layer = layerSize();
          const start = from ?? { x: layer.w / 2, y: 0 };
          x.set(start.x);
          y.set(start.y);
        }
        const wasVisible = visible.current;
        visible.current = true;

        if (reducedRef.current) {
          x.set(dx);
          y.set(dy);
          rot.set(0);
          opacity.set(0);
          const t = window.setTimeout(() => {
            if (flight.current !== id) return;
            pending.current = null;
            resolve(true);
          }, 160);
          motions.current = [{ stop: () => window.clearTimeout(t) } as AnimationPlaybackControls];
          return;
        }

        const fromX = x.get();
        const fromY = y.get();
        const dist = Math.hypot(dx - fromX, dy - fromY);
        const ms = duration ?? clamp(380 + dist * 0.3, 380, 720);
        // The arc always bows upward: when going down, x leads and y lags; when going up, y leads.
        const xLeads = dy - fromY > 0;
        const list: AnimationPlaybackControls[] = [
          animate(x, dx, { duration: ms / 1000, ease: xLeads ? [...LEAD_EASE] : [...LAG_EASE] }),
          animate(y, dy, { duration: ms / 1000, ease: xLeads ? [...LAG_EASE] : [...LEAD_EASE] }),
          animate(opacity, 1, { duration: wasVisible ? 0.1 : 0.14, ease: [...LEAD_EASE] }),
          animate(rot, 0, { duration: 0.2, ease: [...LEAD_EASE] }),
        ];
        motions.current = list;
        Promise.all([list[0].finished, list[1].finished]).then(() => {
          if (flight.current !== id) return;
          pending.current = null;
          if (stretchRef.current) stretchRef.current.style.transform = "";
          resolve(true);
        });
      }),
    [layerSize, opacity, rot, stopMotion, x, y],
  );

  const resetMarks = useCallback(() => {
    setRing(null);
    setParked(null);
    setLens(null);
  }, []);

  const land = useCallback(
    (rect: PointerRect, radius: number, options: FlyOptions | undefined, showRing: boolean) => {
      if (!showRing) return;
      const isLarge = largeRef.current;
      const out = ringOutset(isLarge);
      const layer = layerSize();
      const box = { x: rect.x - out, y: rect.y - out, width: rect.width + out * 2, height: rect.height + out * 2 };
      if (!reducedRef.current) animate(opacity, 0, { duration: 0.12, ease: [...LEAD_EASE] });
      const label = options?.label?.trim();
      const stepText = options?.step
        ? copy.pointer.count.replace("{n}", String(options.step[0])).replace("{total}", String(options.step[1]))
        : undefined;
      let side: "end" | "start" | "below" | "above" = options?.labelSide ?? "end";
      if (label && !options?.labelSide) {
        const est = Math.min(24, label.length) * 7.4 + 24 + (stepText ? stepText.length * 7.2 + 18 : 0);
        if (box.x + box.width + 12 + est > layer.w) side = box.x - 12 - est >= 0 ? "start" : "below";
      }
      // Committed synchronously so bounds() is right as soon as the flight promise resolves.
      flushSync(() =>
        setRing({
          key: ++keySeed.current,
          box,
          radius: radius + out,
          label: label ? { text: label, stepText, side } : undefined,
        }),
      );
    },
    [layerSize, opacity],
  );

  const flyTo = useCallback(
    async (target: PointerTarget, options?: FlyOptions) => {
      resetMarks();
      const { rect, radius } = measure(target);
      const landed = await fly(rect.x + rect.width / 2, rect.y + rect.height / 2, options?.from, options?.duration);
      if (landed) land(rect, radius, options, options?.ring !== false);
      return landed;
    },
    [fly, land, measure, resetMarks],
  );

  const callout = useCallback(
    async (target: PointerTarget, options?: Omit<FlyOptions, "ring">) => {
      const landed = await flyTo(target, { ...options, ring: true });
      if (!landed) return false;
      const { rect, element } = measure(target);
      const layer = layerSize();
      const cx0 = rect.x + rect.width / 2;
      const cy0 = rect.y + rect.height / 2;
      const gap = 64;
      const sx = cx0 + gap + 28 > layer.w ? -1 : 1;
      const sy = cy0 - gap - 28 < 0 ? 1 : -1;
      const lx = cx0 + sx * gap;
      const ly = cy0 + sy * gap;
      const reach = Math.max(rect.width, rect.height) / 2 + ringOutset(largeRef.current) + 4;
      const angle = (Math.atan2(ly - cy0, lx - cx0) * 180) / Math.PI;
      const length = Math.hypot(lx - cx0, ly - cy0) - 30 - reach;
      const sxp = cx0 + Math.cos((angle * Math.PI) / 180) * reach;
      const syp = cy0 + Math.sin((angle * Math.PI) / 180) * reach;
      setLens({
        key: ++keySeed.current,
        x: lx,
        y: ly,
        stem: { x: sxp, y: syp, length: Math.max(length, 6), angle },
        source: element,
        scale: 44 / Math.max(rect.width, rect.height, 8),
      });
      return true;
    },
    [flyTo, layerSize, measure],
  );

  const park = useCallback(
    async (edge: PointerEdge, text?: string) => {
      resetMarks();
      const layer = layerSize();
      const inset = 14;
      const cur = visible.current ? { x: x.get(), y: y.get() } : { x: layer.w / 2, y: layer.h / 2 };
      const px = edge === "left" ? inset : edge === "right" ? layer.w - inset : clamp(cur.x, 96, layer.w - 96);
      const py = edge === "top" ? inset : edge === "bottom" ? layer.h - inset : clamp(cur.y, 40, layer.h - 40);
      const landed = await fly(px, py, undefined, undefined);
      if (!landed) return false;
      if (!reducedRef.current) animate(rot, EDGE_ANGLE[edge], { duration: 0.2, ease: [...LEAD_EASE] });
      else rot.set(EDGE_ANGLE[edge]);
      opacity.set(1);
      const fallback =
        edge === "top"
          ? copy.pointer.edge_parking.scroll_up
          : edge === "bottom"
            ? copy.pointer.edge_parking.scroll_down
            : edge === "left"
              ? copy.pointer.edge_parking.scroll_left
              : copy.pointer.edge_parking.scroll_right;
      setParked({ key: ++keySeed.current, edge, text: text ?? fallback, x: px, y: py });
      return true;
    },
    [fly, layerSize, opacity, resetMarks, rot, x, y],
  );

  const clear = useCallback(() => {
    stopMotion();
    flight.current += 1;
    resetMarks();
    visible.current = false;
    animate(opacity, 0, { duration: 0.12, ease: [...LEAD_EASE] });
  }, [opacity, resetMarks, stopMotion]);

  const bounds = useCallback((): PointerRect | null => {
    const root = rootRef.current;
    if (!root) return null;
    const layer = root.getBoundingClientRect();
    const marks = Array.from(root.querySelectorAll("[data-pointer-mark]")).map((n) => n.getBoundingClientRect());
    if (marks.length === 0) return null;
    const left = Math.min(...marks.map((r) => r.left));
    const top = Math.min(...marks.map((r) => r.top));
    const right = Math.max(...marks.map((r) => r.right));
    const bottom = Math.max(...marks.map((r) => r.bottom));
    return { x: left - layer.left, y: top - layer.top, width: right - left, height: bottom - top };
  }, []);

  useImperativeHandle(
    ref,
    () => ({ flyTo, park, callout, clear, setLarge: (v: boolean) => setLargeState(v), bounds }),
    [bounds, callout, clear, flyTo, park],
  );

  useEffect(() => () => stopMotion(), [stopMotion]);

  return (
    <div
      ref={rootRef}
      aria-hidden
      className={cx("pointer-events-none absolute inset-0 z-30 overflow-hidden", className)}
    >
      <AnimatePresence>{ring ? <RingMark key={ring.key} ring={ring} large={large} reduced={reduced} /> : null}</AnimatePresence>
      <AnimatePresence>{lens ? <LensMark key={lens.key} lens={lens} reduced={reduced} /> : null}</AnimatePresence>

      <AnimatePresence>
        {parked ? (
          <motion.div
            key={parked.key}
            className="absolute left-0 top-0"
            style={{ x: parked.x, y: parked.y }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: reduced ? 0.16 : 0.2, ease: LEAD_EASE } }}
            exit={{ opacity: 0, transition: { duration: 0.12 } }}
          >
            <PointerLabel
              text={parked.text}
              className={cx(
                "absolute",
                parked.edge === "top" && "top-6 left-0 -translate-x-1/2",
                parked.edge === "bottom" && "bottom-6 left-0 -translate-x-1/2",
                parked.edge === "left" && "left-7 top-0 -translate-y-1/2",
                parked.edge === "right" && "right-7 top-0 -translate-y-1/2",
              )}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <motion.div className="absolute left-0 top-0" style={{ x, y, opacity }}>
        <motion.div style={{ rotate: rot, transformOrigin: "0 0" }}>
          <div ref={stretchRef} style={{ transformOrigin: "0 0" }}>
            <PointerGlyph large={large} />
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
