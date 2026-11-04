"use client";

import "../shell.css";
import { motion, useReducedMotion, useDragControls, useMotionValue } from "motion/react";
import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { GuideCard } from "@/components/dalil/cards/guide-card";
import { RoughFilters } from "@/components/dalil/cards/rough-filters";
import { DiagramView } from "@/components/dalil/scene/diagram-view";
import { Model3DView } from "@/components/dalil/scene/model-3d";
import { VisualFrame } from "@/components/dalil/scene/visual-frame";
import { MarkLabel } from "@/components/dalil/overlay/mark-label";
import { PointerLayer, type PointerLayerHandle } from "@/components/dalil/pointer/pointer-layer";
import type { Mark, OverlayCommand, Scene as VisualScene } from "@/lib/contracts";
import { EXAMPLE_DIAGRAM, EXAMPLE_JET } from "@/lib/scene";
import { isTauri } from "@/lib/native-bridge";
import { setOverlayInput } from "@/lib/overlay";
import { layoutMarks, toPixels, type MarkLayout } from "@/lib/overlay-layout";

/** The scene forgets itself after this long with no new command. */
const IDLE_MS = 45_000;
/** The fade before a clear takes effect. */
const CLEAR_MS = 200;
/** Rest on each mark before the pointer flies on. */
const STEP_PAUSE_MS = 260;
/** Each label starts this much after the one before it. */
const STAGGER_MS = 90;
/** The same curve as --ease-dalil-out in styles/dalil.css. */
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

const DEMO_MARKS: Mark[] = [
  { n: 1, label: "Fan", x: 100, y: 470 },
  { n: 2, label: "Compressor", x: 270, y: 420 },
  { n: 3, label: "Combustor", x: 430, y: 470 },
  { n: 4, label: "Turbine", x: 580, y: 420 },
];

const DEMO_CARD = {
  title: "Make a question and its answer",
  lines: ["Write a question.", "Write its answer below.", "Read both back aloud."],
};

interface Scene {
  id: number;
  marks: MarkLayout[];
}

interface Visual {
  id: number;
  scene: VisualScene;
}

interface CardScene {
  id: number;
  title: string;
  lines: string[];
}

/**
 * The overlay window. It draws what the notch sends on `dalil://overlay`: numbered marks with a pointer
 * that visits them in order, a guide card, or the pointer at one point. In a plain browser the same
 * commands arrive as window messages, and `?demo=1` plays a sample. Nothing on it takes a click.
 */
export default function OverlayPage() {
  const pointer = useRef<PointerLayerHandle>(null);
  const reduced = Boolean(useReducedMotion());
  const [scene, setScene] = useState<Scene>({ id: 0, marks: [] });
  const [card, setCard] = useState<CardScene | null>(null);
  const [visual, setVisual] = useState<Visual | null>(null);
  const [fading, setFading] = useState(false);
  const visualBox = useRef<HTMLDivElement>(null);
  const cardBox = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const visualDrag = useDragControls();
  const cardDrag = useDragControls();
  const visualX = useMotionValue(0);
  const visualY = useMotionValue(0);
  const cardX = useMotionValue(0);
  const cardY = useMotionValue(0);
  useEffect(() => { visualX.set(0); visualY.set(0); }, [visual?.id, visualX, visualY]);
  useEffect(() => { cardX.set(0); cardY.set(0); }, [card?.id, cardX, cardY]);
  const reportInput = useCallback(() => {
    // Motion commits its transform on the next frame; native input must follow that position.
    requestAnimationFrame(() => {
      void setOverlayInput([visualBox.current, cardBox.current].flatMap((el) => {
        if (!el) return [];
        const r = el.getBoundingClientRect();
        return [[Math.floor(r.left), Math.floor(r.top), Math.ceil(r.width), Math.ceil(r.height)] as [number, number, number, number]];
      })).catch(() => {});
    });
  }, []);
  const moveByKey = (event: KeyboardEvent<HTMLButtonElement>, kind: "visual" | "card") => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const box = (kind === "visual" ? visualBox : cardBox).current?.getBoundingClientRect();
    if (!box) return;
    const amount = event.shiftKey ? 40 : 16;
    const dx = event.key === "ArrowLeft" ? -amount : event.key === "ArrowRight" ? amount : 0;
    const dy = event.key === "ArrowUp" ? -amount : event.key === "ArrowDown" ? amount : 0;
    const x = kind === "visual" ? visualX : cardX;
    const y = kind === "visual" ? visualY : cardY;
    x.set(x.get() + Math.max(-box.left, Math.min(dx, window.innerWidth - box.right)));
    y.set(y.get() + Math.max(-box.top, Math.min(dy, window.innerHeight - box.bottom)));
    requestAnimationFrame(reportInput);
  };

  useEffect(() => {
    /* Everything below lives in this closure: the timers and the flight counter are plain variables. */
    let run = 0; // bumps on every marks, point and clear command, so a stale flight stops
    let cardId = 0;
    let clearing = false;
    let timers: number[] = [];
    const demoTimers: number[] = [];
    let disposed = false;
    let off = () => {};

    const later = (ms: number, fn: () => void) => {
      timers.push(window.setTimeout(fn, ms));
    };
    const stopTimers = () => {
      timers.forEach((id) => window.clearTimeout(id));
      timers = [];
    };
    const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const clearScene = () => {
      run += 1;
      stopTimers();
      pointer.current?.clear();
      clearing = true;
      setFading(true);
      later(CLEAR_MS, () => {
        clearing = false;
        setScene((s) => ({ id: s.id, marks: [] }));
        setCard(null);
        setVisual(null);
        setFading(false);
      });
    };

    const playMarks = async (id: number, marks: MarkLayout[]) => {
      for (const item of marks) {
        const landed = await pointer.current?.flyTo({ x: item.x, y: item.y, width: 0, height: 0 }, { ring: false });
        if (!landed || run !== id) return;
        await new Promise((resolve) => window.setTimeout(resolve, STEP_PAUSE_MS));
        if (run !== id) return;
      }
    };

    const apply = (cmd: OverlayCommand) => {
      if (cmd.kind === "clear") {
        clearScene();
        return;
      }
      stopTimers();
      if (clearing) {
        // A command arrived during the fade, so the old scene goes now.
        clearing = false;
        setScene((s) => ({ id: s.id, marks: [] }));
        setCard(null);
        setVisual(null);
      }
      setFading(false);
      // Marks fade on their own. A scene or card stays until its red button is pressed.
      if (cmd.kind !== "scene" && cmd.kind !== "card") later(IDLE_MS, clearScene);
      if (cmd.kind === "scene") {
        cardId += 1;
        setVisual({ id: cardId, scene: cmd.scene });
        return;
      }
      if (cmd.kind === "card") {
        cardId += 1;
        setCard({ id: cardId, title: cmd.title, lines: cmd.lines });
        return;
      }
      run += 1;
      const id = run;
      if (cmd.kind === "marks") {
        const marks = layoutMarks(cmd.marks, window.innerWidth, window.innerHeight);
        setScene((s) => ({ id: s.id + 1, marks }));
        // Reduced motion: the labels fade in where they are, and the pointer does not fly.
        if (!reducedMotion()) void playMarks(id, marks);
        return;
      }
      const at = toPixels(cmd.x, cmd.y, window.innerWidth, window.innerHeight);
      void pointer.current?.flyTo({ x: at.x, y: at.y, width: 0, height: 0 }, { label: cmd.label });
    };

    const onMessage = (event: MessageEvent) => {
      const data: unknown = event.data;
      if (data && typeof data === "object" && "kind" in data) apply(data as OverlayCommand);
    };
    const onKey = (event: globalThis.KeyboardEvent) => { if (event.key === "Escape") clearScene(); };
    window.addEventListener("keydown", onKey);

    if (isTauri()) {
      void import("@tauri-apps/api/event")
        .then(({ listen }) => listen<OverlayCommand>("dalil://overlay", (event) => apply(event.payload)))
        .then((unlisten) => {
          if (disposed) unlisten();
          else off = unlisten;
        })
        .catch((error: unknown) => console.warn("overlay: cannot listen for commands", error));
    } else {
      window.addEventListener("message", onMessage);
    }

    const query = new URLSearchParams(window.location.search);
    const which = query.get("scene");
    if (which === "diagram" || which === "jet") {
      const demo = which === "jet" ? EXAMPLE_JET : EXAMPLE_DIAGRAM;
      demoTimers.push(window.setTimeout(() => apply({ kind: "scene", scene: demo }), 400));
    } else if (query.get("demo") === "1") {
      demoTimers.push(window.setTimeout(() => apply({ kind: "marks", marks: DEMO_MARKS }), 300));
      demoTimers.push(window.setTimeout(() => apply({ kind: "card", ...DEMO_CARD }), 2600));
    }

    return () => {
      disposed = true;
      off();
      window.removeEventListener("message", onMessage);
      window.removeEventListener("keydown", onKey);
      stopTimers();
      demoTimers.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  /* The mouse reaches the panels (to turn a model, to press a close button) and nothing else. */
  useEffect(() => {
    const els = [visualBox.current, cardBox.current].filter((el): el is HTMLDivElement => el !== null);
    reportInput();
    const settle = window.setTimeout(reportInput, 400);
    const observer = new ResizeObserver(reportInput);
    els.forEach((el) => observer.observe(el));
    window.addEventListener("resize", reportInput);
    return () => {
      window.clearTimeout(settle);
      observer.disconnect();
      window.removeEventListener("resize", reportInput);
    };
  }, [visual, card, reportInput]);

  return (
    <div ref={viewport} className="pointer-events-none absolute inset-0 overflow-hidden">
      <RoughFilters />
      <motion.div
        className="absolute inset-0"
        animate={{ opacity: fading ? 0 : 1 }}
        transition={{ duration: CLEAR_MS / 1000, ease: EASE_OUT }}
      >
        {scene.marks.map((item, i) => (
          <motion.div
            key={`${scene.id}-${item.n}`}
            className="absolute left-0 top-0"
            style={{ transformOrigin: `${item.x}px ${item.y}px` }}
            initial={{ opacity: 0, scale: reduced ? 1 : 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.22, ease: EASE_OUT, delay: (i * STAGGER_MS) / 1000 }}
          >
            <MarkLabel
              n={item.n}
              label={item.label}
              x={item.x}
              y={item.y}
              tone={item.tone}
              placement={item.placement}
              box={item.box}
            />
          </motion.div>
        ))}
        {visual ? (
          <motion.div
            key={visual.id}
            ref={visualBox}
            className="absolute start-1/2 top-16 -translate-x-1/2"
            style={{ x: visualX, y: visualY, width: visual.scene.type === "diagram" ? "min(640px, calc(100vw - 3rem))" : "min(860px, calc(100vw - 3rem))" }}
            drag dragControls={visualDrag} dragListener={false} dragMomentum={false} dragElastic={0} dragConstraints={viewport}
            onDrag={reportInput} onDragEnd={reportInput}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.24, ease: EASE_OUT }}
          >
            <VisualFrame title={visual.scene.title || "Dalil"} onClose={() => setVisual(null)}
              onMoveStart={(event) => visualDrag.start(event)} onMoveKey={(event) => moveByKey(event, "visual")}>
              {visual.scene.type === "diagram" ? (
                <DiagramView scene={visual.scene} />
              ) : (
                <Model3DView scene={visual.scene} className="h-[min(560px,64vh)] w-full" />
              )}
            </VisualFrame>
          </motion.div>
        ) : null}
        {card ? (
          <motion.div
            key={card.id}
            ref={cardBox}
            className="absolute end-6 top-28 w-[min(380px,calc(100vw-3rem))]"
            style={{ x: cardX, y: cardY }}
            drag dragControls={cardDrag} dragListener={false} dragMomentum={false} dragElastic={0} dragConstraints={viewport}
            onDrag={reportInput} onDragEnd={reportInput}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
          >
            <VisualFrame title={card.title} onClose={() => setCard(null)} onMoveStart={(event) => cardDrag.start(event)} onMoveKey={(event) => moveByKey(event, "card")}>
              <GuideCard
              type="checklist"
              data={{ strip: "Dalil", heading: card.title, items: card.lines }}
              width={380}
              pill={null}
              />
            </VisualFrame>
          </motion.div>
        ) : null}
      </motion.div>
      <PointerLayer ref={pointer} />
    </div>
  );
}
