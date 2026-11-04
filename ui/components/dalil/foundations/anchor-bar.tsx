"use client";

import { useEffect, useState } from "react";
import { cx } from "@/utils/cx";

export interface AnchorItem {
  id: string;
  label: string;
}

/**
 * Sticky bar under the site nav that jumps between sections. The current section is marked with
 * aria-current as it scrolls into view. Scrolls horizontally on narrow screens.
 */
export function AnchorBar({ items }: { items: AnchorItem[] }) {
  const [current, setCurrent] = useState(items[0]?.id ?? "");

  useEffect(() => {
    const els = items.map((i) => document.getElementById(i.id)).filter((e): e is HTMLElement => e !== null);
    if (els.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setCurrent(visible[0].target.id);
      },
      { rootMargin: "-120px 0px -60% 0px", threshold: 0 },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [items]);

  return (
    <nav
      aria-label="Foundations sections"
      className="sticky top-15 z-30 -mx-6 border-b border-separator-border bg-background-full/90 px-6 backdrop-blur-xl md:-mx-12 md:px-12"
    >
      <ul className="flex gap-1 overflow-x-auto [scrollbar-width:none]">
        {items.map((i) => (
          <li key={i.id} className="shrink-0">
            <a
              href={`#${i.id}`}
              aria-current={current === i.id ? "location" : undefined}
              className={cx(
                "flex min-h-11 items-center rounded-xl px-3 text-body-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-border-focus-ring",
                current === i.id
                  ? "bg-background-secondary-default text-text-primary"
                  : "text-text-secondary hover:bg-background-primary-hover hover:text-text-primary",
              )}
            >
              {i.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
