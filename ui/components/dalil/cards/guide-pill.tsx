"use client";

import { RiChat1Line } from "@remixicon/react";
import type { ButtonHTMLAttributes } from "react";
import { Button } from "@/components/base/buttons/button";
import { cx } from "@/utils/cx";

/** Forced looks for the design-system specimens. Real use never passes `state`. */
const FORCED = {
  hover: "bg-accent-50 border-accent-700 text-accent-700",
  pressed: "bg-accent-100 border-accent-700 text-accent-700",
  focus: "ring-2 ring-offset-2 ring-border-focus-ring",
} as const;

export interface GuidePillProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** Under 32 characters. Longer labels are cut at 31. */
  label: string;
  state?: keyof typeof FORCED;
}

/**
 * Follow-up pill: outlined blue, 36px tall with a 44px hit area, bubble icon. Built on the BoardUI
 * secondary Button, only restyled. It is the one part of a card that takes pointer input.
 */
export function GuidePill({ label, state, className, ...props }: GuidePillProps) {
  return (
    <Button
      variant="secondary"
      size="medium"
      leadingIcon={RiChat1Line}
      {...props}
      className={cx(
        "pointer-events-auto relative overflow-visible rounded-full border-accent-600 bg-transparent px-3 text-accent-600 shadow-none",
        "hover:border-accent-700 hover:bg-accent-50 hover:text-accent-700 active:bg-accent-100",
        "after:absolute after:-inset-y-1 after:inset-x-0 after:content-['']",
        "disabled:border-border-button-default disabled:bg-transparent disabled:text-text-tertiary disabled:hover:bg-transparent disabled:hover:text-text-tertiary",
        state && FORCED[state],
        className,
      )}
    >
      <span className="max-w-64 truncate">{label.length > 31 ? label.slice(0, 31) : label}</span>
    </Button>
  );
}
