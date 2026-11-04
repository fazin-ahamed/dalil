"use client";

import { RiCloseLine } from "@remixicon/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { Switch } from "@/components/base/switch/switch";
import { GuideCard } from "@/components/dalil/cards/guide-card";
import type { ChecklistData, GuideCardHandle } from "@/components/dalil/cards/types";
import copy from "@/lib/copy.json";
import { placeCard } from "@/lib/placement";
import { PointerLayer, type PointerLayerHandle } from "./pointer-layer";

const STAGE_CARD: ChecklistData = {
  strip: copy.cards.title_strips.checklist,
  heading: copy.cards.samples.checklist.heading,
  subtitle: copy.cards.samples.checklist.subtitle,
  items: copy.cards.samples.checklist.items,
};

const CONTROLS = [
  { label: "Display", pointer: copy.pointer.labels.open, position: "start-[6%] top-[9%]" },
  { label: "Night light", pointer: copy.pointer.labels.choose, position: "start-[60%] top-[26%]" },
  { label: "Turn on", pointer: copy.pointer.labels.turn_on, position: "start-[8%] top-[78%]" },
];

/** A plain stage with three real buttons. Clicking one flies the pointer there; "Show card" also places a card. */
export function FlightStage() {
  const stage = useRef<HTMLDivElement>(null);
  const layer = useRef<PointerLayerHandle>(null);
  const card = useRef<GuideCardHandle>(null);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIndex = useRef(0);
  const [showCard, setShowCard] = useState(true);
  const [drawn, setDrawn] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [width, setWidth] = useState(400);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(Math.min(400, Math.max(300, el.clientWidth - 16))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const go = useCallback(
    async (i: number) => {
      const el = buttons.current[i];
      const stageEl = stage.current;
      if (!el || !stageEl || !layer.current) return;
      activeIndex.current = i;
      setDrawn(false);
      const landed = await layer.current.flyTo(el, { label: CONTROLS[i].pointer, step: [i + 1, CONTROLS.length] });
      if (!landed || !showCard) return;
      const s = stageEl.getBoundingClientRect();
      const t = el.getBoundingClientRect();
      const size = card.current?.element;
      const marks = layer.current.bounds();
      const next = placeCard(
        marks ?? { x: t.left - s.left, y: t.top - s.top, width: t.width, height: t.height },
        { x: 8, y: 8, width: s.width - 16, height: s.height - 16 },
        { width: size?.offsetWidth ?? width, height: size?.offsetHeight ?? 320 },
      );
      setPos({ x: next.x, y: next.y });
      requestAnimationFrame(() => setDrawn(true));
    },
    [showCard, width],
  );

  const clear = () => {
    layer.current?.clear();
    setDrawn(false);
    card.current?.reset();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Switch isSelected={showCard} onChange={setShowCard}>
          Show card
        </Switch>
        <Button variant="secondary" size="small" leadingIcon={RiCloseLine} onClick={clear}>
          Clear
        </Button>
      </div>
      <div
        ref={stage}
        onKeyDown={(e) => {
          if (e.key === "Escape") clear();
        }}
        className="relative h-160 overflow-hidden rounded-card border border-rule bg-paper-2 md:h-130"
      >
        {CONTROLS.map((c, i) => (
          <Button
            key={c.label}
            ref={(n) => {
              buttons.current[i] = n;
            }}
            variant="secondary"
            size="medium"
            className={`absolute ${c.position}`}
            onClick={() => go(i)}
          >
            {c.label}
          </Button>
        ))}
        <div className="absolute start-0 top-0 z-20" style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}>
          <GuideCard
            ref={card}
            type="checklist"
            data={STAGE_CARD}
            drawn={drawn}
            width={width}
            pill={null}
            onDrawn={() => card.current?.tick(activeIndex.current)}
          />
        </div>
        <PointerLayer ref={layer} />
      </div>
    </div>
  );
}
