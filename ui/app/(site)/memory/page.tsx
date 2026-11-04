import type { Metadata } from "next";
import { MemoryDemo } from "@/components/dalil/memory/memory-demo";
import { MemoryStates } from "@/components/dalil/memory/memory-states";
import copy from "@/lib/copy.json";

export const metadata: Metadata = {
  title: copy.memory.page.meta_title,
  description: copy.memory.page.intro,
};

export default function MemoryPage() {
  return (
    <main className="mx-auto flex w-full max-w-300 flex-1 flex-col gap-10 px-4 py-12 sm:px-6 md:px-12">
      <header className="flex max-w-2xl flex-col gap-2">
        <h1 className="text-title-1-medium text-text-primary">{copy.memory.page.title}</h1>
        <p className="text-body-regular text-text-secondary">{copy.memory.page.intro}</p>
      </header>
      <MemoryDemo />
      <section aria-labelledby="states-heading" className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h2 id="states-heading" className="text-title-2-medium text-text-primary">
            {copy.memory.page.states_heading}
          </h2>
          <p className="max-w-prose text-body-regular text-text-secondary">{copy.memory.page.states_note}</p>
        </div>
        <MemoryStates />
      </section>
    </main>
  );
}
