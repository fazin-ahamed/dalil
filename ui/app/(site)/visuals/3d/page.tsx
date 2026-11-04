"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { SegmentedControl, SegmentedControlItem } from "@/components/base/segmented-control/segmented-control";
import { Model3DView } from "@/components/dalil/scene/model-3d";
import type { Model3DScene } from "@/lib/contracts";
import { EXAMPLE_JET } from "@/lib/scene";
import { cx } from "@/utils/cx";

/** A simple atom from primitives: a nucleus cluster, three tilted orbits and three electrons. */
const ATOM: Model3DScene = {
  type: "model3d",
  title: "Atom",
  parts: [
    { id: "proton-1", shape: "sphere", pos: [0.45, 0.45, 0.45], radius: 0.5, tone: "rose" },
    { id: "neutron-1", shape: "sphere", pos: [0.45, -0.45, -0.45], radius: 0.5, tone: "sand" },
    { id: "proton-2", shape: "sphere", pos: [-0.45, 0.45, -0.45], radius: 0.5, tone: "rose" },
    { id: "neutron-2", shape: "sphere", pos: [-0.45, -0.45, 0.45], radius: 0.5, tone: "sand" },
    { id: "orbit-1", shape: "torus", pos: [0, 0, 0], radius: 3, tube: 0.05, rot: [0, Math.PI / 2, 0], tone: "ink" },
    { id: "orbit-2", shape: "torus", pos: [0, 0, 0], radius: 3, tube: 0.05, rot: [Math.PI / 3, Math.PI / 2, 0], tone: "ink" },
    { id: "orbit-3", shape: "torus", pos: [0, 0, 0], radius: 3, tube: 0.05, rot: [-Math.PI / 3, Math.PI / 2, 0], tone: "ink" },
    { id: "electron-1", shape: "sphere", pos: [2.6, 1.5, 0], radius: 0.22, tone: "blue" },
    { id: "electron-2", shape: "sphere", pos: [2.6, -0.75, -1.3], radius: 0.22, tone: "blue" },
    { id: "electron-3", shape: "sphere", pos: [-2.6, -0.75, 1.3], radius: 0.22, tone: "blue" },
  ],
  labels: [
    { n: 1, text: "Nucleus", target: [0, 0, 0] },
    { n: 2, text: "Electron", target: "electron-1" },
    { n: 3, text: "Orbit", target: [0, 3, 0] },
  ],
  spin: true,
};

type Backdrop = "paper" | "night";

function Section({ id, title, intro, children }: { id: string; title: string; intro: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-6">
      <header className="flex max-w-2xl flex-col gap-1">
        <h2 id={id} className="text-title-3-semibold text-text-primary">
          {title}
        </h2>
        <p className="text-body-regular text-text-secondary">{intro}</p>
      </header>
      {children}
    </section>
  );
}

function Stage({ backdrop, children }: { backdrop: Backdrop; children: React.ReactNode }) {
  return (
    <div
      className={cx(
        "relative h-[460px] overflow-hidden rounded-3xl border border-border-button-default md:h-[540px]",
        backdrop === "paper" ? "bg-paper-2" : "bg-notch-raised",
      )}
    >
      {children}
    </div>
  );
}

export default function Page() {
  const [backdrop, setBackdrop] = useState<Backdrop>("paper");
  const [replay, setReplay] = useState(0);

  return (
    <main className="mx-auto flex w-full max-w-300 flex-1 flex-col gap-14 px-6 pt-12 pb-24 md:px-12">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-body-2-regular text-text-tertiary">
        <Link
          href="/visuals"
          className="rounded-md text-text-secondary outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
        >
          Visuals
        </Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">3D</span>
      </nav>

      <header className="flex max-w-2xl flex-col gap-2">
        <h1 className="text-title-1-medium text-text-primary">3D models</h1>
        <p className="text-body-regular text-text-secondary">
          Dalil floats a labelled model over the screen while it explains a mechanism. The model turns slowly, and each
          number pins one part.
        </p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <SegmentedControl
          aria-label="Backdrop"
          selectedKeys={[backdrop]}
          onSelectionChange={(keys) => {
            const next = [...keys][0];
            if (next === "paper" || next === "night") setBackdrop(next);
          }}
        >
          <SegmentedControlItem id="paper">Paper</SegmentedControlItem>
          <SegmentedControlItem id="night">Night</SegmentedControlItem>
        </SegmentedControl>
        <Button variant="secondary" size="medium" onClick={() => setReplay((n) => n + 1)}>
          Replay
        </Button>
      </div>

      <Section id="jet" title="Jet engine" intro="A cutaway of a turbofan. The front half is sliced away so the stages show.">
        <Stage backdrop={backdrop}>
          <Model3DView key={`jet-${replay}`} scene={EXAMPLE_JET} className="h-full w-full" />
        </Stage>
      </Section>

      <Section id="atom" title="Atom" intro="Built from spheres and rings. The labels point at the nucleus, an electron and an orbit.">
        <Stage backdrop={backdrop}>
          <Model3DView key={`atom-${replay}`} scene={ATOM} className="h-full w-full" />
        </Stage>
      </Section>
    </main>
  );
}
