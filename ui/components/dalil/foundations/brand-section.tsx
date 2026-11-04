"use client";

import { RiCloseLine } from "@remixicon/react";
import { BrandMark, Wordmark } from "@/components/dalil/brand-mark";
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@/components/base/table/table";
import { cx } from "@/utils/cx";
import { Block } from "./section";

const RULES = [
  { rule: "Mark", value: "A hand-inked D with the pointer dot in its bowl. The D follows the text colour. The dot is always signal blue." },
  { rule: "Wordmark", value: "Dalil, set in Gaegu Bold. Never another face." },
  { rule: "Clear space", value: "A quarter of the mark's height on every side, kept free of text and edges." },
  { rule: "Minimum size", value: "Mark 14px, the size it has at rest in the notch. Wordmark 20px." },
  { rule: "Grounds", value: "Grid paper or night glass. Never a photograph, never a gradient." },
];

const MIN_SIZES = [
  { size: 14, note: "Notch at rest" },
  { size: 20, note: "Navigation" },
  { size: 32, note: "Cards and panels" },
];

const SIZE_CLASS: Record<number, string> = { 14: "size-3.5", 20: "size-5", 32: "size-8" };

const DONTS = [
  "Do not recolour the pointer dot.",
  "Do not set the wordmark in another face.",
  "Do not add a gradient, outline or shadow.",
];

function Lockup({ night = false }: { night?: boolean }) {
  return (
    <span className={cx("flex items-center gap-2", night ? "dark text-notch-ink" : "text-ink")}>
      <BrandMark className="shrink-0" title="Dalil mark" />
      <Wordmark />
    </span>
  );
}

function Ground({ night, children, className }: { night?: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cx(
        "flex items-center justify-center rounded-lg ring-1 ring-inset ring-ink/15",
        night ? "dark bg-notch text-notch-ink" : "bg-paper-2 text-ink",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function BrandSection() {
  return (
    <>
      <Block title="Rules" note="The name is the only Arabic in the product. Dalil means guide.">
        <Table size="sm" aria-label="Brand rules">
          <TableHeader>
            <TableColumn id="rule" isRowHeader className="w-36">
              Rule
            </TableColumn>
            <TableColumn id="value">Value</TableColumn>
          </TableHeader>
          <TableBody>
            {RULES.map((r) => (
              <TableRow key={r.rule} id={r.rule}>
                <TableCell className="py-2.5! align-top!">{r.rule}</TableCell>
                <TableCell className="py-2.5! align-top! whitespace-normal!">
                  <span className="text-body-regular text-text-secondary">{r.value}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Block>

      <Block title="Lockup on both grounds">
        <div className="grid gap-4 sm:grid-cols-2">
          <Ground className="h-32">
            <Lockup />
          </Ground>
          <Ground night className="h-32">
            <Lockup night />
          </Ground>
        </div>
      </Block>

      <div className="grid gap-x-8 gap-y-8 lg:grid-cols-2">
        <Block title="Mark, large" note="Shown once, at 160px, to see the pointer dot in the bowl.">
          <Ground className="h-56">
            <BrandMark className="size-40" title="Dalil mark, large" />
          </Ground>
        </Block>

        <Block title="Clear space" note="The dashed edge marks the quarter-height margin.">
          <Ground className="h-56">
            <div className="border border-dashed border-accent-600 p-6">
              <BrandMark className="size-24" title="Dalil mark with clear space" />
            </div>
          </Ground>
        </Block>
      </div>

      <Block title="Minimum sizes" note="Smaller than these, the dot merges with the stroke.">
        <Table size="sm" aria-label="Minimum sizes">
          <TableHeader>
            <TableColumn id="size" isRowHeader className="w-24">
              Mark size
            </TableColumn>
            <TableColumn id="where" className="max-sm:hidden">
              Where
            </TableColumn>
            <TableColumn id="paper">On paper</TableColumn>
            <TableColumn id="night">On black</TableColumn>
          </TableHeader>
          <TableBody>
            {MIN_SIZES.map((m) => (
              <TableRow key={m.size} id={String(m.size)}>
                <TableCell className="py-2.5! tabular-nums">{m.size}px</TableCell>
                <TableCell className="py-2.5! max-sm:hidden">{m.note}</TableCell>
                <TableCell className="py-2.5!">
                  <span className="inline-flex rounded-md bg-paper-2 p-2 text-ink ring-1 ring-inset ring-ink/15">
                    <BrandMark className={SIZE_CLASS[m.size]} title={`Mark at ${m.size} pixels on paper`} />
                  </span>
                </TableCell>
                <TableCell className="py-2.5!">
                  <span className="dark inline-flex rounded-md bg-notch p-2 text-notch-ink ring-1 ring-inset ring-ink/15">
                    <BrandMark className={SIZE_CLASS[m.size]} title={`Mark at ${m.size} pixels on black`} />
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Block>

      <Block title="Don't">
        <ul className="flex flex-col border-t border-separator-border">
          {DONTS.map((d) => (
            <li key={d} className="flex min-h-11 items-center gap-3 border-b border-separator-border py-2 text-body-regular text-text-primary">
              <RiCloseLine className="size-5 shrink-0 text-mark-error" aria-hidden />
              {d}
            </li>
          ))}
        </ul>
      </Block>
    </>
  );
}
