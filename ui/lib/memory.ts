import type { Lesson, Mark } from "./contracts";

/** The store keeps at most this many lessons. The Rust store in src-tauri/src/memory.rs uses the same cap. */
const MAX_LESSONS = 500;

/** A lesson of the active project scores half a word more than a global lesson with the same words. */
const PROJECT_BONUS = 0.5;

/** Lessons kept by the page when there is no Tauri shell, e.g. plain `next dev`. Gone on reload. */
let pageLessons: Lesson[] = [];

const inTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

/** A lesson is listed for a project when it belongs to that project or to none. With no project, all are listed. */
function listedIn(lesson: Lesson, projectId?: string): boolean {
  return !projectId || !lesson.projectId || lesson.projectId === projectId;
}

/** Every lesson, newest first. With a project id: that project's lessons and the global ones. */
export async function listLessons(projectId?: string): Promise<Lesson[]> {
  if (!inTauri()) return pageLessons.filter((lesson) => listedIn(lesson, projectId)).reverse();
  return invoke<Lesson[]>("memory_list", { projectId: projectId || null });
}

/**
 * Saves a lesson, or refreshes the one on the same topic in the same project (trimmed, any case). Rejects an
 * empty topic or note. Marks passed on a refresh replace the stored ones.
 */
export async function addLesson(
  topic: string,
  note: string,
  kind: Lesson["kind"],
  app?: string,
  projectId?: string,
  marks?: Mark[],
): Promise<Lesson> {
  if (!inTauri()) return addInPage(topic, note, kind, app, projectId, marks);
  return invoke<Lesson>("memory_add", {
    topic,
    note,
    kind,
    appName: app?.trim() || null,
    projectId: projectId || null,
    marks: marks ?? null,
  });
}

export async function deleteLesson(id: string): Promise<void> {
  if (!inTauri()) {
    pageLessons = pageLessons.filter((lesson) => lesson.id !== id);
    return;
  }
  return invoke<void>("memory_delete", { id });
}

export async function clearLessons(): Promise<void> {
  if (!inTauri()) {
    pageLessons = [];
    return;
  }
  return invoke<void>("memory_clear");
}

/** The same rules as the Rust store, for the page-only fallback. */
function addInPage(topic: string, note: string, kind: Lesson["kind"], app?: string, projectId?: string, marks?: Mark[]): Lesson {
  const name = topic.trim();
  const body = note.trim();
  const owner = projectId || undefined;
  if (!name) throw new Error("empty-topic");
  if (!body) throw new Error("empty-note");
  const same = pageLessons.find(
    (lesson) => lesson.topic.trim().toLowerCase() === name.toLowerCase() && lesson.projectId === owner,
  );
  if (same) {
    Object.assign(same, { note: body, kind, seen: same.seen + 1 });
    if (marks) same.marks = marks;
    return { ...same };
  }
  const lesson: Lesson = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    topic: name,
    note: body,
    kind,
    app: app?.trim() || undefined,
    projectId: owner,
    marks,
    createdAt: new Date().toISOString(),
    seen: 1,
  };
  pageLessons.push(lesson);
  if (pageLessons.length > MAX_LESSONS) {
    const victim = pageLessons
      .filter((other) => other !== lesson)
      .sort((a, b) => a.seen - b.seen || Date.parse(a.createdAt) - Date.parse(b.createdAt))[0];
    pageLessons = pageLessons.filter((other) => other !== victim);
  }
  return { ...lesson };
}

/** Lowercase words of letters and digits in any script. Spaces and punctuation separate them. */
const wordsOf = (text: string): Set<string> => new Set(text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);

/**
 * The lessons most related to `query`, best first, at most `limit`. A lesson scores the number of distinct
 * words it shares with the query. A lesson of `projectId` gets half a word more than a global one, so it
 * wins a tie on words. The seen count and recency add less than half a word between them, so they only
 * break ties. Lessons that share no word are dropped.
 */
export function recall(lessons: Lesson[], query: string, limit = 5, projectId?: string): Lesson[] {
  const asked = wordsOf(query);
  const times = lessons.map((lesson) => Date.parse(lesson.createdAt) || 0);
  const oldest = Math.min(...times);
  const span = Math.max(...times) - oldest;
  return lessons
    .flatMap((lesson, index) => {
      const known = wordsOf(`${lesson.topic} ${lesson.note}`);
      const overlap = [...asked].filter((word) => known.has(word)).length;
      if (overlap === 0) return [];
      const recency = span > 0 ? (times[index] - oldest) / span : 0;
      const bonus = projectId && lesson.projectId === projectId ? PROJECT_BONUS : 0;
      return [{ lesson, score: overlap + bonus + Math.min(lesson.seen, 5) / 20 + recency / 4 }];
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, limit))
    .map((entry) => entry.lesson);
}

/** A compact bullet list for a prompt: one lesson per line, the kind in parentheses, no ids. "" when empty. */
export function formatForPrompt(lessons: Lesson[]): string {
  const line = (text: string) => text.replace(/\s+/g, " ").trim();
  return lessons.map((lesson) => `- ${line(lesson.topic)} (${lesson.kind}): ${line(lesson.note)}`).join("\n");
}
