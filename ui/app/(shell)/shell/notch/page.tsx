"use client";


import "../shell.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NOTCH_STAGE, Notch, type NotchAction, type NotchEndpoint } from "@/components/dalil/notch";
import { useTutor, type TutorView } from "./use-tutor";
import { LibraryPanel } from "@/components/dalil/notch/library-panel";
import { SetupPanel } from "@/components/dalil/setup/setup-panel";
import { useEndpointSetup } from "@/components/dalil/setup/use-endpoint-setup";
import { desktopShortcuts, onShortcutsChanged, type DesktopShortcut, inputMode, isTauri, loadEndpoint, onCommand, onEndpointChanged, onWindowBlur, saveEndpoint, setInputRect, setInteractive, setKeyboard } from "@/lib/native-bridge";
import { cx } from "@/utils/cx";

const HOVER_OPEN_MS = 200;
const HOVER_CLOSE_MS = 700;
const IDLE_MS = 10_000;
const COMPACT_MS = 1000;
const STAGE_HEIGHT = 640;
const WAKE = { left: (NOTCH_STAGE.w - 132) / 2, w: 132, h: 8, y: 0 };
interface PointerPayload { inside: boolean; x: number; y: number }

async function readUserName(): Promise<string> {
  if (!isTauri()) return "there";
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("user_name");
}

/** Hidden notch leaves a small top-edge target; hovering it or using --ask brings it back. */
export default function NotchWindow() {
  const [view, setView] = useState<"rest" | "home" | "setup" | "projects" | "receipts" | TutorView>("rest");
  const [visibility, setVisibility] = useState<"visible" | "compact" | "hidden">("visible");
  const hidden = visibility === "hidden";
  const [shortcuts, setShortcuts] = useState<DesktopShortcut[]>([]);
  const [endpoint, setEndpoint] = useState<NotchEndpoint | undefined>();
  const [name, setName] = useState("there");
  const [region, setRegion] = useState(false);
  const viewRef = useRef(view);
  const hiddenRef = useRef(hidden);
  const visibilityRef = useRef(visibility);
  const regionRef = useRef(region);
  const rectRef = useRef({ left: WAKE.left, w: 132, h: 30, y: 0 });
  const lastPointer = useRef<PointerPayload | null>(null);
  const overRef = useRef(false);
  const suppressWake = useRef(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const host = useRef<HTMLDivElement>(null);
  const tutor = useTutor(setView);
  const { openAsk, close: closeTutor, toggleTalk, submit, stopComputer } = tutor;

  useEffect(() => { viewRef.current = view; hiddenRef.current = hidden; visibilityRef.current = visibility; regionRef.current = region; });
  useEffect(() => () => { clearTimeout(hideTimer.current); clearTimeout(hoverTimer.current); }, []);
  const hide = useCallback((explicit = true) => {
    clearTimeout(hoverTimer.current);
    clearTimeout(idleTimer.current);
    suppressWake.current = explicit;
    if (visibilityRef.current !== "visible") return;
    visibilityRef.current = "compact";
    setVisibility("compact");
    closeTutor();
    void setKeyboard(false);
    hideTimer.current = setTimeout(() => {
      visibilityRef.current = "hidden";
      hiddenRef.current = true;
      setVisibility("hidden");
    }, COMPACT_MS);
  }, [closeTutor]);
  const reveal = useCallback(() => {
    clearTimeout(hideTimer.current);
    clearTimeout(hoverTimer.current);
    suppressWake.current = false;
    overRef.current = false;
    hiddenRef.current = false;
    visibilityRef.current = "visible";
    setVisibility("visible");
  }, []);
  const resetIdle = useCallback(() => {
    clearTimeout(idleTimer.current);
    if (visibilityRef.current === "visible" && viewRef.current !== "listen" && !tutor.speaking && !tutor.busy) idleTimer.current = setTimeout(() => hide(false), IDLE_MS);
  }, [hide, tutor.speaking, tutor.busy]);

  useEffect(() => {
    resetIdle();
    return () => clearTimeout(idleTimer.current);
  }, [view, visibility, resetIdle]);

  useEffect(() => {
    let alive = true;
    const refresh = () => void loadEndpoint().then((saved) => {
      if (alive) setEndpoint(saved ? { model: saved.model, host: saved.host, local: saved.local } : undefined);
    }).catch(() => {});
    refresh();
    void readUserName().then((value) => alive && setName(value)).catch(() => {});
    let off = () => {};
    void onEndpointChanged(refresh).then((fn) => alive ? (off = fn) : fn());
    void inputMode().then((mode) => alive && setRegion(mode === "region"));
    let offShortcuts = () => {};
    void onShortcutsChanged((bindings) => alive && setShortcuts(bindings)).then((fn) => {
      if (!alive) { fn(); return; }
      offShortcuts = fn;
      void desktopShortcuts().then((bindings) => alive && setShortcuts(bindings)).catch(() => {});
    });
    return () => { alive = false; off(); offShortcuts(); };
  }, []);

  const applyInput = useCallback(() => {
    const rect = hiddenRef.current ? WAKE : rectRef.current;
    if (regionRef.current) void setInputRect(rect.left, rect.y, rect.w, rect.h);
    const p = lastPointer.current;
    if (p) {
      const over = p.inside && p.x >= rect.left && p.x <= rect.left + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h;
      overRef.current = over;
      void setInteractive(over);
    }
  }, []);
  const onShape = useCallback(({ w, h, y }: { w: number; h: number; y: number }) => {
    rectRef.current = { left: Math.round((NOTCH_STAGE.w - w) / 2), w, h, y };
    applyInput();
  }, [applyInput]);
  useEffect(() => {
    applyInput();
  }, [region, hidden, applyInput]);
  useEffect(() => { void setKeyboard(visibility === "visible" && (view === "setup" || view === "ask" || view === "listen" || view === "projects" || view === "receipts")); }, [visibility, view]);

  const pointerMoved = useCallback((p: PointerPayload) => {
    lastPointer.current = p;
    const { left, w, h, y } = hiddenRef.current ? WAKE : rectRef.current;
    const over = p.inside && p.x >= left && p.x <= left + w && p.y >= y && p.y <= y + h;
    if (!over) suppressWake.current = false;
    if (over && visibilityRef.current !== "visible" && !suppressWake.current) reveal();
    if (over) resetIdle();
    if (over === overRef.current) return;
    overRef.current = over;
    void setInteractive(over);
    clearTimeout(hoverTimer.current);
    if (viewRef.current !== "rest" && viewRef.current !== "home") return;
    if (over && viewRef.current === "rest" && !suppressWake.current) hoverTimer.current = setTimeout(() => setView("home"), HOVER_OPEN_MS);
    if (!over && viewRef.current === "home") hoverTimer.current = setTimeout(() => setView("rest"), HOVER_CLOSE_MS);
  }, [resetIdle, reveal]);

  useEffect(() => {
    let alive = true;
    let off = () => {};
    if (isTauri()) {
      void import("@tauri-apps/api/event").then(({ listen }) =>
        listen<PointerPayload>("dalil://pointer", (event) => pointerMoved(event.payload)),
      ).then((fn) => alive ? (off = fn) : fn());
    }
    const onMove = (event: PointerEvent) => {
      if (isTauri()) return;
      const bounds = host.current?.getBoundingClientRect();
      pointerMoved({ inside: true, x: event.clientX - (bounds?.left ?? 0), y: event.clientY - (bounds?.top ?? 0) });
    };
    const onLeave = () => { if (!isTauri()) pointerMoved({ inside: false, x: -1, y: -1 }); };
    const onPress = (event: PointerEvent) => {
      if (viewRef.current === "thinking") return;
      const { left, w, h, y: top } = hiddenRef.current ? WAKE : rectRef.current;
      const bounds = host.current?.getBoundingClientRect();
      const x = event.clientX - (bounds?.left ?? 0);
      const y = event.clientY - (bounds?.top ?? 0);
      if (x < left || x > left + w || y < top || y > top + h) hide();
      else resetIdle();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); hide(); }
      else resetIdle();
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerdown", onPress);
    window.addEventListener("keydown", onKey);
    window.addEventListener("input", resetIdle);
    window.addEventListener("focusin", resetIdle);
    window.addEventListener("wheel", resetIdle, { passive: true });
    document.documentElement.addEventListener("mouseleave", onLeave);
    let offBlur = () => {};
    void onWindowBlur(() => { if (viewRef.current !== "rest" && viewRef.current !== "thinking") hide(); }).then((fn) => alive ? (offBlur = fn) : fn());
    return () => {
      alive = false; off(); offBlur();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onPress);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("input", resetIdle);
      window.removeEventListener("focusin", resetIdle);
      window.removeEventListener("wheel", resetIdle);
      document.documentElement.removeEventListener("mouseleave", onLeave);
    };
  }, [hide, pointerMoved, resetIdle]);

  const { model, actions } = useEndpointSetup("native", undefined, (saved, key) => {
    if (isTauri()) void saveEndpoint(saved, key).then(() => setView("home"));
  });
  const setupActions = useMemo(() => ({ ...actions, close: () => hide() }), [actions, hide]);
  const openSetup = useCallback(async () => {
    await stopComputer();
    reveal();
    setView("setup");
  }, [reveal, stopComputer]);
  useEffect(() => {
    let alive = true;
    let off = () => {};
    void onCommand((command) => {
      clearTimeout(hoverTimer.current);
      if (command === "hide") { void stopComputer(); hide(); return; }
      if (command === "toggle" && visibilityRef.current === "visible" && viewRef.current !== "rest") { hide(); return; }
      reveal();
      if (command === "ask" || command === "toggle") void openAsk();
      if (command === "talk") void toggleTalk();
      if (command === "setup") void openSetup();
    }).then((fn) => alive ? (off = fn) : fn());
    return () => { alive = false; off(); };
  }, [hide, openAsk, openSetup, reveal, stopComputer, toggleTalk]);

  const onAction = useCallback((action: NotchAction) => {
    if (action === "dismiss") { hide(); return; }
    reveal();
    if (action === "open-setup") void openSetup();
    if (action === "open-ask") void openAsk();
    if (action === "open-talk") void toggleTalk();
    if (action === "open-projects" || action === "open-receipts") void stopComputer().then(()=>setView(action === "open-projects" ? "projects" : "receipts"));
    if (action === "stop-task") { const task=tutor.tasks.find(task=>task.status==="running");if(task)void tutor.stopTask(task.id); }
  }, [hide, openAsk, openSetup, reveal, stopComputer, toggleTalk, tutor]);
  useEffect(() => {
    if (view !== "setup") return;
    const frame = requestAnimationFrame(() => document.querySelector<HTMLElement>("[data-shell] [data-autofocus]")?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, [view]);

  const common = { onAction, onShape, stageHeight: STAGE_HEIGHT, compact: visibility !== "visible", projectName: tutor.project?.name, thinkingText: tutor.tasks.find(task=>task.status==="running")?.activities.at(-1)?.label,
    shortcutHint: shortcuts.length ? "Ctrl + Alt + Space to ask. I’ll take it from here." : "Ask a question. I’ll bring the explanation to your screen.",
    setupPanel: view === "projects" || view === "receipts" ? <LibraryPanel kind={view} onBack={()=>setView("home")} onProjectChanged={()=>void tutor.refresh()}/> : <SetupPanel model={model} actions={setupActions} />, working: tutor.tasks.filter((task) => task.status === "running").length };
  const using = [tutor.contextLabel && `Using ${tutor.contextLabel}`, tutor.project && `Project ${tutor.project.name}`].filter(Boolean).join(". ");
  return <div ref={host} className="relative mx-auto" style={{ width: NOTCH_STAGE.w }} data-notch-hidden={hidden} data-notch-phase={visibility}>
    {hidden && <button type="button" aria-label="Open Dalil" onPointerEnter={() => { if (!suppressWake.current) reveal(); }} onFocus={reveal} onClick={() => { reveal(); openAsk(); }}
      className="absolute top-0 z-10 h-2 w-33 bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring" style={{ left: WAKE.left }} />}
    <div inert={hidden} aria-hidden={hidden} className={cx("origin-top transition-[opacity,transform] duration-260 ease-dalil-out motion-reduce:transform-none motion-reduce:duration-100", hidden ? "pointer-events-none -translate-y-1 scale-75 opacity-0" : "translate-y-0 scale-100 opacity-100")}>
      {view === "listen" ? <Notch state="listening" transcript="" level={tutor.level} {...common} />
        : view === "ask" ? <Notch state="ask" draft={tutor.draft} onDraft={tutor.setDraft} onSubmit={(value) => void submit(value)} busy={tutor.busy}
          messages={tutor.messages} tasks={tutor.tasks} error={tutor.error} contextLabel={using || undefined}
          onTalk={() => void toggleTalk()}
          onStopTask={tutor.stopTask} onNewChat={tutor.newChat} onDismiss={() => hide()} onSetup={() => onAction("open-setup")}
          onShowVisual={tutor.showVisual}
          shortcuts={shortcuts}
          searchEnabled={tutor.searchEnabled} screenEnabled={tutor.screenEnabled}
          computerSupported={tutor.capabilities.supported} computerReason={tutor.capabilities.reason} {...common} />
          : view === "thinking" ? <Notch state="thinking" {...common} />
          : view === "setup" || view === "projects" || view === "receipts" ? <Notch state="setup" {...common} />
            : view === "rest" ? <Notch state="rest" {...common} />
              : <Notch state="home" name={name} hour={new Date().getHours()} endpoint={endpoint} {...common} />}
    </div>
  </div>;
}
