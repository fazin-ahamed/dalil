"use client";

import "../shell.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NOTCH_STAGE, Notch, type NotchAction, type NotchEndpoint } from "@/components/dalil/notch";
import { useTutor, type TutorView } from "./use-tutor";
import { SetupPanel } from "@/components/dalil/setup/setup-panel";
import { useEndpointSetup } from "@/components/dalil/setup/use-endpoint-setup";
import {
  inputMode,
  isTauri,
  loadEndpoint,
  onCommand,
  onEndpointChanged,
  saveEndpoint,
  setInputRect,
  setInteractive,
  setKeyboard,
} from "@/lib/native-bridge";

const HOVER_OPEN_MS = 200;
const HOVER_CLOSE_MS = 700;
/** Tall enough for Setup with a model list. The window is this tall; only the visible shape takes the mouse. */
const STAGE_HEIGHT = 640;

interface PointerPayload {
  inside: boolean;
  x: number;
  y: number;
}

async function readUserName(): Promise<string> {
  if (!isTauri()) return "there";
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("user_name");
}

/**
 * The desktop notch window. Rust reports the cursor in window pixels; this page decides whether the
 * cursor is over the visible shape, asks for the mouse only then, and opens Home after a short hover.
 * On a Wayland layer-shell notch (niri, Sway, Hyprland, KDE) Rust reads the pointer from GDK and the
 * page tells Rust which rectangle takes the mouse. In a plain browser (next dev) the same page runs with a
 * mouse for design work.
 */
export default function NotchWindow() {
  const [view, setView] = useState<"rest" | "home" | "setup" | TutorView>("rest");
  const [endpoint, setEndpoint] = useState<NotchEndpoint | undefined>();
  const [name, setName] = useState("there");
  const [region, setRegion] = useState(false);
  const viewRef = useRef(view);
  /** Where the visible notch is, in window pixels, as the Notch last reported it. */
  const rectRef = useRef({ left: 0, w: 0, h: 0 });
  const overRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    viewRef.current = view;
  });

  useEffect(() => {
    let alive = true;
    const refresh = () =>
      void loadEndpoint().then((saved) => {
        if (alive) setEndpoint(saved ? { model: saved.model, host: saved.host, local: saved.local } : undefined);
      });
    refresh();
    void readUserName().then((n) => alive && setName(n));
    let off = () => {};
    void onEndpointChanged(refresh).then((fn) => (off = fn));
    return () => {
      alive = false;
      off();
    };
  }, []);

  useEffect(() => {
    let alive = true;
    void inputMode().then((mode) => alive && mode === "region" && setRegion(true));
    return () => {
      alive = false;
    };
  }, []);

  /* The Notch reports its visible shape. Rust keeps the mouse to that rectangle (layer-shell) and
     the pointer hit-test below uses it too. */
  const regionRef = useRef(region);
  useEffect(() => {
    regionRef.current = region;
  });
  const onShape = useCallback(({ w, h }: { w: number; h: number }) => {
    const left = Math.round((NOTCH_STAGE.w - w) / 2);
    rectRef.current = { left, w, h };
    if (regionRef.current) void setInputRect(left, 0, w, h);
  }, []);
  useEffect(() => {
    const { left, w, h } = rectRef.current;
    if (region && w) void setInputRect(left, 0, w, h);
  }, [region]);

  useEffect(() => {
    void setKeyboard(view === "setup" || view === "ask" || view === "listen");
  }, [view]);

  const pointerMoved = useCallback((p: PointerPayload) => {
    const { left, w, h } = rectRef.current;
    const over = p.inside && p.x >= left && p.x <= left + w && p.y <= h;
    if (over === overRef.current) return;
    overRef.current = over;
    void setInteractive(over);
    clearTimeout(timer.current);
    if (viewRef.current !== "rest" && viewRef.current !== "home") return;
    if (over && viewRef.current === "rest") timer.current = setTimeout(() => setView("home"), HOVER_OPEN_MS);
    if (!over && viewRef.current === "home") timer.current = setTimeout(() => setView("rest"), HOVER_CLOSE_MS);
  }, []);

  useEffect(() => {
    if (isTauri()) {
      let off = () => {};
      void import("@tauri-apps/api/event").then(({ listen }) =>
        listen<PointerPayload>("dalil://pointer", (e) => pointerMoved(e.payload)).then((fn) => (off = fn)),
      );
      return () => off();
    }
    const onMove = (e: MouseEvent) => pointerMoved({ inside: true, x: e.clientX, y: e.clientY });
    const onLeave = () => pointerMoved({ inside: false, x: -1, y: -1 });
    window.addEventListener("mousemove", onMove);
    document.documentElement.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("mousemove", onMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
    };
  }, [pointerMoved]);

  const { model, actions } = useEndpointSetup("native", undefined, (saved, key) => {
    if (!isTauri()) return;
    void saveEndpoint(saved, key).then(() => setView("home"));
  });
  const setupActions = useMemo(() => ({ ...actions, close: () => setView("rest") }), [actions]);

  const tutor = useTutor(setView);
  const { openAsk, close: closeTutor, toggleTalk, submit } = tutor;

  /* `dalil --ask` opens the text box. `dalil --talk` starts listening, and the next one stops and asks. */
  useEffect(() => {
    let off = () => {};
    void onCommand((command) => {
      clearTimeout(timer.current);
      if (command === "ask") openAsk();
      if (command === "talk") void toggleTalk();
    }).then((fn) => (off = fn));
    return () => off();
  }, [openAsk, toggleTalk]);

  const onAction = useCallback(
    (action: NotchAction) => {
      if (action === "open-setup") {
        clearTimeout(timer.current);
        setView("setup");
      }
      if (action === "open-ask") openAsk();
      if (action === "open-talk") void toggleTalk();
      if (action === "dismiss") {
        if (viewRef.current === "ask" || viewRef.current === "listen") closeTutor();
        else setView("rest");
      }
    },
    [openAsk, closeTutor, toggleTalk],
  );

  /* Setup mounts with the page so it can fade in; move focus into it when it opens. */
  useEffect(() => {
    if (view !== "setup") return;
    const frame = requestAnimationFrame(() =>
      document.querySelector<HTMLElement>("[data-shell] [data-autofocus]")?.focus({ preventScroll: true }),
    );
    return () => cancelAnimationFrame(frame);
  }, [view]);

  const setupPanel = <SetupPanel model={model} actions={setupActions} />;
  const common = { onAction, onShape, stageHeight: STAGE_HEIGHT, setupPanel };
  const contextLabel = tutor.contextLabel;
  const using = [contextLabel && `Using ${contextLabel}`, tutor.project && `Project ${tutor.project.name}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mx-auto" style={{ width: NOTCH_STAGE.w }}>
      {view === "listen" ? (
        <Notch state="listening" transcript="" level={tutor.level} {...common} />
      ) : view === "ask" ? (
        <Notch
          state="ask"
          draft={tutor.draft}
          onDraft={tutor.setDraft}
          onSubmit={(v) => void submit(v)}
          busy={tutor.busy}
          messages={tutor.messages}
          onTalk={() => void toggleTalk()}
          error={tutor.error}
          contextLabel={using || undefined}
          {...common}
        />
      ) : view === "setup" ? (
        <Notch state="setup" {...common} />
      ) : view === "rest" ? (
        <Notch state="rest" {...common} />
      ) : (
        <Notch state="home" name={name} hour={new Date().getHours()} endpoint={endpoint} {...common} />
      )}
    </div>
  );
}
