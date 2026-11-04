import Link from "next/link";
import { RiArrowRightLine } from "@remixicon/react";
import { Stage } from "@/components/dalil/stage";
import copy from "@/lib/copy.json";

const ROUTES = [
  { href: "/foundations", name: "Foundations", line: "Colour, type, space, radius, elevation, icons and motion curves." },
  { href: "/notch", name: "Notch", line: "The black shape at the top of the screen, in all nine states." },
  { href: "/cards", name: "Guide cards", line: "Paper cards that draw themselves, and the pointer, ring and label that point." },
  { href: "/visuals", name: "Visuals", line: "Hand-inked notes on grid paper that draw in one item at a time." },
  { href: "/setup", name: "Setup", line: "Connect one AI endpoint: URL, key, model list and every failure." },
  { href: "/receipts", name: "Receipts", line: "What left this computer, as a table." },
  { href: "/memory", name: copy.memory.route.name, line: copy.memory.route.line },
  { href: "/projects", name: copy.projects.route.name, line: copy.projects.route.line },
];

const RULES = [
  {
    title: "Black speaks, paper shows, the pointer touches",
    body: "Status lives in the notch and teaching lives on paper. Only the pointer crosses between them.",
  },
  {
    title: "One endpoint, one model",
    body: "The user brings a base URL, an optional key and a model. Nothing else is configured.",
  },
  {
    title: "Esc clears everything",
    body: "The notch status, the pointer, the ring and every card go, from any state.",
  },
  {
    title: "Every spoken line has a caption",
    body: "The guiding text appears in the notch, so the voice is never the only channel.",
  },
];

export default function Page() {
  return (
    <main className="mx-auto flex w-full max-w-312 flex-1 flex-col gap-14 px-6 py-12">
      <header className="flex max-w-2xl flex-col gap-2 md:px-6">
        <h1 className="text-title-1-medium text-text-primary">Dalil design system</h1>
        <p className="text-body-regular text-text-secondary">
          A guide that points, draws and waits. Black for status, paper for teaching.
        </p>
      </header>

      <Stage />

      <div className="flex flex-col gap-14 md:px-6">
        <section aria-labelledby="routes" className="flex flex-col gap-3">
          <h2 id="routes" className="text-title-2-medium text-text-primary">
            The rest of the system
          </h2>
          <ul className="flex flex-col border-t border-separator-border">
            {ROUTES.map((r) => (
              <li key={r.href} className="border-b border-separator-border">
                <Link
                  href={r.href}
                  className="group flex min-h-16 items-center gap-4 rounded-lg py-3 outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                >
                  <span className="w-28 shrink-0 text-body-medium text-text-primary sm:w-40">{r.name}</span>
                  <span className="min-w-0 flex-1 text-body-regular text-text-secondary">{r.line}</span>
                  <RiArrowRightLine
                    aria-hidden
                    className="size-5 shrink-0 text-foreground-icon-tertiary transition-transform duration-150 ease-dalil-out group-hover:translate-x-0.5 motion-reduce:transition-none"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="rules" className="flex flex-col gap-6">
          <h2 id="rules" className="text-title-2-medium text-text-primary">
            Rules in one place
          </h2>
          <ol className="grid gap-x-8 gap-y-6 md:grid-cols-2">
            {RULES.map((r) => (
              <li key={r.title} className="flex flex-col gap-1 border-t border-separator-border pt-4">
                <h3 className="text-body-medium text-text-primary">{r.title}</h3>
                <p className="text-body-regular text-text-secondary">{r.body}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
