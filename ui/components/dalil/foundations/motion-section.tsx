"use client";

import { useState } from "react";
import { RiCloseLine, RiRestartLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@/components/base/table/table";
import { cx } from "@/utils/cx";
import { Block, Code } from "./section";

interface Curve {
  id: string;
  name: string;
  value: [number, number, number, number];
  use: string;
  cls: string;
  never?: boolean;
}

const CURVES: Curve[] = [
  { id: "out", name: "ease-dalil-out", value: [0.23, 1, 0.32, 1], use: "Entrances and anything that answers a touch", cls: "ease-dalil-out" },
  { id: "inout", name: "ease-dalil-in-out", value: [0.77, 0, 0.175, 1], use: "Movement that stays on screen", cls: "ease-dalil-in-out" },
  { id: "drawer", name: "ease-dalil-drawer", value: [0.32, 0.72, 0, 1], use: "The notch changing shape", cls: "ease-dalil-drawer" },
  { id: "in", name: "ease-in", value: [0.42, 0, 1, 1], use: "Never. It starts slowly, so the first moment the eye is watching feels dead.", cls: "", never: true },
];

const DURATIONS = [
  { name: "Press", ms: 100, use: "Colour step when a control is pressed" },
  { name: "Micro", ms: 140, use: "Hovers, small reveals" },
  { name: "Short", ms: 220, use: "Menus, chips, row expansion" },
  { name: "Notch", ms: 360, use: "The notch changing shape" },
  { name: "Card draw", ms: 520, use: "A guide card drawing in" },
];

const REDUCED = [
  { surface: "Pointer flight", normal: "Arc over 380 to 720 ms", reduced: "160 ms fade at the destination" },
  { surface: "Notch", normal: "Changes shape on the drawer curve", reduced: "120 ms fade between shapes" },
  { surface: "Guide cards", normal: "Draw box by box with a wipe", reduced: "Appear with opacity only" },
  { surface: "Pulses and breathing marks", normal: "Slow loops", reduced: "Stop" },
];

const SIZE = 96;
const PAD = 12;
const SPAN = SIZE - PAD * 2;

function curvePath([x1, y1, x2, y2]: Curve["value"]): string {
  const pts: string[] = [];
  const steps = 48;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    const bx = 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t;
    const by = 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t;
    pts.push(`${i === 0 ? "M" : "L"}${(PAD + bx * SPAN).toFixed(2)} ${(PAD + SPAN - by * SPAN).toFixed(2)}`);
  }
  return pts.join(" ");
}

function CurvePlot({ curve }: { curve: Curve }) {
  const [x1, y1, x2, y2] = curve.value;
  const px = (v: number) => PAD + v * SPAN;
  const py = (v: number) => PAD + SPAN - v * SPAN;
  const stroke = curve.never ? "var(--color-mark-error)" : "var(--color-accent-600)";
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="size-24 shrink-0"
      role="img"
      aria-label={`Plot of cubic-bezier ${curve.value.join(", ")}: time across, progress up`}
    >
      <rect x={PAD} y={PAD} width={SPAN} height={SPAN} fill="none" stroke="var(--color-rule-strong)" strokeWidth="1" />
      <line x1={px(0)} y1={py(0)} x2={px(1)} y2={py(1)} stroke="var(--color-rule-strong)" strokeDasharray="3 3" />
      <line x1={px(0)} y1={py(0)} x2={px(x1)} y2={py(y1)} stroke="var(--color-muted)" strokeWidth="1" />
      <line x1={px(1)} y1={py(1)} x2={px(x2)} y2={py(y2)} stroke="var(--color-muted)" strokeWidth="1" />
      <circle cx={px(x1)} cy={py(y1)} r="2.5" fill="var(--color-muted)" />
      <circle cx={px(x2)} cy={py(y2)} r="2.5" fill="var(--color-muted)" />
      <path d={curvePath(curve.value)} fill="none" stroke={stroke} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MotionSection() {
  const [end, setEnd] = useState(false);

  return (
    <>
      <Block title="Easing curves" note="Three custom curves and one banned built-in. Time runs left to right, progress runs upwards.">
        <Table size="sm" aria-label="Easing curves">
          <TableHeader>
            <TableColumn id="name" isRowHeader>
              Curve
            </TableColumn>
            <TableColumn id="use" className="max-md:hidden">
              Use
            </TableColumn>
            <TableColumn id="plot" className="w-28">
              Plot
            </TableColumn>
          </TableHeader>
          <TableBody>
            {CURVES.map((c) => (
              <TableRow key={c.id} id={c.id}>
                <TableCell className="py-3! align-middle!">
                  <span className="flex flex-col gap-1">
                    <span className={cx("inline-flex items-center gap-1.5 text-body-medium text-text-primary", c.never && "line-through decoration-2 decoration-mark-error")}>
                      {c.name}
                    </span>
                    <Code className="text-text-secondary">{`cubic-bezier(${c.value.join(", ")})`}</Code>
                    {c.never && (
                      <span className="inline-flex items-center gap-1 text-body-2-medium text-text-primary">
                        <RiCloseLine className="size-4 text-mark-error" aria-hidden />
                        Never use this
                      </span>
                    )}
                    <span className="text-body-2-regular text-text-secondary md:hidden">{c.use}</span>
                  </span>
                </TableCell>
                <TableCell className="py-3! align-middle! max-md:hidden">
                  <span className="text-body-2-regular text-text-secondary">{c.use}</span>
                </TableCell>
                <TableCell className="py-3! align-middle!">
                  <CurvePlot curve={c} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Block>

      <Block title="Durations" note="Interface motion stays under 300 ms. Only the notch and the card draw run longer.">
        <Table size="sm" aria-label="Duration scale">
          <TableHeader>
            <TableColumn id="name" isRowHeader className="w-32">
              Name
            </TableColumn>
            <TableColumn id="ms" className="w-20">
              Time
            </TableColumn>
            <TableColumn id="use" className="max-md:hidden">
              Use
            </TableColumn>
            <TableColumn id="bar" className="w-40 max-sm:hidden">
              Length
            </TableColumn>
          </TableHeader>
          <TableBody>
            {DURATIONS.map((d) => (
              <TableRow key={d.name} id={d.name}>
                <TableCell className="py-2.5!">{d.name}</TableCell>
                <TableCell className="py-2.5! tabular-nums">{d.ms} ms</TableCell>
                <TableCell className="py-2.5! max-md:hidden">
                  <span className="text-body-2-regular text-text-secondary">{d.use}</span>
                </TableCell>
                <TableCell className="py-2.5! max-sm:hidden">
                  <span aria-hidden className="block h-2.5 rounded-xs bg-accent-600" style={{ width: `${(d.ms / 520) * 100}%` }} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Block>

      <Block
        title="Live replay"
        note="Three boxes travel the same distance in 520 ms on three curves. Press Replay again while they move: each box turns around from where it is."
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3">
            {CURVES.filter((c) => !c.never).map((c) => (
              <div key={c.id} className="grid items-center gap-x-4 gap-y-1 sm:grid-cols-[10rem_1fr]">
                <Code className="text-text-secondary">{c.name}</Code>
                <div className="@container h-10 rounded-md bg-paper-3">
                  <div
                    aria-hidden
                    className={cx(
                      "m-1 size-8 rounded-sm bg-accent-600 transition-transform duration-[520ms] motion-reduce:transition-none",
                      c.cls,
                      end ? "translate-x-[calc(100cqw-2.5rem)]" : "translate-x-0",
                    )}
                  />
                </div>
              </div>
            ))}
          </div>
          <div>
            <Button variant="secondary" size="medium" leadingIcon={RiRestartLine} onClick={() => setEnd((v) => !v)}>
              Replay
            </Button>
          </div>
        </div>
      </Block>

      <Block title="Reduced motion" note="Reduced motion means gentler, not absent. Opacity and colour changes that aid comprehension stay.">
        <Table size="sm" aria-label="Reduced motion fallbacks">
          <TableHeader>
            <TableColumn id="surface" isRowHeader>
              Surface
            </TableColumn>
            <TableColumn id="normal" className="max-sm:hidden">
              Normal
            </TableColumn>
            <TableColumn id="reduced">Reduced</TableColumn>
          </TableHeader>
          <TableBody>
            {REDUCED.map((r) => (
              <TableRow key={r.surface} id={r.surface}>
                <TableCell className="py-2.5!">{r.surface}</TableCell>
                <TableCell className="py-2.5! max-sm:hidden">{r.normal}</TableCell>
                <TableCell className="py-2.5!">{r.reduced}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Block>
    </>
  );
}
