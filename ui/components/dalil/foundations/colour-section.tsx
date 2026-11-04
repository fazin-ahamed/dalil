"use client";

import { RiCheckLine, RiCloseLine, RiInformationLine } from "@remixicon/react";
import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@/components/base/table/table";
import { cx } from "@/utils/cx";
import { Block, Code } from "./section";
import type { ColourData, ColourRow, ContrastCheck } from "./colour-data";

const CELL = "py-2! align-top!";

/** Paints from the CSS variable. The hex is only a fallback for @theme tokens that Tailwind prunes when no utility uses them. */
function Swatch({ cssVar, fallback, night = false }: { cssVar: string; fallback?: string; night?: boolean }) {
  return (
    <span className={night ? "dark" : undefined}>
      <span
        aria-hidden
        className="block h-9 w-12 rounded-md ring-1 ring-inset ring-ink/25"
        style={{ backgroundColor: fallback ? `var(${cssVar}, ${fallback})` : `var(${cssVar})` }}
      />
    </span>
  );
}

function Result({ check, exempt }: { check: ContrastCheck; exempt?: string }) {
  if (check.pass) {
    return (
      <span className="inline-flex items-center gap-1">
        <RiCheckLine className="size-4 text-mark-success" aria-hidden />
        Pass
      </span>
    );
  }
  if (exempt) {
    return (
      <span className="inline-flex items-center gap-1">
        <RiInformationLine className="size-4 text-muted" aria-hidden />
        {exempt}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <RiCloseLine className="size-4 text-mark-error" aria-hidden />
      Fail
    </span>
  );
}

function Contrast({ row }: { row: ColourRow }) {
  if (row.checks.length === 0) return <span className="text-text-tertiary">Not used for text</span>;
  return (
    <ul className="flex flex-col gap-1">
      {row.checks.map((c) => {
        const own = c.fg === row.name;
        return (
          <li key={`${c.fg}-${c.bg}`} className="flex flex-wrap items-center gap-x-2 text-body-2-regular text-text-primary">
            <span className="tabular-nums">{c.ratio}</span>
            <span className="text-text-secondary">
              {own ? `on ${c.bg}` : `with ${c.fg} text`}
              {c.kind === "non-text" ? ", non-text" : ""}
            </span>
            <Result check={c} exempt={row.exempt} />
          </li>
        );
      })}
    </ul>
  );
}

function PaletteTable({ rows, label }: { rows: ColourRow[]; label: string }) {
  return (
    <Table size="sm" aria-label={label}>
      <TableHeader>
        <TableColumn id="swatch" className="w-16">
          <span className="sr-only">Swatch</span>
        </TableColumn>
        <TableColumn id="token" isRowHeader>
          Token
        </TableColumn>
        <TableColumn id="hex">Hex</TableColumn>
        <TableColumn id="usage" className="max-md:hidden">
          Usage
        </TableColumn>
        <TableColumn id="contrast">Contrast</TableColumn>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.name} id={r.name}>
            <TableCell className={CELL}>
              <Swatch cssVar={r.cssVar} fallback={r.hex} />
            </TableCell>
            <TableCell className={CELL}>
              <Code>{r.cssVar}</Code>
              <span className="mt-0.5 block text-body-2-regular text-text-secondary md:hidden">{r.usage}</span>
            </TableCell>
            <TableCell className={cx(CELL, "font-mono tabular-nums")}>
              <Code>{r.hex}</Code>
            </TableCell>
            <TableCell className={cx(CELL, "max-md:hidden")}>
              <span className="text-body-2-regular text-text-secondary">{r.usage}</span>
            </TableCell>
            <TableCell className={CELL}>
              <Contrast row={r} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function ColourSection({ data }: { data: ColourData }) {
  return (
    <>
      {data.groups.map((g) => (
        <Block key={g.id} title={g.title} note={g.note} id={`colour-${g.id}`}>
          <PaletteTable rows={g.rows} label={`${g.title} colour tokens`} />
        </Block>
      ))}

      <Block
        title="Semantic layer"
        note="BoardUI components read these names. The paper column is :root. The night column is the .dark wrapper that the notch applies."
      >
        <Table size="sm" aria-label="Semantic token bindings">
          <TableHeader>
            <TableColumn id="token" isRowHeader>
              Token
            </TableColumn>
            <TableColumn id="paper">Paper</TableColumn>
            <TableColumn id="night">Night</TableColumn>
          </TableHeader>
          <TableBody>
            {data.semantic.map((s) => (
              <TableRow key={s.cssVar} id={s.cssVar}>
                <TableCell className={CELL}>
                  <Code>{s.cssVar}</Code>
                </TableCell>
                <TableCell className={CELL}>
                  <span className="flex items-center gap-3 max-sm:flex-col max-sm:items-start max-sm:gap-1.5">
                    <Swatch cssVar={s.cssVar} fallback={s.paperHex} />
                    <span className="flex flex-col">
                      <Code>{s.paperHex || "BoardUI default"}</Code>
                      <span className="text-body-2-regular text-text-secondary max-sm:hidden">{s.paperSource || "not set in dalil.css"}</span>
                    </span>
                  </span>
                </TableCell>
                <TableCell className={CELL}>
                  <span className="flex items-center gap-3 max-sm:flex-col max-sm:items-start max-sm:gap-1.5">
                    <Swatch cssVar={s.cssVar} fallback={s.nightHex} night />
                    <span className="flex flex-col">
                      <Code>{s.nightHex}</Code>
                      <span className="text-body-2-regular text-text-secondary max-sm:hidden">
                        {s.nightSource === s.paperSource && s.nightHex === s.paperHex ? "same as paper" : s.nightSource}
                      </span>
                    </span>
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Block>
    </>
  );
}
