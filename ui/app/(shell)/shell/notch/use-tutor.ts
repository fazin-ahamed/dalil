"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { callDesktop, friendlyError } from "@/lib/chat";
import { beginComputer, computerAction, computerCapabilities, endComputer, runAgent, untilStopped, type ComputerCapabilities } from "@/lib/agent";
import { captureScreen } from "@/lib/capture";
import { annotate, applyRefinement, refineMessages } from "@/lib/refine";
import type { ChatBubble } from "@/components/dalil/notch";
import type { AgentTask, ChatMessage, ContextSnapshot, Project, Scene, ScreenBounds, ScreenShot } from "@/lib/contracts";
import { getContext, shortApp } from "@/lib/context";
import { addLesson, formatForPrompt, listLessons, recall } from "@/lib/memory";
import { loadEndpoint, setKeyboard } from "@/lib/native-bridge";
import { sendOverlay } from "@/lib/overlay";
import { activeProject, listProjects } from "@/lib/projects";
import { cancelListening, friendlyVoiceError, onLevel, speak, startListening, stopAndTranscribe, voiceCode, type Speech } from "@/lib/voice";

export type TutorView = "ask" | "listen" | "rest" | "thinking";
const OVERLAY_CLEAR_MS = 450;
const REFINE_TIMEOUT_MS = 25_000;

/** Tasks outlive the open panel. Only Stop or a new conversation cancels their work. */
export function useTutor(setView: (view: TutorView) => void) {
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatBubble[]>([]);
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [context, setContext] = useState<ContextSnapshot | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [level, setLevel] = useState(0);
  const searchEnabled = true;
  const [screenEnabled, setScreenEnabled] = useState(false);
  const [capabilities, setCapabilities] = useState<ComputerCapabilities>({ supported: false, reason: "Checking desktop input…" });
  const history = useRef<ChatMessage[]>([]);
  const speech = useRef<Speech | null>(null);
  const drawing = useRef(false);
  const lastVisual = useRef<Scene | null>(null);
  const lastScreen = useRef<ScreenBounds | undefined>(undefined);
  const presenter = useRef<string | null>(null);
  const visible = useRef(false);
  const controllers = useRef(new Map<string, AbortController>());
  const computerTask = useRef<string | null>(null);
  const busy = transcribing || tasks.some((task) => task.status === "running");

  useEffect(() => {
    let alive = true;
    void computerCapabilities().then((value) => alive && setCapabilities(value)).catch(() => {});
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!listening) return;
    let off = () => {};
    let alive = true;
    void onLevel(setLevel).then((fn) => (alive ? (off = fn) : fn()));
    return () => { alive = false; off(); setLevel(0); };
  }, [listening]);

  const stopSpeaking = useCallback(() => { speech.current?.stop(); speech.current = null; setSpeaking(false); }, []);
  const clearOverlay = useCallback(() => {
    drawing.current = false;
    return sendOverlay({ kind: "clear" }).catch(() => {});
  }, []);
  const stopTask = useCallback(async (id: string) => {
    controllers.current.get(id)?.abort();
    if (computerTask.current === id) {
      await endComputer(id).catch(() => {});
      if (computerTask.current === id) computerTask.current = null;
    }
  }, []);
  const stopComputer = useCallback(async () => { if (computerTask.current) await stopTask(computerTask.current); }, [stopTask]);
  const showVisual = useCallback((id: string) => {
    const scene = messages.find((message) => message.taskId === id && message.role === "assistant")?.scene;
    if (!scene) return;
    drawing.current = true;
    lastVisual.current = scene;
    void sendOverlay({ kind: "scene", scene }, lastScreen.current).catch(() => setError("Could not open the explanation panel. Try again."));
  }, [messages]);

  useEffect(() => {
    const active = controllers.current;
    return () => {
      for (const [id, controller] of active) {
        controller.abort();
        void endComputer(id).catch(() => {});
      }
      speech.current?.stop();
      void cancelListening().catch(() => {});
    };
  }, []);

  const refresh = useCallback(async () => {
    const [ctx, projects, saved] = await Promise.all([getContext(), listProjects(), loadEndpoint()]);
    setContext(ctx);
    setProject(activeProject(projects));
    setScreenEnabled(Boolean(saved?.useScreenshots));
  }, []);
  const openAsk = useCallback(async () => {
    // Opening the composer interrupts desktop input so a task cannot type into Dalil.
    await stopComputer();
    visible.current = true;
    setView("ask");
    void refresh().catch(() => {});
  }, [refresh, setView, stopComputer]);
  const close = useCallback(() => {
    visible.current = false;
    if (listening) void cancelListening().catch(() => {});
    setListening(false);
    stopSpeaking();
    setView("rest");
  }, [listening, setView, stopSpeaking]);
  const newChat = useCallback(() => {
    for (const id of controllers.current.keys()) stopTask(id);
    stopSpeaking();
    void clearOverlay();
    history.current = [];
    setMessages([]);
    setTasks([]);
    setDraft("");
    setError(null);
    lastVisual.current = null;
    presenter.current = null;
  }, [clearOverlay, stopSpeaking, stopTask]);
  const submit = useCallback(async (text: string, spoken = false) => {
    const question = text.trim();
    if (!question) return;
    if (controllers.current.size >= 4 || computerTask.current) {
      setError("Wait for the current computer task, or stop it before starting another. Up to four web tasks can run together.");
      return;
    }
    const id = crypto.randomUUID();
    const controller = new AbortController();
    const { signal } = controller;
    controllers.current.set(id, controller);
    presenter.current = id;
    setView("thinking");
    void setKeyboard(false);
    setError(null);
    stopSpeaking();
    setMessages((all) => [...all, { role: "user", text: question, taskId: id }, { role: "assistant", text: "", taskId: id, status: "running" }]);
    setTasks((all) => [...all, { id, question, computer: false, status: "running", activities: [{ label: "Reading the question and context", status: "running" }] }]);
    setDraft("");
    const task = (patch: Partial<AgentTask>) => setTasks((all) => all.map((t) => t.id === id ? { ...t, ...patch } : t));
    const reply = (patch: Partial<ChatBubble>) => setMessages((all) => all.map((m) => m.taskId === id && m.role === "assistant" ? { ...m, ...patch } : m));
    let answered = false;
    try {
      const saved = await untilStopped(loadEndpoint(), signal);
      if (!saved) throw new Error("no-endpoint");

      if (drawing.current) await untilStopped(clearOverlay(), signal);
      await untilStopped(new Promise((resolve) => setTimeout(resolve, OVERLAY_CLEAR_MS)), signal);
      const [ctx, screenshot, active] = await untilStopped(Promise.all([
        getContext(), saved.useScreenshots ? captureScreen() : Promise.resolve(null), listProjects().then(activeProject),
      ]), signal);
      let latestShot: ScreenShot | null = screenshot;
      lastScreen.current = screenshot?.screen;
      setContext(ctx);
      setProject(active);
      setScreenEnabled(saved.useScreenshots);
      const lessons = await untilStopped(listLessons(active?.id), signal);
      const endpoint = { base: saved.base, model: saved.model, headerName: saved.headerName, scheme: saved.scheme === "None" ? "None" as const : "Bearer" as const };
      task({ activities: [{ label: screenshot ? "Read the screen and conversation" : "Read the conversation", status: "done" }, { label: "Working on an answer", status: "running" }] });
      const answer = await runAgent({
        endpoint, userText: question, context: ctx, memory: formatForPrompt(recall(lessons, question, 5, active?.id)),
        history: history.current, screenshot, projectName: active?.name, currentVisual: lastVisual.current,
        tools: { search: searchEnabled, computer: capabilities.supported && saved.useScreenshots }, signal,
        act: async (action, shot) => {
          signal.throwIfAborted();
          if (computerTask.current !== id) {
            if (computerTask.current) throw new Error("computer-busy");
            computerTask.current = id;
            task({ computer: true });
            setView("thinking");
            await setKeyboard(false);
            await untilStopped(beginComputer(id), signal);
          }
          signal.throwIfAborted();
          if (action.type === "click") await untilStopped(sendOverlay({kind:"point",x:action.x,y:action.y,label:"Working here"},shot.screen),signal);
          signal.throwIfAborted();
          await computerAction(id, action, shot);
        },
        observe: async () => {
          await new Promise((resolve) => setTimeout(resolve, 500));
          signal.throwIfAborted();
          latestShot = await captureScreen();
          lastScreen.current = latestShot?.screen;
          return latestShot;
        },
        onActivity: (activities) => task({ activities }),
      });
      signal.throwIfAborted();
      history.current = [...history.current, { role: "user", content: question } satisfies ChatMessage, {
        role: "assistant", content: [answer.text, ...answer.steps.map((step, n) => `${n + 1}. ${step}`)].join("\n"),
      } satisfies ChatMessage].slice(-12);
      reply({ text: answer.text, steps: answer.steps, sources: answer.sources, scene: answer.scene, status: "done" });
      answered = true;

      if (presenter.current === id && answer.scene) {
        lastVisual.current = answer.scene;
        drawing.current = true;
        await sendOverlay({ kind: "scene", scene: answer.scene, text: answer.text }, latestShot?.screen).catch(() => setError("The answer is ready, but the explanation panel could not open."));
      } else if (presenter.current === id && answer.marks.length > 0 && latestShot) {
        const refined = await untilStopped(Promise.race([
          annotate(latestShot, answer.marks).then((marked) => callDesktop(endpoint, refineMessages(answer.marks, marked)))
            .then((raw) => applyRefinement(answer.marks, raw)).catch(() => answer.marks),
          new Promise<typeof answer.marks>((resolve) => setTimeout(() => resolve(answer.marks), REFINE_TIMEOUT_MS)),
        ]), signal);
        if (presenter.current === id && refined.length > 0) {
          drawing.current = true;
          await sendOverlay({ kind: "marks", marks: refined, screen: latestShot.screen }).catch(() => setError("The answer is ready, but the screen labels could not open."));
        }
      }
      if (presenter.current === id && answer.annotations?.length && latestShot) {
        drawing.current = true;
        await sendOverlay({kind:"annotations",annotations:answer.annotations,screen:latestShot.screen}).catch(()=>setError("Could not draw the screen sketch."));
      }
      if (presenter.current === id) {
        if (computerTask.current === id) { await endComputer(id).catch(()=>{}); computerTask.current = null; }
        setView(answer.scene || answer.marks.length || answer.annotations?.length ? "rest" : "ask");
      }
      if (spoken && presenter.current === id) {
        void speak(answer.text).then((value) => {
          if (signal.aborted || presenter.current !== id) value?.stop();
          else {
            speech.current = value;
            setSpeaking(true);
            void value.done.then(() => { if (speech.current === value) { speech.current = null; setSpeaking(false); } });
          }
        }).catch(() => {});
      }
      if (answer.topic) void addLesson(answer.topic, answer.text.slice(0, 240), answer.kind, ctx?.app || undefined, active?.id, answer.marks.length ? answer.marks : undefined).catch(() => {});
      task({ status: "done" });
    } catch (caught) {
      if (signal.aborted) {
        task({ status: answered ? "done" : "stopped" });
        if (!answered) reply({ status: "stopped", text: "Task stopped. Completed actions are listed above." });
      } else {
        const message = friendlyError(caught instanceof Error ? caught.message : String(caught));
        if (presenter.current === id) setView("ask");
        task({ status: "error" });
        reply({ status: "error", text: message });
      }
    } finally {
      if (computerTask.current === id) await endComputer(id).catch(() => {});
      if (presenter.current === id && signal.aborted) setView("ask");
      controllers.current.delete(id);
      if (computerTask.current === id) computerTask.current = null;
    }
  }, [capabilities.supported, clearOverlay, searchEnabled, setView, stopSpeaking]);

  const toggleTalk = useCallback(async () => {
    if (transcribing) return;
    await stopComputer();
    if (!listening) {
      visible.current = true;
      stopSpeaking();
      setError(null);
      setView("listen");
      setListening(true);
      try { await startListening(); void refresh().catch(() => {}); }
      catch (caught) { setListening(false); setError(friendlyVoiceError(voiceCode(caught))); setView("ask"); }
      return;
    }
    setListening(false);
    setView("ask");
    setTranscribing(true);
    let heard = "";
    try { heard = await stopAndTranscribe(); }
    catch (caught) { setError(friendlyVoiceError(voiceCode(caught))); }
    finally { setTranscribing(false); }
    if (heard) await submit(heard, true);
  }, [listening, refresh, setView, stopComputer, stopSpeaking, submit, transcribing]);

  return {
    refresh, draft, setDraft, busy, messages, tasks, error, level, listening, speaking, project,
    contextLabel: context ? shortApp(context) : "", searchEnabled,
    capabilities, screenEnabled,
    openAsk, close, submit, toggleTalk, stopTask, stopComputer, showVisual, newChat,
  };
}
