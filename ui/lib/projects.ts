import type { Project } from "./contracts";

/** The store keeps at most this many projects. The Rust store in src-tauri/src/projects.rs uses the same cap. */
const MAX_PROJECTS = 50;
/** The longest name, in characters, after trimming. */
const MAX_NAME = 60;

/** Every project and the one in use. `active` is null when no project is. */
export interface ProjectState {
  projects: Project[];
  active: string | null;
}

/** Why a name cannot be used. The codes are the Rust store's error strings. */
export type NameProblem = "empty-name" | "name-too-long" | "duplicate";

/** Projects kept by the page when there is no Tauri shell, e.g. plain `next dev`. Gone on reload. */
let pageState: ProjectState = { projects: [], active: null };

const inTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Checks a name the way the Rust store does: trimmed, 1 to 60 characters, and no other project with the
 * same name in any case. `exceptId` is the project being renamed, which may keep its own name.
 */
export function nameProblem(name: string, projects: Project[], exceptId?: string): NameProblem | null {
  const clean = name.trim();
  if (!clean) return "empty-name";
  if ([...clean].length > MAX_NAME) return "name-too-long";
  const key = clean.toLowerCase();
  return projects.some((p) => p.id !== exceptId && p.name.toLowerCase() === key) ? "duplicate" : null;
}

/** Every project and the active one. */
export async function listProjects(): Promise<ProjectState> {
  if (!inTauri()) return { projects: pageState.projects.slice(), active: pageState.active };
  return invoke<ProjectState>("project_list");
}

/** Adds a project and makes it the active one. Rejects a bad name with its code, e.g. "duplicate". */
export async function addProject(name: string, folder?: string): Promise<Project> {
  if (!inTauri()) return addInPage(name, folder);
  return invoke<Project>("project_add", { name, folder: folder?.trim() || null });
}

/** Makes a project the active one, or no project for null. */
export async function setActiveProject(id: string | null): Promise<void> {
  if (!inTauri()) {
    if (id !== null && !pageState.projects.some((p) => p.id === id)) throw new Error("not-found");
    pageState = { ...pageState, active: id };
    return;
  }
  return invoke<void>("project_set_active", { id });
}

/** Deletes a project. Its lessons are kept and shown in every project. An unknown id is not an error. */
export async function deleteProject(id: string): Promise<void> {
  if (!inTauri()) {
    pageState = {
      projects: pageState.projects.filter((p) => p.id !== id),
      active: pageState.active === id ? null : pageState.active,
    };
    return;
  }
  return invoke<void>("project_delete", { id });
}

/** Renames a project. The new name follows the same rules as a new one. */
export async function renameProject(id: string, name: string): Promise<Project> {
  if (!inTauri()) return renameInPage(id, name);
  return invoke<Project>("project_rename", { id, name });
}

/** The page-only fallback, with the same rules as the Rust store. */
function addInPage(name: string, folder?: string): Project {
  const problem = nameProblem(name, pageState.projects);
  if (problem) throw new Error(problem);
  if (pageState.projects.length >= MAX_PROJECTS) throw new Error("too-many-projects");
  const project: Project = { id: newId(), name: name.trim(), createdAt: new Date().toISOString() };
  const where = folder?.trim();
  if (where) project.folder = where;
  pageState = { projects: [...pageState.projects, project], active: project.id };
  return { ...project };
}

function renameInPage(id: string, name: string): Project {
  const current = pageState.projects.find((p) => p.id === id);
  if (!current) throw new Error("not-found");
  const problem = nameProblem(name, pageState.projects, id);
  if (problem) throw new Error(problem);
  const renamed: Project = { ...current, name: name.trim() };
  pageState = { ...pageState, projects: pageState.projects.map((p) => (p.id === id ? renamed : p)) };
  return { ...renamed };
}

/** The project the active id names, or null when none is active. */
export function activeProject(state: ProjectState): Project | null {
  return state.projects.find((p) => p.id === state.active) ?? null;
}

/**
 * The folder shortened to its last two segments ("…/x/my-app"). A path with two segments or fewer is
 * shown as it was typed, without a trailing slash.
 */
export function shortFolder(folder: string): string {
  const path = folder.trim().replace(/[\\/]+$/, "");
  const parts = path.split(/[\\/]+/).filter(Boolean);
  return parts.length > 2 ? `…/${parts.slice(-2).join("/")}` : path;
}

/** "Physics homework", or "my-app (…/x/my-app)" when the project has a folder. */
export function describeProject(project: Project): string {
  const where = project.folder ? shortFolder(project.folder) : "";
  return where ? `${project.name} (${where})` : project.name;
}
