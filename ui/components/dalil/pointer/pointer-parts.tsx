import type { CSSProperties, ReactNode } from "react";
import { cx } from "@/utils/cx";

/**
 * Static pieces of the pointer kit. PointerLayer animates them; the design-system specimens render
 * them as they are. The tip of PointerGlyph sits on the origin of its parent, so a parent placed at
 * (x, y) puts the tip exactly on (x, y).
 */

const SIZE = { normal: { pointer: 20, ring: 2 }, large: { pointer: 28, ring: 3 } } as const;
export const RING_GAP = 6;

export function pointerMetrics(large: boolean) {
  return large ? SIZE.large : SIZE.normal;
}

/** 20px arrow cursor in signal blue with a 2px white outline and a glow. 28px when `large`. */
export function PointerGlyph({ large = false, className }: { large?: boolean; className?: string }) {
  const s = pointerMetrics(large).pointer / 20;
  return (
    <span aria-hidden className={cx("pointer-events-none absolute left-0 top-0 block", className)}>
      <span
        className="absolute block rounded-full bg-signal shadow-glow-signal"
        style={{ left: 3 * s, top: 6 * s, width: 6 * s, height: 6 * s }}
      />
      <svg
        viewBox="-2.4 -2.4 17.4 22.8"
        width={17.4 * s}
        height={22.8 * s}
        className="absolute block overflow-visible"
        style={{ left: -2.4 * s, top: -2.4 * s }}
      >
        <path
          d="M0 0V16.2L4.1 12.4L6.9 18L9.7 16.7L7 11.2L12.6 11Z"
          fill="var(--color-signal)"
          stroke="var(--color-text-white)"
          strokeWidth="4.8"
          strokeLinejoin="round"
          paintOrder="stroke"
        />
      </svg>
    </span>
  );
}

/**
 * Double keyline: 2px ink inside, 2px white outside, 6px of air around the target. 3px each in
 * large mode. Fills its parent, which should already be the target grown by `ringOutset`.
 */
export function ringOutset(large: boolean) {
  return RING_GAP + pointerMetrics(large).ring;
}

export function RingFrame({
  radius = 10,
  large = false,
  className,
  style,
}: {
  radius?: number;
  large?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  const w = pointerMetrics(large).ring;
  return (
    <span
      aria-hidden
      className={cx("absolute inset-0 block border-solid border-ink", className)}
      style={{
        borderWidth: w,
        borderRadius: radius,
        boxShadow: `0 0 0 ${w}px var(--color-text-white)`,
        ...style,
      }}
    />
  );
}

/** Ink pill beside the ring. 13px Onest, 24 characters at most, optional "2 of 5". */
export function PointerLabel({
  text,
  stepText,
  className,
  style,
  ...rest
}: {
  text: string;
  stepText?: string;
  className?: string;
  style?: CSSProperties;
  "data-pointer-mark"?: boolean;
}) {
  const clipped = text.length > 24 ? text.slice(0, 24) : text;
  return (
    <span
      className={cx(
        "inline-flex h-7 items-center gap-2 rounded-full bg-ink px-3 text-body-2-medium whitespace-nowrap text-paper-2 shadow-notch",
        className,
      )}
      style={style}
      {...rest}
    >
      <span>{clipped}</span>
      {stepText ? <span className="border-s border-muted ps-2 text-rule-strong">{stepText}</span> : null}
    </span>
  );
}

/** Magnifier for targets under 16px: a 56px lens with the same double keyline. */
export function LensFrame({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        "relative block size-14 overflow-hidden rounded-full border-2 border-ink bg-paper-2 shadow-[0_0_0_2px_var(--color-text-white)]",
        className,
      )}
    >
      {children}
    </span>
  );
}
