import type { CSSProperties } from "react";

/** Faint blue grid on paper: 24px cells, 1px rules from the rule token. Hairlines, not a gradient. */
export const GRID_PAPER: CSSProperties = {
  backgroundImage:
    "linear-gradient(to right, var(--color-rule) 1px, transparent 1px), linear-gradient(to bottom, var(--color-rule) 1px, transparent 1px)",
  backgroundSize: "24px 24px",
};
