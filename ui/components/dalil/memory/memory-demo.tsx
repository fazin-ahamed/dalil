"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { NotchPanel } from "@/components/dalil/notch-panel";
import { GRID_PAPER } from "@/components/dalil/setup/grid-paper";
import type { Lesson } from "@/lib/contracts";
import copy from "@/lib/copy.json";
import { MemoryPanel } from "./memory-panel";
import { SAMPLE_LESSONS } from "./memory-samples";

/**
 * The live Memory panel with local state. Forget and forget everything change this page only. Esc or
 * the close control hides the panel, and the button under the frame brings it back.
 */
export function MemoryDemo() {
  const [lessons, setLessons] = useState<Lesson[]>(SAMPLE_LESSONS);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(true);
  const frameRef = useRef<HTMLDivElement>(null);
  const reopenRef = useRef<HTMLButtonElement>(null);
  const reopening = useRef(false);

  /* Closing removes the focused control, so focus moves to the button that brings the panel back.
     Reopening moves focus into the panel, but only after the reopen button was pressed. */
  useEffect(() => {
    if (!open) {
      reopenRef.current?.focus();
    } else if (reopening.current) {
      reopening.current = false;
      frameRef.current?.querySelector<HTMLElement>("section")?.focus();
    }
  }, [open]);

  return (
    <section aria-labelledby="live-heading" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 id="live-heading" className="text-title-2-medium text-text-primary">
          {copy.memory.page.live_heading}
        </h2>
        <p className="max-w-prose text-body-regular text-text-secondary">{copy.memory.page.live_note}</p>
      </div>

      <div ref={frameRef} className="overflow-hidden rounded-2xl border border-separator-border bg-paper-2 px-4 pb-8 sm:px-8" style={GRID_PAPER}>
        {open ? (
          <NotchPanel className="mx-auto">
            <MemoryPanel
              lessons={lessons}
              query={query}
              onQuery={setQuery}
              onForget={(id) => setLessons((prev) => prev.filter((lesson) => lesson.id !== id))}
              onClearAll={() => setLessons([])}
              onClose={() => setOpen(false)}
            />
          </NotchPanel>
        ) : (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-body-regular text-text-secondary">{copy.memory.demo.closed}</p>
            <Button
              ref={reopenRef}
              variant="secondary"
              size="small"
              onClick={() => {
                reopening.current = true;
                setOpen(true);
              }}
            >
              {copy.memory.demo.reopen}
            </Button>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="small"
          onClick={() => {
            setLessons(SAMPLE_LESSONS);
            setQuery("");
          }}
        >
          {copy.memory.demo.restore}
        </Button>
      </div>
    </section>
  );
}
