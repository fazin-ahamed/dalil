import type { ComponentPropsWithoutRef } from "react";
import { cx } from "@/utils/cx";

/**
 * Night glass surface that hangs from the top edge. Everything inside flips to the dark semantic
 * tokens (the `.dark` class), so BoardUI components need no dark: classes. Flat top, rounded bottom.
 * Use `size="rest"` for the 16px resting radius, default 28px.
 */
export function NotchPanel({
  className,
  size = "open",
  ...props
}: ComponentPropsWithoutRef<"div"> & { size?: "rest" | "open" }) {
  return (
    <div
      {...props}
      className={cx(
        "dark relative w-full max-w-140 bg-notch font-sans text-notch-ink shadow-notch",
        size === "rest" ? "rounded-b-2xl" : "rounded-b-[28px]",
        className,
      )}
    />
  );
}
