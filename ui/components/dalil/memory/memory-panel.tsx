"use client";

import { useEffect, useId, useMemo, useRef, useState, type ComponentType, type KeyboardEvent, type ReactNode } from "react";
import { RiCheckboxCircleLine, RiComputerLine, RiDeleteBinLine, RiErrorWarningLine, RiQuestionLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { CloseButton } from "@/components/base/buttons/close-button";
import { SearchField } from "@/components/base/search-field/search-field";
import { HintTrigger } from "@/components/dalil/setup/hint-trigger";
import { fill } from "@/components/dalil/setup/setup-copy";
import { ScrollFade, useScrollFade } from "@/components/foundations/scroll-fade/scroll-fade";
import type { Lesson } from "@/lib/contracts";
import copy from "@/lib/copy.json";
import { timeAgo } from "@/lib/time-ago";
import { cx } from "@/utils/cx";
import { useClock } from "./use-clock";

/** Focus ring offset that matches the notch ground instead of BoardUI's white. */
const RING = "ring-offset-background-full";

/** Grows a 32px icon button to a 44px hit area without changing how it looks. */
const HIT_44 = "relative overflow-visible after:absolute after:-inset-1.5 after:content-['']";

/** Quiet icon button on night glass: no fill until it is hovered. */
const QUIET = "bg-transparent text-foreground-icon-secondary hover:bg-background-tertiary-default hover:text-foreground-icon-primary active:bg-background-tertiary-hover";

type Kind = Lesson["kind"];
type IconComponent = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;

/** Icon and token colour per kind. A status is always an icon and a word, never colour alone (brief section 11). */
const KIND: Record<Kind, { Icon: IconComponent; tone: string }> = {
  learned: { Icon: RiCheckboxCircleLine, tone: "text-notch-ok" },
  struggled: { Icon: RiErrorWarningLine, tone: "text-notch-warn" },
  asked: { Icon: RiQuestionLine, tone: "text-text-secondary" },
};

function newestFirst(lessons: Lesson[]): Lesson[] {
  return [...lessons].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

function matches(lesson: Lesson, needle: string): boolean {
  return lesson.topic.toLowerCase().includes(needle) || lesson.note.toLowerCase().includes(needle);
}

interface MemoryRowProps {
  lesson: Lesson;
  now: number | null;
  onForget(): void;
}

function MemoryRow({ lesson, now, onForget }: MemoryRowProps) {
  const { Icon, tone } = KIND[lesson.kind];
  const forgetLabel = fill(copy.memory.forget, { topic: lesson.topic });
  const ago = now === null ? "" : timeAgo(lesson.createdAt, now, copy.memory.time);
  return (
    <li className="flex items-start gap-3 border-t border-separator-border py-3 first:border-t-0">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <p className="min-w-0 break-words text-body-medium text-text-primary">{lesson.topic}</p>
          <span className={cx("flex shrink-0 items-center gap-1 text-caption-1-medium", tone)}>
            <Icon className="size-3.5 shrink-0" aria-hidden />
            {copy.memory.kind[lesson.kind]}
          </span>
        </div>
        <p className="break-words text-body-regular text-text-secondary">{lesson.note}</p>
        <p className="flex min-h-4 flex-wrap items-center gap-x-3 text-caption-1-regular text-text-tertiary">
          {lesson.app ? <span>{fill(copy.memory.in_app, { app: lesson.app })}</span> : null}
          <time dateTime={lesson.createdAt} className="tabular-nums">
            {ago}
          </time>
        </p>
      </div>
      <HintTrigger label={forgetLabel} placement="bottom end">
        <Button
          variant="ghost"
          size="small"
          iconOnly
          leadingIcon={RiDeleteBinLine}
          aria-label={forgetLabel}
          data-forget
          onClick={onForget}
          className={cx(HIT_44, QUIET, RING, "-mt-1.5")}
        />
      </HintTrigger>
    </li>
  );
}

export interface MemoryPanelProps {
  /** Everything Dalil remembers. Shown newest first. */
  lessons: Lesson[];
  /** Removes one lesson by id. The caller owns the data. */
  onForget(id: string): void;
  /** Removes every lesson. Called only after the inline confirm. */
  onClearAll(): void;
  /** Esc, or the close control. */
  onClose(): void;
  /** The search text. Controlled by the caller. */
  query: string;
  onQuery(value: string): void;
}

/**
 * The Memory face of the notch: what Dalil remembers, searchable, one forget button per topic and a
 * two-step "forget everything". It draws whatever the props say, so the live page and the states
 * gallery share it. Keys: Tab moves, Enter or Space forgets the focused topic, Esc closes, and Esc
 * backs out of the forget-everything confirm first.
 */
export function MemoryPanel({ lessons, onForget, onClearAll, onClose, query, onQuery }: MemoryPanelProps) {
  const titleId = useId();
  const confirmId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const forgetAllRef = useRef<HTMLButtonElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const fade = useScrollFade();
  const now = useClock();
  const [asking, setAsking] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  /* Where focus lands once the list changes: the row that took the forgotten row's place, or the section. */
  const landing = useRef<number | "section" | null>(null);
  /* Set when the confirm is cancelled, so focus goes back to the button that opened it. */
  const returnFocus = useRef(false);

  const total = lessons.length;
  const confirming = asking && total > 0;
  const sorted = useMemo(() => newestFirst(lessons), [lessons]);
  const needle = query.trim().toLowerCase();
  const shown = needle ? sorted.filter((lesson) => matches(lesson, needle)) : sorted;
  const countLabel = total === 1 ? copy.memory.count.one : fill(copy.memory.count.other, { total });

  useEffect(() => {
    const target = landing.current;
    if (target === null) return;
    landing.current = null;
    const section = sectionRef.current;
    if (target === "section") {
      section?.focus();
      return;
    }
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>("button[data-forget]");
    if (buttons && buttons.length > 0) buttons[Math.min(target, buttons.length - 1)].focus();
    else section?.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
  }, [lessons]);

  /* The confirm opens on Keep, the safe choice. Cancelling hands focus back to Forget everything. */
  useEffect(() => {
    if (confirming) {
      keepRef.current?.focus();
    } else if (returnFocus.current) {
      returnFocus.current = false;
      forgetAllRef.current?.focus();
    }
  }, [confirming]);

  const cancelAsk = () => {
    returnFocus.current = true;
    setAsking(false);
  };

  const forgetEverything = () => {
    setAsking(false);
    landing.current = "section";
    onClearAll();
    setAnnouncement(copy.memory.forgot_all);
  };

  const forgetOne = (lesson: Lesson, row: number) => {
    landing.current = row;
    setAnnouncement(fill(copy.memory.forgot, { topic: lesson.topic }));
    onForget(lesson.id);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape" || event.defaultPrevented) return;
    event.preventDefault();
    if (confirming) cancelAsk();
    else onClose();
  };

  let body: ReactNode;
  if (total === 0) {
    body = (
      <p className="flex min-h-32 items-center justify-center px-2 text-center text-body-regular text-text-secondary">
        {copy.memory.empty}
      </p>
    );
  } else if (shown.length === 0) {
    body = (
      <div className="flex min-h-32 flex-col items-center justify-center gap-3 px-2 text-center">
        <p className="text-body-regular text-text-secondary">{fill(copy.memory.no_match, { query: query.trim() })}</p>
        <Button variant="secondary" size="small" className={RING} onClick={() => onQuery("")}>
          {copy.memory.show_all}
        </Button>
      </div>
    );
  } else {
    body = (
      <ul ref={listRef} className="flex list-none flex-col p-0">
        {shown.map((lesson, row) => (
          <MemoryRow key={lesson.id} lesson={lesson} now={now} onForget={() => forgetOne(lesson, row)} />
        ))}
      </ul>
    );
  }

  return (
    <section
      ref={sectionRef}
      tabIndex={-1}
      aria-labelledby={titleId}
      onKeyDown={onKeyDown}
      className="flex min-h-0 flex-col outline-none"
    >
      <header className="flex items-start justify-between gap-4 px-5 pt-4 pb-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 id={titleId} className="text-title-3-semibold text-text-primary">
            {copy.memory.title}
          </h2>
          <p className="text-body-regular text-text-secondary">{copy.memory.lead}</p>
        </div>
        <CloseButton aria-label={copy.aria.icon_buttons.close} size="sm" className={RING} onClick={onClose} />
      </header>

      {total > 0 ? (
        <div className="flex flex-col gap-2 px-5 pb-3">
          <SearchField
            size="small"
            shape="rounded"
            placeholder={copy.memory.search.placeholder}
            aria-label={copy.memory.search.label}
            clearLabel={copy.aria.icon_buttons.clear_search}
            value={query}
            onChange={onQuery}
          />
          <p aria-live="polite" className="text-caption-1-medium text-text-tertiary tabular-nums">
            {needle ? fill(copy.memory.showing, { n: shown.length, total }) : countLabel}
          </p>
        </div>
      ) : null}

      <div className="relative flex min-h-0 flex-col">
        <ScrollFade progress={fade.progress} surfaceClassName="from-background-full" />
        <div onScroll={fade.onScroll} className="max-h-80 overflow-y-auto overscroll-contain px-5 [color-scheme:dark]">
          {body}
        </div>
      </div>

      <footer className="flex flex-col gap-3 border-t border-separator-border px-5 py-3">
        <p className="flex items-start gap-2 text-body-regular text-text-secondary">
          <RiComputerLine className="mt-0.5 size-5 shrink-0 text-foreground-icon-secondary" aria-hidden />
          <span>{copy.memory.privacy}</span>
        </p>
        {confirming ? (
          <div className="flex flex-col gap-2.5">
            <p id={confirmId} className="text-body-regular text-text-primary">
              {fill(copy.memory.forget_all.confirm, { total })}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="small"
                leadingIcon={RiDeleteBinLine}
                aria-describedby={confirmId}
                className={cx(RING, "text-text-error-primary")}
                onClick={forgetEverything}
              >
                {copy.memory.forget_all.yes}
              </Button>
              <Button ref={keepRef} variant="secondary" size="small" className={RING} onClick={cancelAsk}>
                {copy.memory.forget_all.keep}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center">
            <Button
              ref={forgetAllRef}
              variant="secondary"
              size="small"
              leadingIcon={RiDeleteBinLine}
              disabled={total === 0}
              className={RING}
              onClick={() => setAsking(true)}
            >
              {copy.memory.forget_all.button}
            </Button>
          </div>
        )}
      </footer>

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}
