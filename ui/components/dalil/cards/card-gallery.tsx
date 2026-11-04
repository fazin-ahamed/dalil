"use client";

import { RiRefreshLine } from "@remixicon/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/base/badges/badge";
import { Button } from "@/components/base/buttons/button";
import copy from "@/lib/copy.json";
import { GuideCard } from "./guide-card";
import type { GuideCardHandle, GuideCardType } from "./types";

const TYPES: { type: GuideCardType; name: string; note: string }[] = [
  { type: "steps", name: "Steps", note: "Boxes fill in order, then the working and the answer." },
  { type: "convert", name: "Convert", note: "A rail of values with the result read upwards." },
  { type: "checklist", name: "Checklist", note: "Ticks itself as each step is verified." },
  { type: "explain", name: "Explain", note: "A short paragraph and one margin arrow." },
];

function Replayable({ type, name, note }: (typeof TYPES)[number]) {
  const [drawn, setDrawn] = useState(true);
  const card = useRef<GuideCardHandle>(null);
  const timers = useRef<number[]>([]);

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };

  const tickThrough = useCallback(() => {
    if (type !== "checklist") return;
    clearTimers();
    [0, 1, 2].forEach((i) => {
      timers.current.push(window.setTimeout(() => card.current?.tick(i), 500 + i * 900));
    });
  }, [type]);

  useEffect(() => {
    if (type === "checklist") card.current?.tick(0);
    return clearTimers;
  }, [type]);

  const replay = () => {
    clearTimers();
    card.current?.reset();
    setDrawn(false);
    timers.current.push(window.setTimeout(() => setDrawn(true), 90));
  };

  return (
    <figure className="flex min-w-0 flex-col gap-3">
      <figcaption className="flex min-h-11 items-center justify-between gap-3">
        <span className="flex min-w-0 flex-col">
          <span className="flex items-center gap-2">
            <span className="text-body-medium text-text-primary">{name}</span>
            <Badge>{copy.cards.sample_tag}</Badge>
          </span>
          <span className="text-body-2-regular text-text-tertiary">{note}</span>
        </span>
        <Button variant="secondary" size="small" leadingIcon={RiRefreshLine} onClick={replay} className="shrink-0">
          Replay
        </Button>
      </figcaption>
      <div className="flex justify-center rounded-card border border-rule bg-paper p-3 sm:p-6 lg:justify-start">
        <GuideCard ref={card} type={type} drawn={drawn} onDrawn={tickThrough} />
      </div>
    </figure>
  );
}

export function CardGallery() {
  return (
    <div className="grid grid-cols-1 items-start gap-x-8 gap-y-10 lg:grid-cols-2">
      {TYPES.map((t) => (
        <Replayable key={t.type} {...t} />
      ))}
    </div>
  );
}
