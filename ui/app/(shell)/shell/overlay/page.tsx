"use client";

import "../shell.css";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { GuideCard } from "@/components/dalil/cards/guide-card";
import { RoughFilters } from "@/components/dalil/cards/rough-filters";
import { DiagramView } from "@/components/dalil/scene/diagram-view";
import { Model3DView } from "@/components/dalil/scene/model-3d";
import { MarkLabel } from "@/components/dalil/overlay/mark-label";
import { PointerLayer, type PointerLayerHandle } from "@/components/dalil/pointer/pointer-layer";
import type { Mark, OverlayCommand, Scene as VisualScene } from "@/lib/contracts";
import { EXAMPLE_DIAGRAM, EXAMPLE_JET } from "@/lib/scene";
import { isTauri } from "@/lib/native-bridge";
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
      later(IDLE_MS, clearScene);
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
      stopTimers();
      demoTimers.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
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
            className="absolute start-1/2 top-24 -translate-x-1/2"
            style={{ width: visual.scene.type === "diagram" ? "min(620px, calc(100vw - 3rem))" : "min(860px, calc(100vw - 3rem))" }}
            initial={{ opacity: 0, y: reduced ? 0 : 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.24, ease: EASE_OUT }}
          >
            {visual.scene.type === "diagram" ? (
              <DiagramView scene={visual.scene} />
            ) : (
              <Model3DView scene={visual.scene} className="h-[min(520px,60vh)] w-full" />
            )}
          </motion.div>
        ) : null}
        {card ? (
          <motion.div
            key={card.id}
            className="absolute end-6 top-28 w-[min(380px,calc(100vw-3rem))]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.2, ease: EASE_OUT }}
          >
            <GuideCard
              type="checklist"
              data={{ strip: "Dalil", heading: card.title, items: card.lines }}
              width={380}
              pill={null}
            />
          </motion.div>
        ) : null}
      </motion.div>
      <PointerLayer ref={pointer} />
    </div>
  );
}
