import type { Metadata } from "next";
import { ProjectsDemo } from "@/components/dalil/projects/projects-demo";
import copy from "@/lib/copy.json";

export const metadata: Metadata = {
  title: copy.projects.page.meta_title,
  description: copy.projects.page.intro,
};

export default function ProjectsPage() {
  return (
    <main className="mx-auto flex w-full max-w-300 flex-1 flex-col gap-10 px-4 py-12 sm:px-6 md:px-12">
      <header className="flex max-w-2xl flex-col gap-2">
        <h1 className="text-title-1-medium text-text-primary">{copy.projects.page.title}</h1>
        <p className="text-body-regular text-text-secondary">{copy.projects.page.intro}</p>
      </header>
      <ProjectsDemo />
    </main>
  );
}
