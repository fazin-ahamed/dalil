"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/base/buttons/button";
import { cx } from "@/utils/cx";
import { LensFrame, PointerGlyph, PointerLabel, RingFrame, ringOutset } from "./pointer-parts";

/** Static specimens of the pointer kit for the design system. Nothing here moves. */

function Tile({ name, note, className, children }: { name: string; note: string; className?: string; children: ReactNode }) {
  return (
    <figure className="flex flex-col gap-2">
      <div className={cx("relative h-44 overflow-hidden rounded-card border border-rule", className)}>{children}</div>
      <figcaption className="flex flex-col">
        <span className="text-body-medium text-text-primary">{name}</span>
        <span className="text-body-2-regular text-text-tertiary">{note}</span>
      </figcaption>
    </figure>
  );
}

function RingOnTarget({ large = false }: { large?: boolean }) {
  const out = ringOutset(large);
  return (
    <div className="absolute inset-0 grid place-items-center">
      <div className="relative" style={{ padding: out }}>
        <RingFrame radius={10 + out} large={large} />
        <Button variant="secondary" size="medium" tabIndex={-1} aria-hidden>
          Display
        </Button>
      </div>
    </div>
  );
}

const BUSY =
  "bg-[repeating-linear-gradient(45deg,var(--color-control-edge)_0_10px,var(--color-muted)_10px_20px)]";

export function PointerSpecimens() {
  return (
    <div className="grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
      <Tile name="Pointer" note="20px arrow, 2px white outline, glow." className="bg-paper-2">
        <div className="absolute start-1/2 top-12">
          <PointerGlyph />
        </div>
      </Tile>
      <Tile name="Large pointer" note="28px pointer for the large setting." className="bg-paper-2">
        <div className="absolute start-1/2 top-10">
          <PointerGlyph large />
        </div>
      </Tile>
      <Tile name="Ring on light" note="2px ink inside, 2px white outside, 6px of air." className="bg-paper-2">
        <RingOnTarget />
      </Tile>
      <Tile name="Ring on dark" note="The white keyline carries it." className="bg-ink">
        <RingOnTarget />
      </Tile>
      <Tile name="Ring on a busy grey" note="Visible on a mid grey with texture." className={BUSY}>
        <RingOnTarget />
      </Tile>
      <Tile name="Large ring" note="3px keylines with the large pointer." className="bg-paper-2">
        <RingOnTarget large />
      </Tile>
      <Tile name="Label" note="Ink pill, 24 characters at most, optional step." className="bg-paper-2">
        <div className="absolute inset-0 flex flex-col items-start justify-center gap-4 ps-8">
          <PointerLabel text="Click here" />
          <PointerLabel text="Turn this on" stepText="2 of 5" />
        </div>
      </Tile>
      <Tile name="Callout" note="Under 16px: a 56px lens with a short stem." className="bg-paper-2">
        <div className="absolute" style={{ left: "calc(50% - 40px)", top: 112 }}>
          <div className="absolute -translate-x-1/2 -translate-y-1/2">
            <div className="relative" style={{ padding: ringOutset(false) }}>
              <RingFrame radius={8 + ringOutset(false)} />
              <span className="block size-3 rounded-[3px] border-2 border-accent-600 bg-box-fill" />
            </div>
          </div>
          <span
            aria-hidden
            className="absolute h-0.5 origin-left rounded-full bg-ink shadow-[0_0_0_1px_var(--color-text-white)]"
            style={{ left: 12.7, top: -12.7, width: 42, transform: "rotate(-45deg)" }}
          />
          <div className="absolute" style={{ left: 64 - 28, top: -64 - 28 }}>
            <LensFrame>
              <span className="absolute inset-0 grid place-items-center">
                <span className="block size-11 rounded-lg border-[6px] border-accent-600 bg-box-fill" />
              </span>
            </LensFrame>
          </div>
        </div>
      </Tile>
      <Tile name="Edge parking" note="Target off screen: park at the edge and say so." className="bg-paper-2">
        <div className="absolute start-1/2 bottom-3.5">
          <span className="absolute left-0 top-0 block origin-top-left rotate-225">
            <PointerGlyph />
          </span>
          <PointerLabel text="Scroll down" className="absolute bottom-6 left-0 -translate-x-1/2" />
        </div>
      </Tile>
    </div>
  );
}
