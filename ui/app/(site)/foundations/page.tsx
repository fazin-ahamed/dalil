import { AnchorBar } from "@/components/dalil/foundations/anchor-bar";
import { BrandSection } from "@/components/dalil/foundations/brand-section";
import { getColourData } from "@/components/dalil/foundations/colour-data";
import { ColourSection } from "@/components/dalil/foundations/colour-section";
import { IconsSection } from "@/components/dalil/foundations/icons-section";
import { MotionSection } from "@/components/dalil/foundations/motion-section";
import { ScaleSection } from "@/components/dalil/foundations/scale-section";
import { Section } from "@/components/dalil/foundations/section";
import { TypeSection } from "@/components/dalil/foundations/type-section";

export const metadata = { title: "Foundations | Dalil design system" };

const ANCHORS = [
  { id: "colour", label: "Colour" },
  { id: "type", label: "Type" },
  { id: "space", label: "Space and elevation" },
  { id: "icons", label: "Icons" },
  { id: "motion", label: "Motion" },
  { id: "brand", label: "Brand" },
];

export default function Page() {
  const colour = getColourData();
  return (
    <main className="mx-auto flex w-full max-w-300 flex-1 flex-col gap-10 px-6 pt-12 pb-24 md:px-12">
      <header className="flex max-w-2xl flex-col gap-2">
        <h1 className="text-title-1-medium text-text-primary">Foundations</h1>
        <p className="text-body-regular text-text-secondary">
          Every colour, face, scale, icon and curve Dalil is built from. Colour values and contrast ratios are read from the theme file, so this page cannot drift from it.
        </p>
      </header>

      <AnchorBar items={ANCHORS} />

      <Section
        first
        id="colour"
        title="Colour"
        intro="Two fixed worlds with no theme switch: grid paper for teaching, night glass for status. Blue is the only hue."
      >
        <ColourSection data={colour} />
      </Section>

      <Section id="type" title="Type" intro="Three faces, each with one job. All are self-hosted, so local use never touches the network.">
        <TypeSection />
      </Section>

      <Section id="space" title="Space, radius and elevation" intro="A 4px grid, small radii for fields and large ones for sheets, and shadows that live in tokens.">
        <ScaleSection />
      </Section>

      <Section id="icons" title="Icons" intro="One outline family. Each icon below is rendered from its component reference.">
        <IconsSection />
      </Section>

      <Section id="motion" title="Motion" intro="Black and paper move differently: the notch changes shape on a spring-like curve, cards draw in order, and everything can be interrupted.">
        <MotionSection />
      </Section>

      <Section id="brand" title="Brand" intro="The mark, the wordmark, and how much room they need.">
        <BrandSection />
      </Section>
    </main>
  );
}
