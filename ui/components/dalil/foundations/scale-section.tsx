"use client";

import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@/components/base/table/table";
import { cx } from "@/utils/cx";
import { Block, Code } from "./section";

const SPACE = [
  { step: "1", px: 4, use: "Icon gap, tight stack" },
  { step: "2", px: 8, use: "Chip padding, small gap" },
  { step: "3", px: 12, use: "Row padding" },
  { step: "4", px: 16, use: "Panel padding on phones" },
  { step: "5", px: 20, use: "Panel padding" },
  { step: "6", px: 24, use: "Grid cell and section gap" },
  { step: "8", px: 32, use: "Column gap" },
  { step: "12", px: 48, use: "Section rhythm" },
];

const SIZES = [
  { name: "Control height", px: 36, use: "Buttons and fields" },
  { name: "Hit target", px: 44, use: "Every tappable thing, including the pill" },
];

const RADII = [
  { name: "Field", value: "6px", radius: "6px", use: "Inputs and marker boxes" },
  { name: "Button", value: "10px", radius: "10px", use: "Buttons" },
  { name: "Inner card", value: "14px", radius: "14px", use: "Blocks inside a card" },
  { name: "Card", value: "20px", radius: "var(--radius-card)", use: "Guide cards" },
  { name: "Notch small", value: "16px", radius: "var(--radius-notch-sm)", use: "Resting notch, bottom corners" },
  { name: "Notch", value: "28px", radius: "var(--radius-notch)", use: "Open notch, bottom corners" },
  { name: "Pill", value: "999px", radius: "999px", use: "Follow-up pill, chips" },
];

const ELEVATION = [
  { id: "notch-paper", name: "Notch over paper", token: "shadow-notch", ground: "bg-paper", tile: "bg-notch shadow-notch", use: "A keyline and a deep soft shadow" },
  { id: "notch-black", name: "Notch over black", token: "shadow-notch", ground: "bg-notch", tile: "bg-notch shadow-notch", use: "Only the white 7% keyline shows" },
  { id: "card-paper", name: "Card over paper", token: "shadow-card", ground: "bg-paper", tile: "bg-paper-2 shadow-card", use: "Top highlight, wide soft shadow, tight contact shadow" },
  { id: "glow", name: "Pointer glow", token: "shadow-glow-signal", ground: "bg-paper", tile: "bg-signal shadow-glow-signal", use: "Pointer only" },
];

export function ScaleSection() {
  return (
    <>
      <div className="grid gap-x-8 gap-y-8 lg:grid-cols-2">
        <Block title="Space" note="A 4px grid. Tailwind steps map one to one.">
          <Table size="sm" aria-label="Space scale">
            <TableHeader>
              <TableColumn id="step" isRowHeader className="w-32">
                Step
              </TableColumn>
              <TableColumn id="px" className="w-16">
                Size
              </TableColumn>
              <TableColumn id="visual">Scale</TableColumn>
            </TableHeader>
            <TableBody>
              {SPACE.map((s) => (
                <TableRow key={s.step} id={s.step}>
                  <TableCell className="py-2!">
                    <Code>{s.step}</Code>
                  </TableCell>
                  <TableCell className="py-2! tabular-nums">{s.px}px</TableCell>
                  <TableCell className="py-2!">
                    <span className="flex flex-col gap-1">
                      <span aria-hidden className="block h-3 rounded-xs bg-accent-300" style={{ width: s.px * 2 }} />
                      <span className="text-body-2-regular text-text-secondary max-sm:hidden">{s.use}</span>
                    </span>
                  </TableCell>
                </TableRow>
              ))}
              {SIZES.map((s) => (
                <TableRow key={s.name} id={s.name}>
                  <TableCell className="py-2! max-sm:whitespace-normal">{s.name}</TableCell>
                  <TableCell className="py-2! tabular-nums">{s.px}px</TableCell>
                  <TableCell className="py-2!">
                    <span className="flex flex-col gap-1">
                      <span aria-hidden className="block h-3 rounded-xs bg-accent-600" style={{ width: s.px * 2 }} />
                      <span className="text-body-2-regular text-text-secondary max-sm:hidden">{s.use}</span>
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Block>

        <Block title="Radius" note="Small corners for fields, large for sheets. The notch only rounds its bottom edge.">
          <Table size="sm" aria-label="Radius scale">
            <TableHeader>
              <TableColumn id="name" isRowHeader>
                Name
              </TableColumn>
              <TableColumn id="value" className="w-20">
                Value
              </TableColumn>
              <TableColumn id="visual" className="w-24">
                Shape
              </TableColumn>
            </TableHeader>
            <TableBody>
              {RADII.map((r) => {
                const notch = r.name.startsWith("Notch");
                return (
                  <TableRow key={r.name} id={r.name}>
                    <TableCell className="py-2!">
                      <span className="block text-text-primary">{r.name}</span>
                      <span className="block text-body-2-regular text-text-secondary max-sm:hidden">{r.use}</span>
                    </TableCell>
                    <TableCell className="py-2! tabular-nums">{r.value}</TableCell>
                    <TableCell className="py-2!">
                      <span
                        aria-hidden
                        className={cx("block h-10 w-16", notch ? "bg-notch" : "border-2 border-accent-600 bg-box-fill")}
                        style={
                          notch
                            ? { borderBottomLeftRadius: r.radius, borderBottomRightRadius: r.radius }
                            : { borderRadius: r.radius }
                        }
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Block>
      </div>

      <Block title="Elevation" note="Shadows are tokens. Black speaks with a keyline, paper lifts with a soft shadow.">
        <Table size="sm" aria-label="Elevation tokens">
          <TableHeader>
            <TableColumn id="name" isRowHeader>
              Name
            </TableColumn>
            <TableColumn id="token" className="max-md:hidden">
              Token
            </TableColumn>
            <TableColumn id="use" className="max-lg:hidden">
              What it does
            </TableColumn>
            <TableColumn id="specimen" className="w-48 max-sm:w-32">
              Specimen
            </TableColumn>
          </TableHeader>
          <TableBody>
            {ELEVATION.map((e) => (
              <TableRow key={e.id} id={e.id}>
                <TableCell className="py-3! align-middle!">{e.name}</TableCell>
                <TableCell className="py-3! align-middle! max-md:hidden">
                  <Code>{e.token}</Code>
                </TableCell>
                <TableCell className="py-3! align-middle! max-lg:hidden">
                  <span className="text-body-2-regular text-text-secondary">{e.use}</span>
                </TableCell>
                <TableCell className="py-3! align-middle!">
                  <span className={cx("flex h-20 justify-center rounded-lg", e.id.startsWith("notch") ? "items-start" : "items-center", e.ground)}>
                    <span
                      aria-hidden
                      className={cx(e.tile, e.id === "glow" ? "size-4 rounded-full" : "h-10 w-28 max-sm:w-16", e.id.startsWith("notch") ? "rounded-b-2xl" : e.id === "card-paper" ? "rounded-card" : "")}
                    />
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
