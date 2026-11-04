"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { askTutor, callDesktop, friendlyError } from "@/lib/chat";
import { captureScreen } from "@/lib/capture";
import { annotate, applyRefinement, refineMessages } from "@/lib/refine";
import type { ChatBubble } from "@/components/dalil/notch";
import type { ChatMessage, ContextSnapshot, Project } from "@/lib/contracts";
import { getContext, shortApp } from "@/lib/context";
import { addLesson, formatForPrompt, listLessons, recall } from "@/lib/memory";
import { loadEndpoint } from "@/lib/native-bridge";
import { sendOverlay } from "@/lib/overlay";
import { activeProject, listProjects } from "@/lib/projects";
import {
  cancelListening,
  friendlyVoiceError,
  onLevel,
  speak,
  startListening,
  stopAndTranscribe,
  voiceCode,
  type Speech,
} from "@/lib/voice";

/** Where the notch should be while the tutor works. The page owns the rest (rest, home, setup). */
export type TutorView = "ask" | "listen" | "rest";

/** The overlay takes this long to fade out, so a screenshot taken after a clear does not see old drawings. */
const OVERLAY_CLEAR_MS = 450;
/** The second look at marks gives up after this long and the first marks are used. */
const REFINE_TIMEOUT_MS = 25_000;

/**
 * The tutor pipeline for the notch: typed or spoken question, then the focused app, what the screen shows,
 * the active project and recalled lessons, then the reply. A reply with a scene or marks is drawn on the
 * overlay window and, for a spoken question, read aloud. A named topic is saved as a lesson.
 */
export function useTutor(setView: (view: TutorView) => void) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatBubble[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<ContextSnapshot | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [listening, setListening] = useState(false);
  const [level, setLevel] = useState(0);

  const history = useRef<ChatMessage[]>([]);
  const speech = useRef<Speech | null>(null);
  const drawing = useRef(false);
  const busyRef = useRef(false);

  /* The microphone level drives the Listening waveform. */
  useEffect(() => {
    if (!listening) return;
    let off = () => {};
    let alive = true;
    void onLevel(setLevel).then((fn) => (alive ? (off = fn) : fn()));
    return () => {
      alive = false;
      off();
      setLevel(0);
    };
  }, [listening]);

  const stopSpeaking = useCallback(() => {
    speech.current?.stop();
    speech.current = null;
  }, []);

  const clearOverlay = useCallback(() => {
    if (!drawing.current) return;
    drawing.current = false;
    void sendOverlay({ kind: "clear" });
  }, []);

  const refresh = useCallback(async () => {
    setContext(await getContext());
    setProject(activeProject(await listProjects()));
  }, []);

  const openAsk = useCallback(() => {
    setView("ask");
    void refresh();
  }, [refresh, setView]);

  const close = useCallback(() => {
    if (listening) void cancelListening();
    setListening(false);
    stopSpeaking();
    clearOverlay();
    setDraft("");
    setMessages([]);
    setError(null);
    history.current = [];
    setView("rest");
  }, [listening, setView, stopSpeaking, clearOverlay]);

  const submit = useCallback(
    async (text: string, spoken = false) => {
      const question = text.trim();
      if (!question || busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setError(null);
      stopSpeaking();
      setMessages((all) => [...all, { role: "user", text: question }]);
      setDraft("");
      try {
        const saved = await loadEndpoint();
        if (!saved) throw new Error("no-endpoint");

        // Old drawings must not appear in the screenshot the model is about to read.
        if (drawing.current) {
          clearOverlay();
          await new Promise((resolve) => window.setTimeout(resolve, OVERLAY_CLEAR_MS));
        }
        const [ctx, screenshot, active] = await Promise.all([
          getContext(),
          captureScreen(),
          listProjects().then(activeProject),
        ]);
        setContext(ctx);
        setProject(active);
        const lessons = await listLessons(active?.id);
        const memory = formatForPrompt(recall(lessons, question, 5, active?.id));

        const answer = await askTutor({
          endpoint: {
            base: saved.base,
            model: saved.model,
            headerName: saved.headerName,
            scheme: saved.scheme === "None" ? "None" : "Bearer",
          },
          userText: question,
          context: ctx,
          memory,
          history: history.current,
          screenshot,
          projectName: active?.name,
        });

        const turns: ChatMessage[] = [
          ...history.current,
          { role: "user", content: question },
          { role: "assistant", content: answer.text },
        ];
        history.current = turns.slice(-12);
        setMessages((all) => [...all, { role: "assistant", text: answer.text, steps: answer.steps }]);

        if (answer.scene) {
          drawing.current = true;
          void sendOverlay({ kind: "scene", scene: answer.scene });
        } else if (answer.marks.length > 0) {
          drawing.current = true;
          // A second look: the model sees its own marks drawn on the screenshot and corrects them.
          // It must not hold the reply up for long, and a failure just keeps the first marks.
          const endpoint = {
            base: saved.base,
            model: saved.model,
            headerName: saved.headerName,
            scheme: saved.scheme === "None" ? ("None" as const) : ("Bearer" as const),
          };
          const refined = screenshot
            ? await Promise.race([
                annotate(screenshot, answer.marks)
                  .then((marked) => callDesktop(endpoint, refineMessages(answer.marks, marked)))
                  .then((raw) => applyRefinement(answer.marks, raw))
                  .catch(() => answer.marks),
                new Promise<typeof answer.marks>((resolve) => window.setTimeout(() => resolve(answer.marks), REFINE_TIMEOUT_MS)),
              ])
            : answer.marks;
          if (refined.length > 0) void sendOverlay({ kind: "marks", marks: refined });
        }
        if (spoken) {
          void speak(answer.text).then((s) => {
            speech.current = s;
          });
        }
        if (answer.topic) {
          void addLesson(
            answer.topic,
            answer.text.slice(0, 240),
            answer.kind,
            ctx?.app || undefined,
            active?.id,
            answer.marks.length > 0 ? answer.marks : undefined,
          );
        }
      } catch (caught) {
        setError(friendlyError(caught instanceof Error ? caught.message : String(caught)));
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [stopSpeaking, clearOverlay],
  );

  /** One press starts listening, the next stops, transcribes and asks. */
  const toggleTalk = useCallback(async () => {
    if (busyRef.current) return;
    if (!listening) {
      stopSpeaking();
      setError(null);
      setView("listen");
      setListening(true);
      try {
        await startListening();
        void refresh();
      } catch (caught) {
        setListening(false);
        setError(friendlyVoiceError(voiceCode(caught)));
        setView("ask");
      }
      return;
    }
    setListening(false);
    setView("ask");
    busyRef.current = true;
    setBusy(true);
    let heard = "";
    try {
      heard = await stopAndTranscribe();
    } catch (caught) {
      setError(friendlyVoiceError(voiceCode(caught)));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
    if (heard) {
      setDraft(heard);
      await submit(heard, true);
    }
  }, [listening, refresh, setView, stopSpeaking, submit]);

  return {
    draft,
    setDraft,
    busy,
    messages,
    error,
    level,
    listening,
    project,
    contextLabel: context ? shortApp(context) : "",
    openAsk,
    close,
    submit,
    toggleTalk,
  };
}
