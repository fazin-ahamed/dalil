import { ROUGH_BLOB } from "@/components/dalil/cards/rough-filters";
import { leaderFor, type Box, type Placement } from "@/lib/overlay-layout";
import { cx } from "@/utils/cx";

/** Highlighter tints, rotating with the mark number. Tokens only. */
const TONES = ["bg-hl-blue", "bg-hl-lilac", "bg-box-fill", "bg-paper-3"] as const;
const DOT = 12;

export interface MarkLabelProps {
  n: number;
  label: string;
  /** Dot centre in px. */
  x: number;
  y: number;
  /** Colour index. The tint rotates with the mark number. */
  tone: number;
  placement: Placement;
  /** Label box in px, as layoutMarks placed it. */
  box: Box;
}

/**
 * One numbered mark: a highlighter label, a thin ink leader and a white dot with an ink ring on the
 * point. Each piece is absolutely placed in px inside its positioned parent. Presentational only;
 * layoutMarks decides where everything goes.
 */
export function MarkLabel({ n, label, x, y, tone, placement, box }: MarkLabelProps) {
  const leader = leaderFor(x, y, box, placement);
  const length = Math.hypot(leader.x2 - leader.x1, leader.y2 - leader.y1);
  const angle = (Math.atan2(leader.y2 - leader.y1, leader.x2 - leader.x1) * 180) / Math.PI;
  return (
    <>
      <span
        aria-hidden
        className="absolute block h-px origin-left bg-ink shadow-[0_0_0_1px_var(--color-text-white)]"
        style={{ left: leader.x1, top: leader.y1 - 0.5, width: length, transform: `rotate(${angle}deg)` }}
      />
      <span
        aria-hidden
        className="absolute block rounded-full border-2 border-ink bg-paper-2"
        style={{ left: x - DOT / 2, top: y - DOT / 2, width: DOT, height: DOT }}
      />
      <span
        className="absolute grid place-items-center whitespace-nowrap"
        style={{ left: box.x, top: box.y, width: box.width, height: box.height }}
      >
        <span aria-hidden className={cx("absolute inset-0 rounded-xl", ROUGH_BLOB, TONES[tone % TONES.length])} />
        <span className="relative font-ink text-[22px] leading-7 tracking-[-0.03em] text-ink">
          {n} · {label}
        </span>
      </span>
    </>
  );
}
