import type { ReactNode } from "react";
import { cx } from "@/utils/cx";

/**
 * A strip of grid paper laid along the top of a column. A NotchPanel hangs from its lower edge,
 * so the black shape reads as attached to the desk, the way the real notch hangs from the screen.
 */
export function DeskStrip({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-label={label} className={cx("flex min-w-0 flex-col items-center", className)}>
      <div
        className={cx(
          "relative flex h-9 w-full items-center justify-center rounded-t-card border border-b-0 border-rule bg-paper-2 shadow-card",
          "bg-[linear-gradient(var(--color-rule)_1px,transparent_1px),linear-gradient(90deg,var(--color-rule)_1px,transparent_1px)] bg-size-[24px_24px] bg-position-[-1px_-1px]",
        )}
      >
        <span className="rounded-sm bg-paper-2 px-2 text-body-2-medium text-muted">{label}</span>
      </div>
      <div className="w-full max-w-140">{children}</div>
    </section>
  );
}
