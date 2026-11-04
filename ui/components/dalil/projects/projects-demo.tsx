"use client";

import { useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { ProjectSwitcher } from "@/components/dalil/projects/project-switcher";
import { NotchPanel } from "@/components/dalil/notch-panel";
import { GRID_PAPER } from "@/components/dalil/setup/grid-paper";
import { fill } from "@/components/dalil/setup/setup-copy";
import type { Project } from "@/lib/contracts";
import copy from "@/lib/copy.json";
import { activeProject, describeProject } from "@/lib/projects";

const strings = copy.projects;

/** Two sample projects for the layout. The dates are fixed so the server render and the browser agree. */
const SAMPLES: Project[] = [
  { id: "sample-physics", name: strings.samples.physics, createdAt: "2026-10-02T09:00:00.000Z" },
  {
    id: "sample-app",
    name: strings.samples.app,
    folder: strings.samples.app_folder,
    createdAt: "2026-10-20T14:00:00.000Z",
  },
];

/**
 * The live project switcher with local state. Adding, choosing and deleting change this page only, and
 * the button under the frame brings the sample projects back.
 */
export function ProjectsDemo() {
  const [projects, setProjects] = useState<Project[]>(SAMPLES);
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = activeProject({ projects, active: activeId });

  const add = (name: string, folder?: string) => {
    const project: Project = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      createdAt: new Date().toISOString(),
    };
    if (folder) project.folder = folder;
    setProjects((prev) => [...prev, project]);
    setActiveId(project.id);
  };

  const remove = (id: string) => {
    setProjects((prev) => prev.filter((project) => project.id !== id));
    setActiveId((current) => (current === id ? null : current));
  };

  return (
    <section aria-labelledby="live-heading" className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 id="live-heading" className="text-title-2-medium text-text-primary">
          {strings.page.live_heading}
        </h2>
        <p className="max-w-prose text-body-regular text-text-secondary">{strings.page.live_note}</p>
      </div>

      <div
        className="overflow-hidden rounded-2xl border border-separator-border bg-paper-2 px-4 pb-8 sm:px-8"
        style={GRID_PAPER}
      >
        <NotchPanel className="mx-auto">
          <div className="flex flex-col gap-3 px-5 pt-4 pb-5">
            <p className="text-body-regular text-text-secondary">
              {active ? fill(strings.page.working_in, { name: describeProject(active) }) : strings.page.none_note}
            </p>
            <ProjectSwitcher
              projects={projects}
              activeId={activeId}
              onSelect={setActiveId}
              onAdd={add}
              onDelete={remove}
            />
          </div>
        </NotchPanel>
      </div>

      <div className="flex justify-end">
        <Button
          variant="ghost"
          size="small"
          onClick={() => {
            setProjects(SAMPLES);
            setActiveId(null);
          }}
        >
          {strings.page.restore}
        </Button>
      </div>
    </section>
  );
}
