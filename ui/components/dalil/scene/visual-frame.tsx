"use client";

import type { ReactNode } from "react";
import { RiCloseLine } from "@remixicon/react";
import { cx } from "@/utils/cx";

/** The red window button: a plain dot that shows its cross on hover or focus, like a Mac window. */
export function CloseDot({ label, onClose, className }: { label: string; onClose: () => void; className?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClose}
      className={cx(
        "group/close pointer-events-auto relative grid size-3.5 shrink-0 place-items-center rounded-full bg-mark-error outline-none before:absolute before:-inset-1.5 before:content-[''] focus-visible:ring-2 focus-visible:ring-border-focus-ring focus-visible:ring-offset-1 focus-visible:ring-offset-paper",
        className,
      )}
    >
      <RiCloseLine
        aria-hidden
        className="size-2.5 text-text-white opacity-0 transition-opacity duration-120 group-hover/close:opacity-100 group-focus-visible/close:opacity-100"
      />
    </button>
  );
}

/** A window for what Dalil draws: the red dot at the top left closes it, the title sits in the middle. */
export function VisualFrame({
  title,
  onClose,
  children,
  className,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      className={cx("pointer-events-auto overflow-hidden rounded-2xl border border-rule-strong bg-paper shadow-card", className)}
    >
      <header className="relative flex h-9 items-center border-b border-rule bg-paper-2 px-3.5">
        <CloseDot label={`Close ${title}`} onClose={onClose} />
        <span className="pointer-events-none absolute inset-x-12 truncate text-center text-caption-1-medium text-text-secondary">
          {title}
        </span>
      </header>
      {children}
    </section>
  );
}
