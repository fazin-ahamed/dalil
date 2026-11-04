"use client";

import { Table, TableBody, TableCell, TableColumn, TableHeader, TableRow } from "@/components/base/table/table";
import { cx } from "@/utils/cx";
import { Block, Code } from "./section";

type Face = "ink" | "sans" | "mono";

interface Specimen {
  id: string;
  face: Face;
  family: string;
  weight: 300 | 400 | 500 | 600 | 700;
  size: number;
  text: string;
  role: string;
}

const FACE_CLASS: Record<Face, string> = {
  ink: "font-ink",
  sans: "font-sans",
  mono: "font-mono",
};

const WEIGHT_CLASS: Record<Specimen["weight"], string> = {
  300: "font-light",
  400: "font-normal",
  500: "font-medium",
  600: "font-semibold",
  700: "font-bold",
};

const SPECIMENS: Specimen[] = [
  { id: "g700", face: "ink", family: "Gaegu", weight: 700, size: 30, text: "Add the place values", role: "Card heading" },
  { id: "g400", face: "ink", family: "Gaegu", weight: 400, size: 26, text: "32 + 8 + 4 + 1 = 45", role: "Worked line and box numbers" },
  { id: "g300", face: "ink", family: "Gaegu", weight: 300, size: 20, text: "Multiply each digit by its place", role: "Card subtitle" },
  { id: "o600", face: "sans", family: "Onest", weight: 600, size: 22, text: "Evening, FSquare.", role: "Notch greeting" },
  { id: "o500", face: "sans", family: "Onest", weight: 500, size: 16, text: "What left this computer", role: "Panel title" },
  { id: "o400", face: "sans", family: "Onest", weight: 400, size: 14, text: "Hold Ctrl + Alt and ask what's on your screen.", role: "Body and hints" },
  { id: "m500", face: "mono", family: "Geist Mono", weight: 500, size: 13, text: "api.example.com", role: "Hosts" },
  { id: "m400", face: "mono", family: "Geist Mono", weight: 400, size: 13, text: "https://api.example.com/v1", role: "URLs, keys and model ids" },
];

const UI_SCALE = [
  { size: 12, use: "Title strips and captions", text: "from decimal" },
  { size: 13, use: "Pointer labels and table cells", text: "Step 2 of 5" },
  { size: 14, use: "Body and helper lines", text: "Waiting for your click" },
  { size: 16, use: "Panel titles", text: "Connect an AI endpoint to begin." },
  { size: 18, use: "Section headings", text: "Notch settings" },
  { size: 22, use: "The notch greeting", text: "Evening, FSquare." },
];

const INK_SCALE = [
  { size: 20, use: "Card subtitle", text: "Multiply each digit by its place" },
  { size: 26, use: "Worked lines, box numbers, wordmark", text: "5 × 8 = 40" },
  { size: 30, use: "Card heading", text: "Add the place values" },
  { size: 44, use: "Large numerals", text: "45" },
];

function Sample({ face, weight, size, children }: { face: Face; weight: Specimen["weight"]; size: number; children: string }) {
  return (
    <span
      className={cx("block max-w-full text-ink wrap-break-word", FACE_CLASS[face], WEIGHT_CLASS[weight])}
      style={{ fontSize: size, lineHeight: 1.25 }}
    >
      {children}
    </span>
  );
}

export function TypeSection() {
  return (
    <>
      <Block title="Faces and weights" note="Gaegu is the guide's hand, Onest is the system voice, Geist Mono is for anything you could paste.">
        <Table size="sm" aria-label="Faces and weights">
          <TableHeader>
            <TableColumn id="face" isRowHeader className="w-44 max-sm:w-28">
              Face
            </TableColumn>
            <TableColumn id="specimen">Specimen</TableColumn>
            <TableColumn id="use" className="max-lg:hidden">
              Use
            </TableColumn>
          </TableHeader>
          <TableBody>
            {SPECIMENS.map((s) => (
              <TableRow key={s.id} id={s.id}>
                <TableCell className="py-3! align-middle!">
                  <span className="block text-body-medium text-text-primary">
                    {s.family} {s.weight}
                  </span>
                  <span className="block text-body-2-regular tabular-nums text-text-secondary">{s.size}px</span>
                </TableCell>
                <TableCell className="py-3! align-middle!">
                  <Sample face={s.face} weight={s.weight} size={s.size}>
                    {s.text}
                  </Sample>
                </TableCell>
                <TableCell className="py-3! align-middle! max-lg:hidden">
                  <span className="text-body-2-regular text-text-secondary">{s.role}</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Block>

      <div className="flex flex-col gap-8">
        <Block title="UI scale" note="Onest. Labels, table heads and captions sit one step smaller, in sentence case, with no tracking.">
          <Table size="sm" aria-label="UI size scale">
            <TableHeader>
              <TableColumn id="size" isRowHeader className="w-16">
                Size
              </TableColumn>
              <TableColumn id="use">Use</TableColumn>
              <TableColumn id="sample" className="max-sm:hidden">
                Sample
              </TableColumn>
            </TableHeader>
            <TableBody>
              {UI_SCALE.map((r) => (
                <TableRow key={r.size} id={`ui-${r.size}`}>
                  <TableCell className="py-2.5! tabular-nums">
                    <Code>{r.size}</Code>
                  </TableCell>
                  <TableCell className="py-2.5!">
                    {r.use}
                    <span className="mt-1 block sm:hidden">
                      <Sample face="sans" weight={500} size={r.size}>
                        {r.text}
                      </Sample>
                    </span>
                  </TableCell>
                  <TableCell className="py-2.5! max-sm:hidden">
                    <Sample face="sans" weight={500} size={r.size}>
                      {r.text}
                    </Sample>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Block>

        <Block title="Ink scale" note="Gaegu. Only on paper. Figures use tabular numerals everywhere.">
          <Table size="sm" aria-label="Ink size scale">
            <TableHeader>
              <TableColumn id="size" isRowHeader className="w-16">
                Size
              </TableColumn>
              <TableColumn id="use">Use</TableColumn>
              <TableColumn id="sample" className="max-sm:hidden">
                Sample
              </TableColumn>
            </TableHeader>
            <TableBody>
              {INK_SCALE.map((r) => (
                <TableRow key={r.size} id={`ink-${r.size}`}>
                  <TableCell className="py-2.5! tabular-nums">
                    <Code>{r.size}</Code>
                  </TableCell>
                  <TableCell className="py-2.5!">
                    {r.use}
                    <span className="mt-1 block sm:hidden">
                      <Sample face="ink" weight={r.size === 30 ? 700 : 400} size={r.size}>
                        {r.text}
                      </Sample>
                    </span>
                  </TableCell>
                  <TableCell className="py-2.5! max-sm:hidden">
                    <Sample face="ink" weight={r.size === 30 ? 700 : 400} size={r.size}>
                      {r.text}
                    </Sample>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Block>
      </div>
    </>
  );
}
