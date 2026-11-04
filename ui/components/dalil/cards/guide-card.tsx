"use client";

import { useReducedMotion } from "motion/react";
import {
  Fragment,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type Ref,
} from "react";
import { cx } from "@/utils/cx";
import { createTimeline, DrawProvider, Reveal, type Drawn, type Timeline } from "./draw";
import { GuidePill } from "./guide-pill";
import { CheckBox, HandArrow, Highlight, Line, LongArrow, MarginArrow, MarkerBox } from "./ink";
import { CHECKLIST_SAMPLE, CONVERT_SAMPLE, EXPLAIN_SAMPLE, STEPS_SAMPLE } from "./samples";
import type { ChecklistData, ConvertData, ExplainData, GuideCardHandle, GuideCardType, StepsData } from "./types";

const HEADING = "font-ink text-[30px] leading-9 font-bold tracking-[-0.03em] text-ink";
const SUBTITLE = "font-ink text-[20px] leading-6 tracking-[-0.03em] text-muted";
const CAPTION = "font-ink text-[22px] leading-7 tracking-[-0.03em] text-ink-2";
const BODY = "font-ink text-[24px] leading-8 tracking-[-0.03em] text-ink";

/** Grid paper: 24px cells, 1px rules, built from the rule token. */
const GRID_PAPER =
  "bg-[linear-gradient(to_right,var(--color-rule)_1px,transparent_1px),linear-gradient(to_bottom,var(--color-rule)_1px,transparent_1px)] bg-size-[24px_24px] bg-position-[-1px_-1px]";

interface CommonProps {
  /** true draws everything (the default, and what a static render shows), false hides everything, a number shows that many blocks. */
  drawn?: Drawn;
  /** Fires once the last visible block has finished drawing. */
  onDrawn?: () => void;
  /** 360 to 440. */
  width?: number;
  /** Override the follow-up pill label (under 32 characters). Pass null to hide the pill. */
  pill?: string | null;
  onPill?: () => void;
  /** Which edge the margin arrow of an Explain card points to. Face it toward the target. */
  pointer?: "start" | "end";
  /** Checklist only: tick state per item. Leave undefined to tick through the ref. */
  checked?: boolean[];
  className?: string;
  style?: CSSProperties;
  ref?: Ref<GuideCardHandle>;
}

export type GuideCardProps = CommonProps &
  (
    | { type: "steps"; data?: StepsData }
    | { type: "convert"; data?: ConvertData }
    | { type: "checklist"; data?: ChecklistData }
    | { type: "explain"; data?: ExplainData }
  );

interface BodyArgs {
  tl: Timeline;
  width: number;
  ticks: boolean[];
  pointer: "start" | "end";
  /** undefined keeps the card's own pill, null hides it. */
  pill: string | null | undefined;
  onPill?: () => void;
}

function pillBlock({ tl, pill, onPill }: BodyArgs, fallback?: string) {
  const pillLabel = pill === undefined ? fallback : pill;
  if (!pillLabel) return null;
  const b = tl.pill();
  return (
    <Reveal block={b} className="mt-1 flex justify-start">
      <GuidePill label={pillLabel} onClick={onPill} />
    </Reveal>
  );
}

function stepsBody(data: StepsData, args: BodyArgs) {
  const { tl, width } = args;
  const heading = tl.heading();
  const subtitle = data.subtitle ? tl.text(data.subtitle.length) : null;
  const n = data.digits.length;
  const rail = tl.row(n * 2 - 1);
  const boxes = tl.row(n);
  const working = data.working.map((w) => tl.text(w.length));
  const answer = tl.text(data.answer.length);
  const conclusion = data.conclusion ? tl.text(data.conclusion.length) : null;
  const col = (width - 48) / n;
  const arrowLength = Math.max(24, col - 52);
  const tilts = [-2, 1.5, -2.5];

  return (
    <>
      <Reveal block={heading}>
        <h2 className={HEADING}>{data.heading}</h2>
      </Reveal>
      {subtitle && data.subtitle ? (
        <Line block={subtitle} className={cx(SUBTITLE, "-mt-3")}>
          {data.subtitle}
        </Line>
      ) : null}

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between" style={{ paddingInline: col / 2 - 18 }}>
          {data.places.map((p, i) => (
            <Fragment key={`${p}-${i}`}>
              {i > 0 ? (
                <Reveal block={rail} sub={i * 2 - 1} className="text-ink">
                  <HandArrow dir="start" length={arrowLength} />
                </Reveal>
              ) : null}
              <Highlight block={rail} sub={i * 2} tilt={i % 2 ? 2 : -2} className="min-w-9 text-center">
                <span className="font-ink text-[22px] leading-7 tracking-[-0.03em] text-ink-2">{p}</span>
              </Highlight>
            </Fragment>
          ))}
        </div>
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
          {data.digits.map((d, i) => (
            <MarkerBox
              key={`${d}-${i}`}
              block={boxes}
              sub={i}
              tone={data.dim?.includes(i) ? "grey" : "blue"}
              className="h-16"
            >
              {d}
            </MarkerBox>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3.5 ps-1">
        {data.working.map((w, i) => (
          <div key={w}>
            <Highlight block={working[i]} tilt={tilts[i % tilts.length]}>
              <span className={BODY}>{w}</span>
            </Highlight>
          </div>
        ))}
      </div>

      <div className="ps-1 pt-1">
        <Highlight block={answer} tone="lilac" tilt={2}>
          <span className={BODY}>{data.answer}</span>
        </Highlight>
      </div>
      {conclusion && data.conclusion ? (
        <Line block={conclusion} className={cx(BODY, "ps-1")}>
          {data.conclusion}
        </Line>
      ) : null}
      {pillBlock(args, data.pill)}
    </>
  );
}

function convertBody(data: ConvertData, args: BodyArgs) {
  const { tl } = args;
  const heading = tl.heading();
  const subtitle = data.subtitle ? tl.text(data.subtitle.length) : null;
  const label = tl.text(data.label.length);
  const values = tl.row(data.values.length * 2 - 1);
  const remainders = tl.row(data.remainders.length);
  const readUp = tl.row(1);
  const result = tl.text(data.result.length);

  return (
    <>
      <Reveal block={heading}>
        <h2 className={HEADING}>{data.heading}</h2>
      </Reveal>
      {subtitle && data.subtitle ? (
        <Line block={subtitle} className={cx(SUBTITLE, "-mt-3")}>
          {data.subtitle}
        </Line>
      ) : null}
      <Line block={label} className={CAPTION}>
        {data.label}
      </Line>

      <div className="-mt-1 flex flex-col gap-1.5">
        <div className="flex items-center">
          {data.values.map((v, i) => (
            <Fragment key={`${v}-${i}`}>
              {i > 0 ? (
                <Reveal block={values} sub={i * 2 - 1} className="w-4.5 shrink-0 text-ink-2">
                  <HandArrow dir="end" length={18} />
                </Reveal>
              ) : null}
              <Reveal block={values} sub={i * 2} className="min-w-0 flex-1 text-center">
                <span className="font-ink text-[24px] leading-8 tracking-[-0.03em] text-ink">{v}</span>
              </Reveal>
            </Fragment>
          ))}
        </div>
        <div className="flex items-center">
          {data.values.map((v, i) => (
            <Fragment key={`${v}-${i}`}>
              {i > 0 ? <span className="w-4.5 shrink-0" aria-hidden /> : null}
              <span className="min-w-0 flex-1 text-center">
                {i < data.remainders.length ? (
                  <Reveal block={remainders} sub={i}>
                    <span className="font-ink text-[24px] leading-8 font-bold tracking-[-0.03em] text-accent-600">{data.remainders[i]}</span>
                  </Reveal>
                ) : null}
              </span>
            </Fragment>
          ))}
        </div>
        <Reveal block={readUp} className="text-accent-600">
          <LongArrow />
        </Reveal>
      </div>

      <div className="ps-1">
        <Highlight block={result} tone="lilac" tilt={-2}>
          <span className={BODY}>{data.result}</span>
        </Highlight>
      </div>
      {pillBlock(args, data.pill)}
    </>
  );
}

function checklistBody(data: ChecklistData, args: BodyArgs) {
  const { tl, ticks } = args;
  const heading = tl.heading();
  const subtitle = data.subtitle ? tl.text(data.subtitle.length) : null;
  const items = data.items.map((item) => tl.text(item.length));

  return (
    <>
      <Reveal block={heading}>
        <h2 className={HEADING}>{data.heading}</h2>
      </Reveal>
      {subtitle && data.subtitle ? (
        <Line block={subtitle} className={cx(SUBTITLE, "-mt-3")}>
          {data.subtitle}
        </Line>
      ) : null}
      <ul className="-my-1.5 flex flex-col">
        {data.items.map((item, i) => (
          <Reveal key={item} as="li" block={items[i]} className="flex items-center gap-2 -ms-2">
            <CheckBox ticked={Boolean(ticks[i])} />
            <span className={BODY}>{item}</span>
            <span className="sr-only">{ticks[i] ? "Done" : "Not done yet"}</span>
          </Reveal>
        ))}
      </ul>
      {pillBlock(args, data.pill)}
    </>
  );
}

function explainBody(data: ExplainData, args: BodyArgs) {
  const { tl, pointer } = args;
  const heading = tl.heading();
  const body = tl.text(data.body.length);
  const mark = data.mark && data.body.includes(data.mark) ? tl.text(data.mark.length) : null;
  const arrow = tl.row(1);
  const note = tl.text(data.note.length);

  let before = data.body;
  let after = "";
  if (mark && data.mark) {
    const at = data.body.indexOf(data.mark);
    before = data.body.slice(0, at);
    after = data.body.slice(at + data.mark.length);
  }

  return (
    <>
      <Reveal block={heading}>
        <h2 className={HEADING}>{data.heading}</h2>
      </Reveal>
      <Reveal block={body}>
        <p className={BODY}>
          {before}
          {mark && data.mark ? (
            <span className="whitespace-nowrap">
              <Highlight block={mark} tilt={-2.5}>
                {data.mark}
              </Highlight>
              {after}
            </span>
          ) : null}
          {mark ? null : after}
        </p>
      </Reveal>
      <div className={cx("-mt-1 flex items-center gap-1", pointer === "end" ? "flex-row-reverse" : "-ms-3")}>
        <Reveal block={arrow} className="text-accent-600">
          <MarginArrow pointer={pointer} />
        </Reveal>
        <Line block={note} className="font-ink text-[22px] leading-7 tracking-[-0.03em] text-accent-600">
          {data.note}
        </Line>
      </div>
      {pillBlock(args, data.pill)}
    </>
  );
}

/** Block count for a card type with its sample content, for callers that sequence `drawn` as a number. */
export function guideCardBlockCount(type: GuideCardType) {
  return buildCard({ type }, { width: 400, ticks: [], pointer: "start", pill: undefined }).tl.count;
}

function buildCard(
  props: { type: GuideCardType; data?: StepsData | ConvertData | ChecklistData | ExplainData },
  rest: Omit<BodyArgs, "tl">,
) {
  const tl = createTimeline();
  const args: BodyArgs = { ...rest, tl };
  let strip: string;
  let body: ReactNode;
  if (props.type === "steps") {
    const v = (props.data as StepsData | undefined) ?? STEPS_SAMPLE;
    strip = v.strip;
    body = stepsBody(v, args);
  } else if (props.type === "convert") {
    const v = (props.data as ConvertData | undefined) ?? CONVERT_SAMPLE;
    strip = v.strip;
    body = convertBody(v, args);
  } else if (props.type === "checklist") {
    const v = (props.data as ChecklistData | undefined) ?? CHECKLIST_SAMPLE;
    strip = v.strip;
    body = checklistBody(v, args);
  } else {
    const v = (props.data as ExplainData | undefined) ?? EXPLAIN_SAMPLE;
    strip = v.strip;
    body = explainBody(v, args);
  }
  return { tl, strip, body };
}

/**
 * A hand-inked guide card on grid paper. Click-through except the follow-up pill. It renders fully
 * drawn by default; flip `drawn` from false to true (or count it up) to play the draw timeline.
 * Mount <RoughFilters /> once on the page so boxes, arrows and highlights get their hand-made edge.
 */
export function GuideCard(props: GuideCardProps) {
  const {
    drawn = true,
    onDrawn,
    width = 400,
    pill,
    onPill,
    pointer = "start",
    checked,
    className,
    style,
    ref,
  } = props;

  const rootRef = useRef<HTMLElement>(null);
  const [internalTicks, setInternalTicks] = useState<boolean[]>([]);
  const ticks = checked ?? internalTicks;
  const reduced = useReducedMotion();
  const [measured, setMeasured] = useState(width);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setMeasured(el.clientWidth || width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  useImperativeHandle(
    ref,
    () => ({
      tick: (i) => setInternalTicks((t) => Object.assign([...t], { [i]: true })),
      untick: (i) => setInternalTicks((t) => Object.assign([...t], { [i]: false })),
      reset: () => setInternalTicks([]),
      get element() {
        return rootRef.current;
      },
    }),
    [],
  );

  const { tl, strip, body } = buildCard(props, { width: measured, ticks, pointer, pill, onPill });
  const shellShown = drawn === true || (typeof drawn === "number" && drawn > 0);
  const count = tl.count;
  const end = tl.end;
  const lastExtent = tl.blocks[count - 1]?.extent ?? 0;

  const onDrawnRef = useRef(onDrawn);
  useEffect(() => {
    onDrawnRef.current = onDrawn;
  });
  useEffect(() => {
    let wait: number | null = null;
    if (drawn === true) wait = reduced ? 160 : end;
    else if (typeof drawn === "number" && drawn >= count) wait = reduced ? 160 : lastExtent;
    if (wait === null) return;
    const id = window.setTimeout(() => onDrawnRef.current?.(), wait);
    return () => window.clearTimeout(id);
  }, [drawn, count, end, lastExtent, reduced]);

  return (
    <section
      ref={rootRef}
      aria-label={strip}
      className={cx(
        "pointer-events-none relative isolate overflow-hidden rounded-card bg-paper-2 font-sans text-ink shadow-card",
        GRID_PAPER,
        shellShown
          ? "opacity-100 transition-opacity duration-200 ease-dalil-out"
          : "opacity-0 transition-none",
        className,
      )}
      style={{ width, maxWidth: "100%", ...style }}
    >
      <div className="flex h-7 items-center justify-center border-b border-rule bg-paper px-4">
        <span className="truncate text-caption-1-regular text-muted">{strip}</span>
      </div>
      <DrawProvider value={drawn}>
        <div className="flex flex-col gap-5 px-6 pt-5 pb-6">{body}</div>
      </DrawProvider>
    </section>
  );
}
