"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { isShown } from "@/components/dalil/cards/draw";
import { ROUGH, ROUGH_BLOB } from "@/components/dalil/cards/rough-filters";
import type { DiagramScene, Tone } from "@/lib/contracts";
import {
  layoutDiagram,
  VIEW_H,
  VIEW_W,
  type ArrowLayout,
  type BoxLayout,
  type HighlightLayout,
  type ItemLayout,
  type PlacedText,
  type Rect,
  type TextLayout,
} from "@/lib/diagram-geometry";
import { cx } from "@/utils/cx";
import { describeDiagram } from "./describe";

/** When the note plays on its own: a pause before the first item, then the gap between items. */
const AUTO_START_MS = 200;
const AUTO_STEP_MS = 450;
/** Time after the last item appears, long enough for its draw-in to finish, before onDone. */
const DONE_MS = 700;

/** Box fill and outline per tone. Blue is the reference marker blue; the others are note tones. */
const TONE: Record<Tone, { fill: string; edge: string }> = {
  blue: { fill: "fill-box-fill", edge: "stroke-accent-600" },
  rose: { fill: "fill-tone-rose", edge: "stroke-tone-rose-edge" },
  mint: { fill: "fill-tone-mint", edge: "stroke-tone-mint-edge" },
  sand: { fill: "fill-tone-sand", edge: "stroke-tone-sand-edge" },
  lilac: { fill: "fill-hl-lilac", edge: "stroke-tone-lilac-edge" },
  ink: { fill: "fill-paper-3", edge: "stroke-ink" },
};

const WORD: Record<TextLayout["variant"], string> = {
  title: "font-bold fill-ink",
  body: "fill-ink-2",
  note: "fill-muted",
};

/*
 * Draw-in and fade states. Written out in full so Tailwind sees every class. Each item is one CSS transition
 * between its shown and hidden state, so changing `revealed` retargets from wherever the item is now.
 * Reduced motion keeps the fades and drops the draw-in and the offsets.
 */
const OUTLINE_IN =
  "opacity-100 [stroke-dashoffset:0] transition-[opacity,stroke-dashoffset] duration-420 ease-dalil-out motion-reduce:transition-opacity motion-reduce:duration-160";
const OUTLINE_OUT =
  "opacity-0 [stroke-dashoffset:1] transition-[opacity,stroke-dashoffset] duration-200 ease-dalil-out motion-reduce:transition-opacity motion-reduce:duration-160";
const BODY_IN =
  "opacity-100 [stroke-dashoffset:0] transition-[opacity,stroke-dashoffset] duration-460 ease-dalil-out motion-reduce:transition-opacity motion-reduce:duration-160";
const HEAD_IN =
  "opacity-100 [stroke-dashoffset:0] transition-[opacity,stroke-dashoffset] duration-220 delay-380 ease-dalil-out motion-reduce:transition-opacity motion-reduce:delay-0 motion-reduce:duration-160";
const HEAD_OUT =
  "opacity-0 [stroke-dashoffset:1] transition-[opacity,stroke-dashoffset] duration-150 ease-dalil-out motion-reduce:transition-opacity motion-reduce:duration-160";
const RING_IN =
  "opacity-100 [stroke-dashoffset:0] transition-[opacity,stroke-dashoffset] duration-520 ease-dalil-out motion-reduce:transition-opacity motion-reduce:duration-160";
const FILL_IN =
  "opacity-100 transition-opacity duration-350 delay-300 ease-dalil-out motion-reduce:delay-0 motion-reduce:duration-160";
const FILL_OUT = "opacity-0 transition-opacity duration-150 ease-dalil-out";
const TEXT_IN =
  "opacity-100 [transform:translateY(0)] transition-[opacity,transform] duration-350 delay-320 ease-dalil-out motion-reduce:transition-opacity motion-reduce:delay-0 motion-reduce:duration-160";
const TEXT_OUT =
  "opacity-0 [transform:translateY(3px)] transition-[opacity,transform] duration-150 ease-dalil-out";
const CAPTION_IN =
  "opacity-100 transition-opacity duration-300 delay-260 ease-dalil-out motion-reduce:delay-0 motion-reduce:duration-160";
const CAPTION_OUT = "opacity-0 transition-opacity duration-150 ease-dalil-out";
const LABEL_IN =
  "opacity-100 transition-opacity duration-300 delay-420 ease-dalil-out motion-reduce:delay-0 motion-reduce:duration-160";
const LABEL_OUT = "opacity-0 transition-opacity duration-150 ease-dalil-out";

/** Words on the paper: one <text> with a <tspan> per line, each centred on the block. */
function Words({ block, className, halo = false }: { block: PlacedText; className?: string; halo?: boolean }) {
  return (
    <text
      x={block.cx}
      fontSize={block.size}
      textAnchor="middle"
      strokeWidth={halo ? 4 : undefined}
      strokeLinejoin={halo ? "round" : undefined}
      className={cx("font-ink", className)}
    >
      {block.lines.map((line, i) => (
        <tspan key={i} x={block.cx} y={block.baselines[i]}>
          {line}
        </tspan>
      ))}
    </text>
  );
}

/** Invisible bounds for a filtered group, so the rough filter has room round its strokes. */
function Frame({ rect }: { rect: Rect }) {
  return <rect x={rect.x} y={rect.y} width={rect.w} height={rect.h} fill="none" />;
}

function BoxMark({ item, shown }: { item: BoxLayout; shown: boolean }) {
  const tone = TONE[item.tone];
  return (
    <g>
      <g className={ROUGH}>
        <Frame rect={item.frame} />
        <path d={item.outline} className={cx(tone.fill, shown ? FILL_IN : FILL_OUT)} />
        <path
          d={item.outline}
          fill="none"
          pathLength={1}
          strokeDasharray="1 1"
          strokeWidth={2.2}
          strokeLinejoin="round"
          className={cx(tone.edge, shown ? OUTLINE_IN : OUTLINE_OUT)}
        />
      </g>
      {item.caption ? (
        <Words block={item.caption} className={cx("fill-muted", shown ? CAPTION_IN : CAPTION_OUT)} />
      ) : null}
      <Words block={item.text} className={cx("font-bold fill-ink", shown ? TEXT_IN : TEXT_OUT)} />
    </g>
  );
}

function TextMark({ item, shown }: { item: TextLayout; shown: boolean }) {
  return <Words block={item.block} className={cx(WORD[item.variant], shown ? TEXT_IN : TEXT_OUT)} />;
}

function ArrowMark({ item, shown }: { item: ArrowLayout; shown: boolean }) {
  return (
    <g>
      <g className={ROUGH}>
        <Frame rect={item.frame} />
        <path
          d={item.path}
          fill="none"
          pathLength={1}
          strokeDasharray="1 1"
          strokeWidth={2}
          strokeLinecap="round"
          className={cx("stroke-ink-2", shown ? BODY_IN : OUTLINE_OUT)}
        />
        <path
          d={item.head}
          fill="none"
          pathLength={1}
          strokeDasharray="1 1"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cx("stroke-ink-2", shown ? HEAD_IN : HEAD_OUT)}
        />
      </g>
      {item.label ? (
        <Words
          block={item.label}
          halo
          className={cx("fill-muted stroke-paper-2 [paint-order:stroke]", shown ? LABEL_IN : LABEL_OUT)}
        />
      ) : null}
    </g>
  );
}

/** A loose marker ring round a box, or an underline under a line of text, in sand. */
function HighlightMark({ item, shown }: { item: HighlightLayout; shown: boolean }) {
  return (
    <g className={ROUGH_BLOB}>
      <Frame rect={item.frame} />
      <path
        d={item.path}
        fill="none"
        pathLength={1}
        strokeDasharray="1 1"
        strokeWidth={5}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={cx("stroke-hl-sand", shown ? RING_IN : OUTLINE_OUT)}
      />
    </g>
  );
}

function ItemMark({ item, shown }: { item: ItemLayout; shown: boolean }) {
  switch (item.kind) {
    case "box":
      return <BoxMark item={item} shown={shown} />;
    case "text":
      return <TextMark item={item} shown={shown} />;
    case "arrow":
      return <ArrowMark item={item} shown={shown} />;
    case "highlight":
      return <HighlightMark item={item} shown={shown} />;
    case "geometry":
      return <g>
        <path d={item.path} fill="none" pathLength={1} strokeDasharray="1 1" strokeWidth={2} strokeLinecap="round" className={cx(TONE[item.tone].edge,shown?OUTLINE_IN:OUTLINE_OUT)}/>
        {item.label && <g className={shown?TEXT_IN:TEXT_OUT}><Words block={item.label} className="fill-ink" halo/></g>}
      </g>;
    default:
      return null;
  }
}

export interface DiagramViewProps {
  scene: DiagramScene;
  /** How many items are visible, in draw order. Leave it out and the note plays on its own, one item at a time. */
  revealed?: number;
  className?: string;
  /** Called once the last item has finished drawing. */
  onDone?: () => void;
}

/**
 * A hand-drawn note on grid paper: a title tab, the items drawn in order on a 5 by 3 paper, and an optional
 * footnote. Changing `revealed` retargets the draw in place, so items draw in or fade out from where they are.
 * Mount <RoughFilters /> once on the page so boxes, arrows and highlights get their hand-made edge.
 */
export function DiagramView({ scene, revealed, className, onDone }: DiagramViewProps) {
  const layout = useMemo(() => layoutDiagram(scene), [scene]);
  const label = useMemo(() => describeDiagram(scene), [scene]);
  const total = layout.items.length;
  const auto = revealed === undefined;

  const [playhead, setPlayhead] = useState(0);
  useEffect(() => {
    if (!auto || playhead >= total) return;
    const id = window.setTimeout(
      () => setPlayhead((n) => n + 1),
      playhead === 0 ? AUTO_START_MS : AUTO_STEP_MS,
    );
    return () => window.clearTimeout(id);
  }, [auto, playhead, total]);

  const count = Math.min(Math.max(auto ? playhead : (revealed ?? 0), 0), total);
  const complete = count >= total;

  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });
  const doneFired = useRef(false);
  useEffect(() => {
    if (!complete) {
      doneFired.current = false;
      return;
    }
    if (doneFired.current) return;
    const id = window.setTimeout(() => {
      doneFired.current = true;
      onDoneRef.current?.();
    }, DONE_MS);
    return () => window.clearTimeout(id);
  }, [complete]);

  return (
    <figure
      className={cx(
        "w-full max-w-190 overflow-hidden bg-paper font-sans text-ink",
        className,
      )}
    >
      <div>
        <svg
          role="img"
          aria-label={label}
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="block h-auto w-full"
        >
          {layout.items.map((item, i) => (
            <g key={`${i}-${item.kind}-${item.id}`} data-teach-target={item.id}><ItemMark item={item} shown={isShown(count,i)}/></g>
          ))}
        </svg>
      </div>
    </figure>
  );
}
