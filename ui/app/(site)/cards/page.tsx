import { CardGallery } from "@/components/dalil/cards/card-gallery";
import { PillStates } from "@/components/dalil/cards/pill-states";
import { RoughFilters } from "@/components/dalil/cards/rough-filters";
import { FlightStage } from "@/components/dalil/pointer/flight-stage";
import { PointerSpecimens } from "@/components/dalil/pointer/pointer-specimens";

export const metadata = { title: "Guide cards | Dalil design system" };

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

export default function Page() {
  return (
    <main className="mx-auto flex w-full max-w-300 flex-1 flex-col gap-14 px-6 pt-12 pb-24 md:px-12">
      <RoughFilters />
      <header className="flex max-w-2xl flex-col gap-2">
        <h1 className="text-title-1-medium text-text-primary">Guide cards and pointer</h1>
        <p className="text-body-regular text-text-secondary">
          Paper shows, the pointer touches. Cards draw themselves in the order you will act, and the blue pointer flies to the control.
        </p>
      </header>

      <Section id="card-types" title="Card types" intro="Four cards, one anatomy. All figures are sample data. Replay redraws each one.">
        <CardGallery />
      </Section>

      <Section id="pill" title="Pill" intro="The one part of a card that takes a click. 36px to see, 44px to hit.">
        <PillStates />
      </Section>

      <Section id="pointer-kit" title="Pointer kit" intro="Pointer, ring, label, callout and edge parking. The ring stays visible on any background.">
        <PointerSpecimens />
      </Section>

      <Section id="flight" title="Flight" intro="Choose a control. The pointer arcs over, rings it, and the card draws beside it. Esc clears.">
        <FlightStage />
      </Section>
    </main>
  );
}
