"use client";

import type { CSSProperties, ReactNode } from "react";
import { cx } from "@/utils/cx";
import { Reveal, useBlockState, type Block } from "./draw";
import { ROUGH, ROUGH_BLOB } from "./rough-filters";

/** Hand-ink building blocks shared by every card type. All edges are roughened, text stays crisp. */

type Tone = "blue" | "grey";

/** Marker box: 2px blue stroke, pale blue fill, 6px radius, 44px square minimum. */
export function MarkerBox({
  block,
  sub = 0,
  tone = "blue",
  className,
  children,
}: {
  block: Block;
  sub?: number;
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Reveal block={block} sub={sub} className={cx("relative grid min-h-11 min-w-11 place-items-center", className)}>
      <span
        aria-hidden
        className={cx(
          "absolute inset-0 rounded-[6px] border-2",
          ROUGH,
          tone === "blue" ? "border-accent-600 bg-box-fill" : "border-muted bg-paper-3",
        )}
      />
      <span className="relative font-ink text-[26px] leading-8 font-bold tracking-[-0.03em] text-ink">{children}</span>
    </Reveal>
  );
}

/**
 * Highlighter swipe behind a line of text: one blob, 2 to 3 degrees of tilt, 6px of bleed, revealed
 * with a transform scaleX from the inline start while the text wipes in over it.
 * Blue is the working, lilac is the answer. Never both on one line.
 */
export function Highlight({
  block,
  sub = 0,
  tone = "blue",
  tilt = -2,
  className,
  children,
}: {
  block: Block;
  sub?: number;
  tone?: "blue" | "lilac";
  tilt?: number;
  className?: string;
  children: ReactNode;
}) {
  const { shown, vars } = useBlockState(block, sub);
  return (
    <span className={cx("relative inline-block", className)}>
      <span
        aria-hidden
        className={cx(
          "absolute -inset-x-1.5 -inset-y-0.5 origin-left rounded-[12px]",
          ROUGH_BLOB,
          tone === "lilac" ? "bg-hl-lilac" : "bg-hl-blue",
          shown
            ? [
                "opacity-100 [transform:rotate(var(--tilt))_scaleX(1)]",
                "transition-[opacity,transform] duration-(--dur) delay-(--delay) ease-dalil-out",
                "motion-reduce:duration-160 motion-reduce:delay-0",
              ]
            : "opacity-0 transition-none [transform:rotate(var(--tilt))_scaleX(0.05)]",
          "motion-reduce:[transform:rotate(var(--tilt))_scaleX(1)]",
        )}
        style={{ ...vars, "--tilt": `${tilt}deg` } as CSSProperties}
      />
      <Reveal block={block} sub={sub} as="span" className="relative inline-block">
        {children}
      </Reveal>
    </span>
  );
}

/** A plain handwritten line, wiped in at reading speed. */
export function Line({
  block,
  className,
  children,
}: {
  block: Block;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Reveal block={block} className={className}>
      {children}
    </Reveal>
  );
}

/** Wobbly hand-drawn arrow, `length` px long and 12px tall so the stroke never scales. `dir` is the direction it points. */
export function HandArrow({
  dir = "end",
  length = 22,
  className,
}: {
  dir?: "start" | "end" | "down" | "up";
  length?: number;
  className?: string;
}) {
  const rotate = dir === "down" ? "rotate-90" : dir === "up" ? "-rotate-90" : dir === "start" ? "rotate-180" : "";
  const l = Math.max(length, 14);
  const body = `M1.5 6.4C${(l * 0.3).toFixed(1)} 5.4 ${(l * 0.66).toFixed(1)} 7 ${(l - 2).toFixed(1)} 6.1`;
  const head = `M${(l - 7).toFixed(1)} 1.8C${(l - 5.4).toFixed(1)} 3.4 ${(l - 3.8).toFixed(1)} 4.9 ${(l - 1.6).toFixed(1)} 6.1C${(l - 3.6).toFixed(1)} 7.4 ${(l - 5.4).toFixed(1)} 8.9 ${(l - 7.2).toFixed(1)} 10.4`;
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${l} 12`}
      width={l}
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx("shrink-0", ROUGH, rotate, className)}
    >
      <path d={body} />
      <path d={head} />
    </svg>
  );
}

/** Looping margin arrow that points out of the card toward the thing on screen. */
export function MarginArrow({ pointer = "start", className }: { pointer?: "start" | "end"; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 44 28"
      width="44"
      height="28"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx("shrink-0", ROUGH, pointer === "end" && "-scale-x-100", className)}
    >
      <path d="M41 22.4C27 24.6 14.4 18.6 8.4 8.6" />
      <path d="M8.2 16.4C8.4 13 8.2 10.6 8 8.2C10.6 9 13 10.4 15 12.4" />
    </svg>
  );
}

/**
 * Hand-drawn checkbox. The tick is an ink stroke wiped in with clip-path (a tick is a path, so it
 * is revealed along its direction instead of scaled). Reduced motion fades it.
 */
export function CheckBox({ ticked, className }: { ticked: boolean; className?: string }) {
  return (
    <span className={cx("relative grid size-11 shrink-0 place-items-center", className)} aria-hidden>
      <span className={cx("absolute inset-2 rounded-[6px] border-2 border-accent-600 bg-paper-2", ROUGH)} />
      <svg
        viewBox="0 0 28 28"
        width="28"
        height="28"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cx(
          "relative text-ink [filter:url(#dalil-rough)]",
          ticked
            ? "opacity-100 [clip-path:inset(-4px)] transition-[opacity,clip-path] duration-240 ease-dalil-out"
            : "opacity-0 [clip-path:inset(-4px_100%_-4px_-4px)] transition-none",
          "motion-reduce:[clip-path:inset(-4px)] motion-reduce:duration-160",
        )}
      >
        <path d="M5.5 15.2C8.2 17.6 10 19.8 11.6 22.6C15.4 14.4 19.8 9 25.2 4.6" />
      </svg>
    </span>
  );
}

/** Long blue arrow drawn under a row, pointing at the inline start ("read upwards"). */
export function LongArrow({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 352 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cx("block h-3 w-full", ROUGH, className)}
    >
      <path d="M349.5 6.6C250 5.4 120 7.4 6.5 6" />
      <path d="M12.5 1.6C10 3.4 8 4.8 5.8 6C8 7.4 10 8.8 12.5 10.6" />
    </svg>
  );
}
