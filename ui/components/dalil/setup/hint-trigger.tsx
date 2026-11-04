"use client";

import { createContext, useContext, type ComponentProps } from "react";
import { Focusable } from "react-aria-components";
import type { Placement } from "react-aria";
import { Tooltip, TooltipTrigger } from "@/components/base/tooltip/tooltip";

/** The static states gallery turns tooltips off: its panels are inert pictures. */
export const TooltipsEnabled = createContext(true);

/** A BoardUI tooltip, dark inside the notch, around one focusable control. */
export function HintTrigger({ label, placement, children }: { label: string; placement?: Placement; children: ComponentProps<typeof Focusable>["children"] }) {
  const enabled = useContext(TooltipsEnabled);
  if (!enabled) return children;
  return (
    <TooltipTrigger delay={500}>
      <Focusable>{children}</Focusable>
      <Tooltip className="dark" offset={8} placement={placement}>
        {label}
      </Tooltip>
    </TooltipTrigger>
  );
}
