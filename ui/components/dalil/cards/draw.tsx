"use client";

import { createContext, useContext, type CSSProperties, type ElementType, type ReactNode } from "react";
import { cx } from "@/utils/cx";

/**
 * The draw timeline. A card is an ordered list of blocks. `drawn` decides how many are visible:
 * true draws all of them with a stagger, false hides all, a number n shows the first n (each
 * revealed on its own, for a caller that sequences blocks against speech).
 * Reveals are CSS transitions, so they retarget from where they are when `drawn` changes.
 */
export type Drawn = boolean | number;

/** Gap between boxes that share a block. */
export const STEP_MS = 40;

export interface Block {
  index: number;
  /** Start offset on the full timeline, in ms. */
  at: number;
  /** Wipe duration, in ms. */
  dur: number;
  /** Items that stagger inside this block. */
  items: number;
  /** When the block is fully drawn, relative to its own start. */
  extent: number;
}

export type Timeline = ReturnType<typeof createTimeline>;

const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

export function createTimeline() {
  const blocks: Block[] = [];
  let cursor = 0;

  function add(dur: number, lead: number, items = 1): Block {
    const block: Block = {
      index: blocks.length,
      at: cursor,
      dur,
      items,
      extent: dur + (items - 1) * STEP_MS,
    };
    blocks.push(block);
    cursor += lead;
    return block;
  }

  return {
    blocks,
    /** Handwritten heading. */
    heading: () => add(380, 240),
    /** A text line; the wipe runs at reading speed. */
    text(chars: number) {
      const dur = clamp(chars * 24, 260, 620);
      return add(dur, dur * 0.7 + 60);
    },
    /** A row of boxes or values that stagger by 40ms. */
    row: (items: number) => add(300, (items - 1) * STEP_MS + 160, items),
    /** The follow-up pill. */
    pill: () => add(260, 0),
    get count() {
      return blocks.length;
    },
    get end() {
      return blocks.reduce((m, b) => Math.max(m, b.at + b.extent), 0);
    },
  };
}

const DrawContext = createContext<Drawn>(true);
export const DrawProvider = DrawContext.Provider;

export function isShown(drawn: Drawn, index: number) {
  return drawn === true || (typeof drawn === "number" && index < drawn);
}

export function useBlockState(block: Block, sub = 0) {
  const drawn = useContext(DrawContext);
  const shown = isShown(drawn, block.index);
  const delay = drawn === true ? block.at + sub * STEP_MS : 0;
  const vars = {
    "--durs": `140ms, 240ms, ${block.dur}ms`,
    "--delays": `${delay}ms, ${delay}ms, ${delay}ms`,
    "--dur": `${block.dur}ms`,
    "--delay": `${delay}ms`,
  } as CSSProperties;
  return { shown, vars };
}

/**
 * One drawn block: a clip-path wipe from the inline start, an opacity fade and a 2px settle.
 * Reduced motion drops the wipe and the settle and keeps the fade.
 */
export function Reveal({
  block,
  sub = 0,
  as: Tag = "div",
  className,
  style,
  children,
}: {
  block: Block;
  sub?: number;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const { shown, vars } = useBlockState(block, sub);
  return (
    <Tag
      className={cx(
        "motion-reduce:[clip-path:inset(-12px)] motion-reduce:translate-y-0",
        shown
          ? [
              "translate-y-0 opacity-100 [clip-path:inset(-12px)]",
              "transition-[opacity,translate,clip-path] duration-(--durs) delay-(--delays) ease-dalil-out",
              "motion-reduce:duration-160 motion-reduce:delay-0",
            ]
          : "translate-y-0.5 opacity-0 [clip-path:inset(-12px_100%_-12px_-12px)] transition-none",
        className,
      )}
      style={{ ...vars, ...style }}
    >
      {children}
    </Tag>
  );
}
