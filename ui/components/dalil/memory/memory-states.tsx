"use client";

import { NotchPanel } from "@/components/dalil/notch-panel";
import { GRID_PAPER } from "@/components/dalil/setup/grid-paper";
import { ScaledFrame } from "@/components/dalil/setup/scaled-frame";
import { TooltipsEnabled } from "@/components/dalil/setup/hint-trigger";
import type { Lesson } from "@/lib/contracts";
import copy from "@/lib/copy.json";
import { MemoryPanel } from "./memory-panel";
import { SAMPLE_LESSONS } from "./memory-samples";

const NOOP = () => {};

interface StateItem {
  id: string;
  title: string;
  note: string;
  lessons: Lesson[];
  query: string;
}

const ITEMS: StateItem[] = [
  {
    id: "empty",
    title: copy.memory.states.empty.title,
    note: copy.memory.states.empty.note,
    lessons: [],
    query: "",
  },
  {
    id: "no-match",
    title: copy.memory.states.no_match.title,
    note: copy.memory.states.no_match.note,
    lessons: SAMPLE_LESSONS,
    query: copy.memory.states.no_match.query,
  },
  {
    id: "list",
    title: copy.memory.states.list.title,
    note: copy.memory.states.list.note,
    lessons: SAMPLE_LESSONS,
    query: "",
  },
];

/** The three Memory states, drawn by the same panel as the live page and shrunk to about 0.72. Not interactive. */
export function MemoryStates() {
  return (
    <ul className="grid list-none grid-cols-1 gap-x-8 gap-y-10 p-0 md:grid-cols-2">
      {ITEMS.map((item) => (
        <li key={item.id} className="min-w-0">
          <figure className="flex min-w-0 flex-col gap-3">
            <figcaption className="flex flex-col gap-0.5">
              <span className="text-headline-medium text-text-primary">{item.title}</span>
              <span className="text-body-regular text-text-secondary">{item.note}</span>
            </figcaption>
            <div
              aria-hidden
              inert
              className="overflow-hidden rounded-2xl border border-separator-border bg-paper-2 px-4 pb-6"
              style={GRID_PAPER}
            >
              <TooltipsEnabled.Provider value={false}>
                <ScaledFrame>
                  <NotchPanel>
                    <MemoryPanel
                      lessons={item.lessons}
                      query={item.query}
                      onQuery={NOOP}
                      onForget={NOOP}
                      onClearAll={NOOP}
                      onClose={NOOP}
                    />
                  </NotchPanel>
                </ScaledFrame>
              </TooltipsEnabled.Provider>
            </div>
          </figure>
        </li>
      ))}
    </ul>
  );
}
