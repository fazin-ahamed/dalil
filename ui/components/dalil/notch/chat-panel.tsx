"use client";

import { useEffect, useRef, useState } from "react";
import { Focusable, TextArea } from "react-aria-components";
import { RiAddLine, RiArrowUpLine, RiBookOpenLine, RiCheckLine, RiCloseLine, RiFileCopyLine, RiGlobalLine, RiKeyboardLine, RiLoader4Line, RiMacbookLine, RiMicLine, RiSettings3Line, RiStopCircleLine, RiSubtractLine, RiCursorLine } from "@remixicon/react";
import { Accordion, AccordionItem } from "@/components/base/accordion/accordion";
import { Button } from "@/components/base/buttons/button";
import { IconButton } from "@/components/base/buttons/icon-button";
import { TextField } from "@/components/base/input/input";
import { Tooltip, TooltipTrigger } from "@/components/base/tooltip/tooltip";
import { ScrollFade, useScrollFade } from "@/components/foundations/scroll-fade/scroll-fade";
import { BrandMark } from "@/components/dalil/brand-mark";
import type { AgentTask, WebSource } from "@/lib/contracts";
import type { DesktopShortcut } from "@/lib/native-bridge";
import type { ChatBubble } from "./notch";
import { MessageText, ExternalLink } from "./message-text";
import { cx } from "@/utils/cx";

export interface ChatPanelData {
  draft: string;
  busy: boolean;
  messages: ChatBubble[];
  error: string | null;
  contextLabel?: string;
  tasks?: AgentTask[];
  searchEnabled?: boolean;
  computerEnabled?: boolean;
  screenEnabled?: boolean;
  screenChanging?: boolean;
  computerSupported?: boolean;
  computerReason?: string;
  shortcuts?: DesktopShortcut[];
}
export interface ChatPanelActions {
  onDraft?: (value: string) => void;
  onSubmit?: (value: string) => void;
  onTalk?: () => void;
  onSearchToggle?: () => void;
  onComputerToggle?: () => void;
  onScreenToggle?: () => void;
  onStopTask?: (id: string) => void;
  onNewChat?: () => void;
  onDismiss?: () => void;
  onSetup?: () => void;
  onShowVisual?: (taskId: string) => void;
}
const QUIET = "border-transparent bg-transparent shadow-none text-notch-muted hover:bg-notch-raised-2 hover:text-notch-ink focus-visible:ring-offset-notch";

function Sources({ sources }: { sources: WebSource[] }) {
  return <div className="flex flex-wrap gap-1.5" aria-label="Sources">
    {sources.map((source, i) => <ExternalLink key={source.url} href={source.url} title={source.title}
      className="flex max-w-full items-center gap-1.5 rounded-lg border border-notch-rule bg-notch-raised px-2 py-1 text-caption-1-medium text-notch-ink-2 hover:bg-notch-raised-2 focus-visible:ring-2 focus-visible:ring-border-focus-ring">
      <RiGlobalLine aria-hidden className="size-3 shrink-0 text-notch-accent" /><span className="truncate">{i + 1}. {new URL(source.url).hostname.replace(/^www\./, "")}</span>
    </ExternalLink>)}
  </div>;
}

function TaskSteps({ task }: { task: AgentTask }) {
  if (!task.activities.length) return null;
  const current = task.activities.at(-1)!;
  const running = task.status === "running";
  return <Accordion className="w-full" key={running ? "running" : "settled"} defaultExpandedKeys={running ? ["activity"] : []}>
    <AccordionItem id="activity" icon={running ? RiLoader4Line : task.status === "done" ? RiCheckLine : RiStopCircleLine}
      title={<span className="text-caption-1-medium text-notch-muted">{running ? current.label : `${task.activities.length} activity ${task.activities.length === 1 ? "step" : "steps"}`}</span>}>
      <ol className="flex flex-col gap-2 border-s border-notch-rule ps-3 text-caption-1-medium text-notch-muted">
        {task.activities.map((activity, i) => <li key={i} className="flex items-start gap-2">
          {activity.status === "running" && running ? <RiLoader4Line aria-hidden className="mt-0.5 size-3.5 shrink-0 animate-spin motion-reduce:animate-none" />
            : activity.status === "error" ? <RiCloseLine aria-hidden className="mt-0.5 size-3.5 shrink-0 text-notch-error" />
              : activity.status === "running" && task.status !== "done" ? <RiStopCircleLine aria-hidden className="mt-0.5 size-3.5 shrink-0" /> : <RiCheckLine aria-hidden className="mt-0.5 size-3.5 shrink-0" />}
          <span className="min-w-0 [overflow-wrap:anywhere]">{activity.label}</span>
        </li>)}
      </ol>
    </AccordionItem>
  </Accordion>;
}

function AssistantMessage({ message, task, onStop, onFollowUp, onShowVisual }: { message: ChatBubble; task?: AgentTask; onStop?: () => void; onFollowUp?: (text: string) => void; onShowVisual?: () => void }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText([message.text, ...(message.steps ?? []).map((step, i) => `${i + 1}. ${step}`)].join("\n\n"));
      setCopied(true);
      setCopyError(false);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1800);
    } catch { setCopyError(true); }
  };
  return <article className="flex min-w-0 flex-col gap-2 py-2" aria-label="Dalil reply">
    <div className="flex items-center gap-2 text-caption-1-semibold text-notch-ink"><BrandMark className="size-4 text-notch-accent" />Dalil
      {message.status === "running" && <span role="status" className="ms-auto flex items-center gap-1.5 text-caption-1-medium text-notch-muted"><span className="size-1.5 rounded-full bg-notch-accent motion-safe:animate-pulse" />Working</span>}
    </div>
    <div className="min-w-0 ps-6">
      {task && <TaskSteps task={task} />}
      {message.text && <MessageText text={message.text} />}
      {!!message.steps?.length && <ol className="mt-3 flex list-decimal flex-col gap-2 ps-5 text-body-regular text-notch-ink-2 marker:text-notch-accent">
        {message.steps.map((step, i) => <li key={i}><MessageText text={step} /></li>)}
      </ol>}
      {!!message.sources?.length && <div className="mt-3"><Sources sources={message.sources} /></div>}
      {message.scene && <Button size="xs" variant="secondary" leadingIcon={RiBookOpenLine} onClick={onShowVisual} className="mt-3">{message.scene.type === "diagram" ? "Show diagram" : "Show 3D model"}</Button>}
      {message.status === "running" ? <Button size="xs" variant="ghost" leadingIcon={RiStopCircleLine} onClick={onStop} className={cx(QUIET, "mt-2")}>Stop task</Button>
        : message.status !== "error" && message.status !== "stopped" && message.text && <div className="mt-3 flex flex-wrap items-center gap-1">
          <IconButton icon={copied ? RiCheckLine : RiFileCopyLine} size="small" aria-label={copied ? "Copied reply" : "Copy reply"} className={QUIET} onClick={() => void copy()} />
          <Button size="xs" variant="ghost" onClick={() => onFollowUp?.(`Explain that with a concrete example: ${task?.question ?? message.text.slice(0, 160)}`)} className={QUIET}>Give an example</Button>
          <Button size="xs" variant="ghost" onClick={() => onFollowUp?.(`Explain this more simply, with a different analogy: ${task?.question ?? message.text.slice(0, 160)}`)} className={QUIET}>Simpler</Button>
          {copyError && <span role="status" className="text-caption-1-medium text-notch-warn">Select the text to copy it.</span>}
        </div>}
    </div>
  </article>;
}

export function ChatPanel({ data, active, actions }: { data: ChatPanelData; active: boolean; actions: ChatPanelActions }) {
  const input = useRef<HTMLTextAreaElement>(null);
  const thread = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const fade = useScrollFade();
  const tasks = data.tasks ?? [];
  const running = tasks.filter((task) => task.status === "running");
  const canSend = Boolean(data.draft.trim()) && !data.screenChanging && running.length < 4 && !(data.computerEnabled && data.busy) && !running.some((task) => task.computer);
  const empty = data.messages.length === 0;
  useEffect(() => {
    if (!active) return;
    const frame = requestAnimationFrame(() => input.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [active]);
  useEffect(() => {
    const el = thread.current;
    if (el && nearBottom.current) el.scrollTo({ top: el.scrollHeight });
  }, [data.messages, data.tasks, data.error]);
  const send = () => { if (canSend) { nearBottom.current = true; actions.onSubmit?.(data.draft.trim()); } };
  const suggest = (text: string) => { actions.onDraft?.(text); input.current?.focus(); };

  return <div className="pointer-events-auto flex w-134 max-w-full flex-col px-4 pb-4 pt-3">
    <header className="flex items-center gap-2 border-b border-notch-rule pb-3">
      <div className="grid size-8 place-items-center rounded-xl border border-notch-rule bg-notch-raised"><BrandMark className="size-4 text-notch-accent" /></div>
      <div className="min-w-0 flex-1"><p className="text-body-medium text-notch-ink">Dalil</p><p className="truncate text-caption-1-medium text-notch-muted">{running.length ? `${running.length} ${running.length === 1 ? "task" : "tasks"} working in the background` : "A little clarity, right here."}</p></div>
      {active && !!data.shortcuts?.length && <TooltipTrigger delay={200}>
        <Focusable><IconButton icon={RiKeyboardLine} size="small" aria-label="Windows keyboard shortcuts" className={QUIET} /></Focusable>
        <Tooltip className="dark max-w-80" placement="bottom end">
          <div className="flex flex-col gap-3 py-1">
            {data.shortcuts.map((shortcut) => <div key={shortcut.command} className="flex flex-col gap-0.5">
              <span>{shortcut.label}</span><kbd className="font-mono text-caption-1-medium text-text-secondary">{shortcut.keys.replaceAll("+", " + ")}</kbd>
              {!shortcut.registered && <span className="text-text-error-primary">Unavailable; use the tray menu.</span>}
            </div>)}
            <p className="border-t border-separator-border pt-2 text-text-secondary">Right-click the tray icon for Settings and Exit.</p>
          </div>
        </Tooltip>
      </TooltipTrigger>}
      <IconButton icon={RiAddLine} size="small" aria-label="New conversation" className={QUIET} disabled={data.busy} onClick={actions.onNewChat} />
      <IconButton icon={RiSettings3Line} size="small" aria-label="Chat settings" className={QUIET} onClick={actions.onSetup} />
      <IconButton icon={RiSubtractLine} size="small" aria-label="Hide chat, keep tasks running" className={QUIET} onClick={actions.onDismiss} />
    </header>

    <div className="relative min-h-0">
      <div ref={thread} role="log" aria-label="Conversation" aria-live="polite"
        onScroll={(event) => { fade.onScroll(event); const el = event.currentTarget; nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }}
        className="flex max-h-[min(350px,calc(100dvh-15rem))] min-h-48 flex-col gap-4 overflow-y-auto overscroll-contain py-4 pe-1 select-text">
        {empty && <div className="flex flex-col gap-4 py-3">
          <div className="px-2"><p className="text-title-3-semibold text-notch-ink">What are we working on?</p><p className="mt-1 text-body-regular text-notch-muted">Understand what’s on screen, find an answer, or hand over a task.</p></div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { icon: RiBookOpenLine, label: "Explain what’s here", text: "Explain what is on my screen, how it works, and show me a concrete example." },
              { icon: RiGlobalLine, label: "Find an answer", text: "Search the web for " },
              { icon: RiCursorLine, label: "Help me do it", text: "Help me complete this task: " },
              { icon: RiMacbookLine, label: "Walk me through it", text: "Walk me through what I should do next and explain why each step matters." },
            ].map(({ icon, label, text }) => <Button key={label} leadingIcon={icon} variant="secondary" size="small" onClick={() => suggest(text)}
              className="h-11 justify-start rounded-xl border-notch-rule bg-notch-raised text-caption-1-medium text-notch-ink-2 hover:bg-notch-raised-2">{label}</Button>)}
          </div>
        </div>}
        {data.messages.map((message, i) => message.role === "user"
          ? <p key={message.taskId ?? i} dir="auto" className="ms-auto max-w-[90%] whitespace-pre-wrap rounded-2xl rounded-ee-md border border-notch-rule bg-notch-raised-2 px-3.5 py-2.5 text-body-regular text-notch-ink [overflow-wrap:anywhere]">{message.text}</p>
          : <AssistantMessage key={`${message.taskId ?? i}-reply`} message={message} task={tasks.find((task) => task.id === message.taskId)} onStop={() => message.taskId && actions.onStopTask?.(message.taskId)} onFollowUp={suggest} onShowVisual={() => message.taskId && actions.onShowVisual?.(message.taskId)} />)}
        {data.error && <p role="alert" className="rounded-xl border border-notch-rule bg-notch-raised px-3 py-2.5 text-body-regular text-notch-error">{data.error}</p>}
      </div>
      <ScrollFade progress={fade.progress} surfaceClassName="from-notch" />
    </div>

    {data.contextLabel && <p className="mb-2 flex items-center gap-1.5 truncate px-1 text-caption-1-medium text-notch-muted"><RiMacbookLine aria-hidden className="size-3.5 shrink-0" />{data.contextLabel}</p>}
    <div className="rounded-2xl border border-notch-rule bg-notch-raised p-2 focus-within:ring-2 focus-within:ring-border-focus-ring">
      <TextField value={data.draft} onChange={actions.onDraft} aria-label="Ask Dalil" className="w-full">
        <TextArea ref={input} rows={2} placeholder={data.computerEnabled ? "What should I do on your computer?" : "Ask anything, or give me a task…"}
          className="max-h-28 min-h-14 w-full resize-none border-0 bg-transparent px-2 py-1 text-body-regular text-notch-ink outline-none placeholder:text-notch-muted"
          onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }} />
      </TextField>
      <div className="flex items-center gap-1">
        <Button size="xs" variant="ghost" leadingIcon={RiMacbookLine} aria-pressed={Boolean(data.screenEnabled)} onClick={actions.onScreenToggle} disabled={data.screenChanging}
          title="Share a screenshot with the configured model for new tasks"
          className={cx("rounded-lg", data.screenEnabled ? "bg-notch-raised-2 text-notch-accent" : "bg-transparent text-notch-muted hover:bg-notch-raised-2")}>Screen</Button>
        <Button size="xs" variant="ghost" leadingIcon={RiGlobalLine} aria-pressed={Boolean(data.searchEnabled)} onClick={actions.onSearchToggle}
          className={cx("rounded-lg", data.searchEnabled ? "bg-notch-raised-2 text-notch-accent" : "bg-transparent text-notch-muted hover:bg-notch-raised-2")}>Search</Button>
        <Button size="xs" variant="ghost" leadingIcon={RiCursorLine} aria-pressed={Boolean(data.computerEnabled)} onClick={actions.onComputerToggle}
          title={data.computerReason} aria-describedby="computer-requirements" disabled={!data.computerSupported}
          className={cx("rounded-lg", data.computerEnabled ? "bg-notch-raised-2 text-notch-accent" : "bg-transparent text-notch-muted hover:bg-notch-raised-2")}>Control</Button>
        <span id="computer-requirements" className="sr-only">{data.computerReason}</span>
        <div className="ms-auto flex items-center gap-1">
          <IconButton icon={RiMicLine} size="small" aria-label="Talk to Dalil" className={QUIET} onClick={actions.onTalk} />
          <Button iconOnly size="small" leadingIcon={RiArrowUpLine} aria-label="Send message" disabled={!canSend} onClick={send} className="size-8 rounded-xl" />
        </div>
      </div>
    </div>
    <footer className="mt-2 flex items-center justify-between gap-2 px-1 text-caption-1-medium text-notch-muted">
      <span>{data.computerEnabled ? "Computer control on · 12 actions max" : data.screenEnabled ? "Screen context on" : "Screen context off"}</span>
      <span>{running.length ? "Hide chat to keep working" : "Shift + Enter for a new line"}</span>
    </footer>
  </div>;
}
