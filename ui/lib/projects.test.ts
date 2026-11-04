import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Project } from "./contracts";
// Node resolves the explicit extension; tsc only allows it with allowImportingTsExtensions.
// @ts-expect-error TS5097
import * as projects from "./projects.ts";

const { listProjects, addProject, setActiveProject, deleteProject, renameProject, activeProject, describeProject, shortFolder, nameProblem } =
  projects;

const project = (id: string, name: string, extra: Partial<Project> = {}): Project => ({
  id,
  name,
  createdAt: "2026-01-01T09:00:00Z",
  ...extra,
});

describe("activeProject", () => {
  it("returns the project the active id names, or null", () => {
    const state = { projects: [project("a", "Alpha"), project("b", "Beta")], active: "b" };
    assert.equal(activeProject(state)?.name, "Beta");
    assert.equal(activeProject({ ...state, active: null }), null);
    assert.equal(activeProject({ ...state, active: "zzz" }), null);
  });
});

describe("describeProject and shortFolder", () => {
  it("is just the name when there is no folder", () => {
    assert.equal(describeProject(project("a", "Physics homework")), "Physics homework");
  });

  it("shows a folder of two segments or fewer as it was typed", () => {
    assert.equal(describeProject(project("a", "Notes", { folder: "/srv/notes/" })), "Notes (/srv/notes)");
  });

  it("shortens a longer folder to its last two segments", () => {
    assert.equal(describeProject(project("a", "my-app", { folder: "/home/x/my-app" })), "my-app (\u2026/x/my-app)");
    assert.equal(shortFolder("C:\\Users\\x\\essay\\"), "\u2026/x/essay");
  });
});

describe("nameProblem", () => {
  it("accepts one to sixty characters after trimming", () => {
    assert.equal(nameProblem("  Physics  ", []), null);
    assert.equal(nameProblem("   ", []), "empty-name");
    assert.equal(nameProblem("x".repeat(60), []), null);
    assert.equal(nameProblem("x".repeat(61), []), "name-too-long");
  });

  it("finds duplicates in any case, except the project being renamed", () => {
    const list = [project("a", "my-app")];
    assert.equal(nameProblem(" MY-APP ", list), "duplicate");
    assert.equal(nameProblem("MY-APP", list, "a"), null);
  });
});

describe("the store outside Tauri", () => {
  beforeEach(async () => {
    for (const p of (await listProjects()).projects) await deleteProject(p.id);
  });

  it("adds a trimmed project with its folder and makes it the active one", async () => {
    const made = await addProject("  Physics homework ", " /home/x/physics ");
    assert.equal(made.name, "Physics homework");
    assert.equal(made.folder, "/home/x/physics");
    const state = await listProjects();
    assert.equal(state.active, made.id);
    assert.deepEqual(state.projects.map((p) => p.name), ["Physics homework"]);
  });

  it("leaves out a blank folder", async () => {
    const made = await addProject("Essay", "   ");
    assert.equal("folder" in made, false);
  });

  it("rejects a blank or too long name, and a duplicate in any case", async () => {
    await assert.rejects(addProject("   "), /empty-name/);
    await assert.rejects(addProject("x".repeat(61)), /name-too-long/);
    await addProject("my-app");
    await assert.rejects(addProject(" MY-APP"), /duplicate/);
    assert.equal((await listProjects()).projects.length, 1);
  });

  it("keeps at most fifty projects", async () => {
    for (let i = 0; i < 50; i += 1) await addProject(`Project ${i}`);
    await assert.rejects(addProject("One more"), /too-many-projects/);
    assert.equal((await listProjects()).projects.length, 50);
  });

  it("sets the active project, clears it with null and refuses an unknown id", async () => {
    const alpha = await addProject("Alpha");
    await addProject("Beta");
    await setActiveProject(alpha.id);
    assert.equal((await listProjects()).active, alpha.id);
    await assert.rejects(setActiveProject("zzz"), /not-found/);
    await setActiveProject(null);
    assert.equal((await listProjects()).active, null);
  });

  it("deletes a project, and clears the active one only when it was that project", async () => {
    const alpha = await addProject("Alpha");
    const beta = await addProject("Beta");
    await deleteProject(alpha.id);
    assert.deepEqual(await listProjects(), { projects: [beta], active: beta.id });
    await deleteProject(beta.id);
    assert.deepEqual(await listProjects(), { projects: [], active: null });
  });

  it("renames a project and refuses a name another project already has", async () => {
    const alpha = await addProject("Alpha");
    await addProject("Beta");
    assert.equal((await renameProject(alpha.id, "  alpha  ")).name, "alpha");
    await assert.rejects(renameProject(alpha.id, "BETA"), /duplicate/);
    await assert.rejects(renameProject("zzz", "Gamma"), /not-found/);
  });
});
