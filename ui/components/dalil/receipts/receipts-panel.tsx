"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  RiArrowRightSLine,
  RiCheckLine,
  RiFileCopyLine,
  RiMacbookLine,
  RiServerLine,
} from "@remixicon/react";
import { Chip } from "@/components/base/badges/chip";
import { Button } from "@/components/base/buttons/button";
import {
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from "@/components/base/table/table";
import { NotchPanel } from "@/components/dalil/notch-panel";
import copy from "@/lib/copy.json";
import { cx } from "@/utils/cx";
import { redactionTotal, shortHash } from "./sample-data";
import type { ReceiptIncluded, ReceiptRow } from "./sample-data";

/** Strings the shared copy file does not have yet. Listed in the task report. */
const LOCAL = {
  sample: "Sample",
  controls: "Controls",
  controlsLong: copy.receipts.included.visible_controls,
  size: "Size",
  redactions: "Redactions",
  details: "Details",
  copyJson: "Copy as JSON",
  copied: "Copied",
  copyFailed: "Copy failed",
  copyHash: "Copy hash",
  payloadHash: "Payload hash",
  categories: "Categories sent",
  redactedByType: "Redacted by type",
  none: "None",
  footer: "Full payloads are not stored unless Keep payloads for debugging is on.",
  sampleNote: "Sample rows, for layout only.",
};

const INCLUDED_LABEL: Record<ReceiptIncluded, string> = {
  question: copy.receipts.included.question,
  controls: LOCAL.controls,
  screenshot: copy.receipts.included.screenshot,
  context: "Text context",
};

const INCLUDED_LONG: Record<ReceiptIncluded, string> = {
  question: copy.receipts.included.question,
  controls: LOCAL.controlsLong,
  screenshot: copy.receipts.included.screenshot,
  context: "Text context",
};

/** Grows the 32px ghost button to a 44px hit area without changing how it looks. */
const HIT_44 = "relative overflow-visible after:absolute after:-inset-1.5 after:content-['']";

/** Quiet raised-glass look for small icon buttons inside the notch, instead of the ghost accent tint. */
const QUIET = "bg-background-secondary-default! text-foreground-icon-secondary! hover:bg-background-secondary-hover! hover:text-foreground-icon-primary!";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Resets a short-lived flag after a delay, cancelling the previous timer when it re-fires. */
function useFlash(ms = 1600) {
  const [value, setValue] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const flash = useCallback(
    (v: string) => {
      setValue(v);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setValue(null), ms);
    },
    [ms],
  );
  return [value, flash] as const;
}

export function ReceiptStatusLine({ host }: { host: string | null }) {
  const Icon = host ? RiServerLine : RiMacbookLine;
  return (
    <p className="flex min-h-6 items-center gap-2 text-body-regular text-text-secondary">
      <Icon className="size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
      {host ? <span className="font-mono text-body-2-regular text-text-primary">{host}</span> : copy.setup.disclosure.local}
    </p>
  );
}

function IncludedChips({ items, long = false }: { items: ReceiptIncluded[]; long?: boolean }) {
  return (
    <span className="flex flex-wrap gap-1">
      {items.map((i) => (
        <Chip key={i} variant="caption" color={i === "screenshot" ? "blue" : "neutral"}>
          {(long ? INCLUDED_LONG : INCLUDED_LABEL)[i]}
        </Chip>
      ))}
    </span>
  );
}

function DetailList({ row }: { row: ReceiptRow }) {
  const [flash, setFlash] = useFlash();
  const redactions = Object.entries(row.redactions);
  return (
    <dl className="grid gap-x-6 gap-y-3 py-1 sm:grid-cols-3">
      <div className="min-w-0">
        <dt className="text-body-2-medium text-text-tertiary">{LOCAL.payloadHash}</dt>
        <dd className="mt-1 flex items-center gap-1">
          <span className="whitespace-nowrap font-mono text-body-2-regular text-text-primary" title={row.hash}>
            {shortHash(row.hash)}
          </span>
          <Button
            variant="ghost"
            size="small"
            iconOnly
            aria-label={LOCAL.copyHash}
            leadingIcon={flash === "hash" ? RiCheckLine : RiFileCopyLine}
            className={cx(HIT_44, QUIET)}
            onClick={async () => setFlash((await copyText(row.hash)) ? "hash" : "fail")}
          />
          <span role="status" className="sr-only">
            {flash === "hash" ? LOCAL.copied : flash === "fail" ? LOCAL.copyFailed : ""}
          </span>
        </dd>
      </div>
      {row.model && <div className="min-w-0"><dt className="text-body-2-medium text-text-tertiary">Model</dt><dd className="mt-1 break-words text-body-regular text-text-primary">{row.model}</dd></div>}
      <div className="min-w-0">
        <dt className="text-body-2-medium text-text-tertiary">{LOCAL.categories}</dt>
        <dd className="mt-1 text-body-regular text-text-primary">
          {row.included.map((i) => INCLUDED_LONG[i]).join(", ")}
        </dd>
      </div>
      <div className="min-w-0">
        <dt className="text-body-2-medium text-text-tertiary">{LOCAL.redactedByType}</dt>
        <dd className="mt-1 text-body-regular text-text-primary tabular-nums">
          {redactions.length === 0
            ? LOCAL.none
            : redactions.map(([k, n]) => `${k.charAt(0).toUpperCase()}${k.slice(1)} ${n}`).join(", ")}
        </dd>
      </div>
    </dl>
  );
}

export interface ReceiptsPanelProps {
  rows: ReceiptRow[];
  /** Host shown in the status line. Null means the endpoint is on this computer. */
  host: string | null;
  /** Row ids that start expanded. */
  defaultExpanded?: string[];
  className?: string;
  sample?: boolean;
}

/** The Receipts surface: what left this computer, one row per request. */
export function ReceiptsPanel({ rows, host, defaultExpanded = [], className, sample = true }: ReceiptsPanelProps) {
  const [open, setOpen] = useState<Set<string>>(() => new Set(defaultExpanded));
  const [flash, setFlash] = useFlash();

  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const asJson = () =>
    JSON.stringify(
      {
        sample,
        requests: rows.map((r) => ({
          time: r.time,
          createdAt:r.createdAt,
          model:r.model,
          host: r.host,
          included: r.included.map((i) => INCLUDED_LONG[i]),
          sizeKb: r.sizeKb,
          redactions: r.redactions,
          payloadHash: r.hash,
        })),
      },
      null,
      2,
    );

  const empty = rows.length === 0;

  return (
    <NotchPanel className={cx("flex flex-col gap-4 p-4 pb-5 sm:p-5 sm:pb-6", className)}>
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h2 className="flex min-h-9 items-center gap-2 text-headline-semibold text-text-primary">
            {copy.receipts.title}
            {sample && <Chip variant="caption" color="soft">{LOCAL.sample}</Chip>}
          </h2>
          <Button
            variant="secondary"
            size="medium"
            leadingIcon={flash === "json" ? RiCheckLine : RiFileCopyLine}
            disabled={empty}
            onClick={async () => flash === null && setFlash((await copyText(asJson())) ? "json" : "fail")}
          >
            {flash === "json" ? LOCAL.copied : flash === "fail" ? LOCAL.copyFailed : LOCAL.copyJson}
          </Button>
        </div>
        <ReceiptStatusLine host={empty ? null : host} />
      </header>

      {empty ? (
        <p className="flex min-h-32 items-center justify-center border-y border-separator-border px-4 text-center text-body-medium text-text-secondary">
          {copy.receipts.empty}
        </p>
      ) : (
        <div className="-mx-4 sm:-mx-5">
          <Table size="sm" aria-label={sample ? `${copy.receipts.title}. ${LOCAL.sampleNote}` : "Request receipts"} containerClassName="px-2">
            <TableHeader>
              <TableColumn id="expand" isRowHeader={false} className="w-11 px-1.5!">
                <span className="sr-only">{LOCAL.details}</span>
              </TableColumn>
              <TableColumn id="when" isRowHeader className="px-1.5!">
                {copy.receipts.columns.when}
              </TableColumn>
              <TableColumn id="host" className="px-1.5! max-sm:hidden">
                {copy.receipts.columns.sent_to}
              </TableColumn>
              <TableColumn id="included" className="px-1.5!">
                {copy.receipts.columns.included}
              </TableColumn>
              <TableColumn id="size" className="px-1.5! text-end! max-sm:hidden">
                {LOCAL.size}
              </TableColumn>
              <TableColumn id="redactions" className="px-1.5! text-end! max-sm:hidden">
                {LOCAL.redactions}
              </TableColumn>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const isOpen = open.has(r.id);
                const detailId = `receipt-detail-${r.id}`;
                return (
                  <Fragment key={r.id}>
                    <TableRow id={r.id} className={cx(isOpen && "border-b-0!")}>
                      <TableCell className="px-1.5! py-1!">
                        <Button
                          variant="ghost"
                          size="small"
                          iconOnly
                          aria-label={isOpen ? copy.aria.icon_buttons.collapse_receipt : copy.aria.icon_buttons.expand_receipt}
                          aria-expanded={isOpen}
                          aria-controls={isOpen ? detailId : undefined}
                          leadingIcon={RiArrowRightSLine}
                          className={cx(
                            HIT_44,
                            QUIET,
                            "[&_svg]:transition-transform [&_svg]:duration-150 [&_svg]:ease-dalil-out motion-reduce:[&_svg]:transition-none aria-expanded:[&_svg]:rotate-90",
                          )}
                          onClick={() => toggle(r.id)}
                        />
                      </TableCell>
                      <TableCell className="px-1.5! tabular-nums">{r.time}</TableCell>
                      <TableCell className="px-1.5! max-sm:hidden">
                        <span className="block max-w-32 truncate font-mono text-caption-1-regular">{r.host}</span>
                      </TableCell>
                      <TableCell className="px-1.5!">
                        <IncludedChips items={r.included} />
                      </TableCell>
                      <TableCell className="px-1.5! text-end whitespace-nowrap tabular-nums max-sm:hidden">{r.sizeKb.toFixed(1)} KB</TableCell>
                      <TableCell className="px-1.5! text-end tabular-nums max-sm:hidden">{redactionTotal(r)}</TableCell>
                    </TableRow>
                    {isOpen && (
                      <TableRow id={`${r.id}-detail`}>
                        <TableCell colSpan={6} className="bg-background-primary-default px-3! pb-3! pt-1!">
                          <div
                            id={detailId}
                            className="transition-[opacity,transform] duration-200 ease-dalil-out starting:-translate-y-1 starting:opacity-0 motion-reduce:transition-none motion-reduce:starting:translate-y-0"
                          >
                            <DetailList row={r} />
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <footer className="flex flex-col gap-1 text-body-2-regular text-text-tertiary">
        {!empty && (
          <p className="tabular-nums">
            {copy.receipts.footer.replace("{n}", String(rows.length)).replace("{total}", String(rows.length))}
          </p>
        )}
        <p>{sample ? LOCAL.footer : "Stored locally: request time, destination, size and SHA-256 hash. Prompts, screenshots, replies and keys are never saved here. No automatic redaction is performed."}</p>
      </footer>
    </NotchPanel>
  );
}
