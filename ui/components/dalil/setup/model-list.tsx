"use client";

import { ListBox, ListBoxItem } from "react-aria-components";
import { RiCheckLine, RiListCheck2 } from "@remixicon/react";
import { Kbd } from "@/components/base/kbd/kbd";
import { SearchField } from "@/components/base/search-field/search-field";
import { Skeleton } from "@/components/base/skeleton/skeleton";
import { Spinner } from "@/components/base/spinner/spinner";
import { ScrollFade, useScrollFade } from "@/components/foundations/scroll-fade/scroll-fade";
import type { ModelEntry } from "@/lib/endpoint";
import { cx } from "@/utils/cx";
import { copy, fill, local } from "./setup-copy";

/** Above this many models a search field appears (brief section 7). */
export const SEARCH_THRESHOLD = 8;

const SKELETON_WIDTHS = ["58%", "74%", "46%", "66%", "52%"];

/** Rows shaped like the model list, so nothing jumps when the real list arrives. */
export function ModelSkeleton({ host }: { host: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-2.5">
      <p className="flex items-center gap-2 text-body-medium text-text-primary">
        <Spinner size="sm" aria-hidden />
        {fill(copy.setup.connecting, { host })}
      </p>
      <div aria-hidden className="flex flex-col gap-0.5 rounded-xl bg-background-primary-default p-1.5">
        {SKELETON_WIDTHS.map((width, index) => (
          <div key={index} className="flex h-9 items-center ps-2.5">
            <Skeleton shape="text" className="h-3" style={{ width }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Empty state before any fetch. */
export function ModelEmpty({ canFetch }: { canFetch: boolean }) {
  return (
    <p className="flex items-center gap-2 text-body-regular text-text-tertiary">
      <RiListCheck2 className="size-5 shrink-0 text-foreground-icon-tertiary" aria-hidden />
      {canFetch ? (
        <span>
          {local.pressEnterBefore} <Kbd>Enter</Kbd> {local.pressEnterAfter}
        </span>
      ) : (
        copy.setup.empty
      )}
    </p>
  );
}

export interface ModelListProps {
  host: string;
  models: ModelEntry[];
  selected: string | null;
  search: string;
  onSearch(value: string): void;
  onSelect(id: string): void;
}

/** Scrollable single-select listbox. Arrow keys move, Enter or Space picks, ids in Geist Mono. */
export function ModelList({ host, models, selected, search, onSearch, onSelect }: ModelListProps) {
  const fade = useScrollFade();
  const query = search.trim().toLowerCase();
  const shown = query ? models.filter((m) => m.id.toLowerCase().includes(query)) : models;
  const total = models.length;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3 text-body-medium">
        <p className="flex items-center gap-2 text-text-primary">
          <RiCheckLine className="size-5 shrink-0 text-notch-ok" aria-hidden />
          {fill(copy.setup.connected, { host })}
        </p>
        <p className="text-body-regular text-text-tertiary tabular-nums">
          {total === 1 ? copy.setup.models.found_one : fill(copy.setup.models.found_other, { total })}
        </p>
      </div>

      {total > SEARCH_THRESHOLD ? (
        <SearchField
          size="small"
          shape="rounded"
          placeholder={copy.setup.fields.model_search.placeholder}
          aria-label={copy.setup.fields.model_search.label}
          clearLabel={copy.aria.icon_buttons.clear_search}
          value={search}
          onChange={onSearch}
          fieldClassName="font-mono"
        />
      ) : null}

      <div className="relative rounded-xl bg-background-primary-default">
        <ScrollFade progress={fade.progress} surfaceClassName="from-background-primary-default" className="rounded-t-xl" />
        <ListBox
          aria-label={copy.setup.fields.model.label}
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={selected ? [selected] : []}
          onSelectionChange={(keys) => {
            const next = [...keys][0];
            if (next !== undefined) onSelect(String(next));
          }}
          onScroll={fade.onScroll}
          renderEmptyState={() => (
            <p className="px-3 py-4 text-body-regular text-text-tertiary">{copy.setup.models.no_match}</p>
          )}
          className="flex max-h-44 flex-col gap-0.5 overflow-y-auto overscroll-contain p-1.5 outline-none"
        >
          {shown.map((model) => (
            <ListBoxItem
              key={model.id}
              id={model.id}
              textValue={model.id}
              className={({ isSelected, isHovered, isFocusVisible }) =>
                cx(
                  "flex h-9 shrink-0 cursor-pointer items-center gap-2 rounded-lg ps-2.5 pe-2 outline-none",
                  "transition-colors duration-150 ease-out motion-reduce:transition-none",
                  isSelected ? "bg-background-secondary-default text-text-primary" : "text-text-secondary",
                  isHovered && !isSelected && "bg-background-primary-hover text-text-primary",
                  isFocusVisible && "ring-2 ring-inset ring-border-focus-ring",
                )
              }
            >
              {({ isSelected }) => (
                <>
                  <span className="min-w-0 flex-1 truncate font-mono text-caption-1-medium">{model.id}</span>
                  <RiCheckLine
                    aria-hidden
                    className={cx(
                      "size-5 shrink-0 text-notch-accent transition-opacity duration-150 motion-reduce:transition-none",
                      isSelected ? "opacity-100" : "opacity-0",
                    )}
                  />
                </>
              )}
            </ListBoxItem>
          ))}
        </ListBox>
      </div>

      {query && total > SEARCH_THRESHOLD ? (
        <p className="text-caption-1-medium text-text-tertiary tabular-nums" aria-live="polite">
          {fill(copy.setup.models.showing, { n: shown.length, total })}
        </p>
      ) : null}
    </div>
  );
}
