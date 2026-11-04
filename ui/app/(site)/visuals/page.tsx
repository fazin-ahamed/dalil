"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { RiRefreshLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { SegmentedControl, SegmentedControlItem } from "@/components/base/segmented-control/segmented-control";
import { RoughFilters } from "@/components/dalil/cards/rough-filters";
import { DiagramView } from "@/components/dalil/scene/diagram-view";
import type { DiagramScene } from "@/lib/contracts";
import { EXAMPLE_DIAGRAM } from "@/lib/scene";

/** A process flow: four boxes in a row, each arrow drawn right after the box it points at. */
const FLOW: DiagramScene = {
  type: "diagram",
  title: "How Dalil explains a step",
  items: [
    { id: "look", kind: "box", x: 13, y: 46, w: 17, h: 26, text: "Read the screen", tone: "blue", caption: "Step 1" },
    { id: "pick", kind: "box", x: 37, y: 46, w: 17, h: 26, text: "Find the control", tone: "rose", caption: "Step 2" },
    { id: "a1", kind: "arrow", from: "look", to: "pick" },
    { id: "point", kind: "box", x: 61, y: 46, w: 17, h: 26, text: "Point at it", tone: "mint", caption: "Step 3" },
    { id: "a2", kind: "arrow", from: "pick", to: "point" },
    { id: "say", kind: "box", x: 85, y: 46, w: 17, h: 26, text: "Explain why", tone: "sand", caption: "Step 4" },
    { id: "a3", kind: "arrow", from: "point", to: "say" },
  ],
  footnote: "Each box waits for the one before it.",
};

/** A comparison: two columns of two boxes, with the key check marked in sand. */
const COMPARE: DiagramScene = {
  type: "diagram",
  title: "Guess, then check",
  items: [
    { id: "gh", kind: "text", x: 26, y: 16, text: "Guess", size: "title" },
    { id: "g1", kind: "box", x: 26, y: 40, w: 36, h: 20, text: "Try a value", tone: "rose" },
    { id: "g2", kind: "box", x: 26, y: 76, w: 36, h: 20, text: "Keep the guess", tone: "rose" },
    { id: "ga", kind: "arrow", from: "g1", to: "g2" },
    { id: "ch", kind: "text", x: 74, y: 16, text: "Check", size: "title" },
    { id: "c1", kind: "box", x: 74, y: 40, w: 36, h: 20, text: "Count the steps", tone: "mint" },
    { id: "c2", kind: "box", x: 74, y: 76, w: 36, h: 20, text: "Compare to the target", tone: "mint" },
    { id: "ca", kind: "arrow", from: "c1", to: "c2", label: "then" },
    { id: "key", kind: "highlight", target: "c2" },
  ],
  footnote: "Same steps, two different questions.",
};

type Speed = "slow" | "normal" | "fast";
/** Gap between items, in milliseconds, when the page sets `revealed` itself. */
const STEP_MS: Record<Speed, number> = { slow: 900, normal: 450, fast: 180 };

/** The live note: the page steps `revealed` on a timer, so Replay and speed act on the draw directly. */
function LiveNote({ scene }: { scene: DiagramScene }) {
  const total = scene.items.length;
  const [revealed, setRevealed] = useState(0);
  const [speed, setSpeed] = useState<Speed>("normal");

  useEffect(() => {
    if (revealed >= total) return;
    const id = window.setTimeout(() => setRevealed((n) => n + 1), revealed === 0 ? 200 : STEP_MS[speed]);
    return () => window.clearTimeout(id);
  }, [revealed, speed, total]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="secondary" size="small" leadingIcon={RiRefreshLine} onClick={() => setRevealed(0)}>
          Replay
        </Button>
        <SegmentedControl
          aria-label="Drawing speed"
          selectedKeys={[speed]}
          onSelectionChange={(keys) => {
            const next = [...keys][0];
            if (next === "slow" || next === "normal" || next === "fast") setSpeed(next);
          }}
        >
          <SegmentedControlItem id="slow">Slow</SegmentedControlItem>
          <SegmentedControlItem id="normal">Normal</SegmentedControlItem>
          <SegmentedControlItem id="fast">Fast</SegmentedControlItem>
        </SegmentedControl>
      </div>
      <DiagramView scene={scene} revealed={revealed} />
    </div>
  );
}

/** True once the element has been on screen, so a sample draws when the reader reaches it. */
function useSeen(ref: RefObject<HTMLDivElement | null>) {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setSeen(true);
        observer.disconnect();
      },
      { threshold: 0.3 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, seen]);
  return seen;
}

/** A sample note that plays on its own once it is on screen. Replay remounts it to draw again. */
function SampleNote({ scene, name, note }: { scene: DiagramScene; name: string; note: string }) {
  const [run, setRun] = useState(0);
  const frame = useRef<HTMLDivElement>(null);
  const seen = useSeen(frame);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <span className="flex min-w-0 flex-col">
          <span className="text-body-medium text-text-primary">{name}</span>
          <span className="text-body-2-regular text-text-tertiary">{note}</span>
        </span>
        <Button
          variant="secondary"
          size="small"
          leadingIcon={RiRefreshLine}
          onClick={() => setRun((r) => r + 1)}
          className="shrink-0"
        >
          Replay
        </Button>
      </div>
      <div ref={frame}>
        <DiagramView key={run} scene={scene} revealed={seen ? undefined : 0} />
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <main className="mx-auto flex w-full max-w-300 flex-1 flex-col gap-14 px-4 pt-12 pb-24 md:px-12">
      <RoughFilters />
      <header className="flex max-w-2xl flex-col gap-2">
        <h1 className="text-title-1-medium text-text-primary">Visuals</h1>
        <p className="text-body-regular text-text-secondary">
          Dalil draws a note on grid paper while it explains. Boxes outline first, then fill in, and arrows and
          highlights follow, one item at a time.
        </p>
      </header>

      <section aria-labelledby="live-note" className="flex flex-col gap-6">
        <header className="flex max-w-2xl flex-col gap-1">
          <h2 id="live-note" className="text-title-3-semibold text-text-primary">
            Live note
          </h2>
          <p className="text-body-regular text-text-secondary">
            The example from the tutor. Replay draws it again, and speed sets the pace.
          </p>
        </header>
        <LiveNote scene={EXAMPLE_DIAGRAM} />
      </section>

      <section aria-labelledby="more-notes" className="flex flex-col gap-6">
        <header className="flex max-w-2xl flex-col gap-1">
          <h2 id="more-notes" className="text-title-3-semibold text-text-primary">
            More notes
          </h2>
          <p className="text-body-regular text-text-secondary">
            A process flow and a comparison. Each draws when it scrolls into view.
          </p>
        </header>
        <div className="grid grid-cols-1 items-start gap-x-8 gap-y-10 lg:grid-cols-2">
          <SampleNote scene={FLOW} name="Process flow" note="Four steps in order, joined by arrows." />
          <SampleNote scene={COMPARE} name="Comparison" note="Two columns, with the key check marked in sand." />
        </div>
      </section>
    </main>
  );
}
