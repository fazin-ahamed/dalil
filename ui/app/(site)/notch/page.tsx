import { LiveNotch, NotchGallery } from "@/components/dalil/notch/notch-lab";

export const metadata = { title: "Notch states | Dalil design system" };

const RULES = [
  {
    title: "Morph by clip-path, not height",
    body: "The notch is one fixed element at its largest compact size. A clip-path reveals the current state, so width and height are never animated.",
  },
  {
    title: "The fast path",
    body: "Hotkey down starts Listening at once, in 160 ms with no delay. Every other change takes 360 ms on the drawer curve.",
  },
  {
    title: "Barge-in",
    body: "Change state at any moment, including mid-flight. Shape and content retarget from where they are, and pressing the hotkey in any state restarts Listening.",
  },
  {
    title: "Reduced motion",
    body: "The shape changes with a 120 ms fade instead of a morph. The waveform, the shimmer and the breathing mark hold still.",
  },
];

export default function Page() {
  return (
    <main className="mx-auto flex w-full max-w-300 flex-1 flex-col gap-14 px-6 py-12 md:px-12">
      <header className="flex max-w-2xl flex-col gap-2">
        <h1 className="text-title-1-medium text-text-primary">The notch</h1>
        <p className="text-body-regular text-text-secondary">
          One black shape hangs from the top of the screen and morphs between nine states, so status always appears in the same place.
        </p>
      </header>

      <section aria-labelledby="live" className="flex flex-col gap-5">
        <h2 id="live" className="text-title-2-medium text-text-primary">
          Live notch
        </h2>
        <LiveNotch />
      </section>

      <section aria-labelledby="states" className="flex flex-col gap-6">
        <div className="flex max-w-2xl flex-col gap-1">
          <h2 id="states" className="text-title-2-medium text-text-primary">
            States
          </h2>
          <p className="text-body-regular text-text-secondary">Every state at true size, with what enters it and what leaves it.</p>
        </div>
        <NotchGallery />
      </section>

      <section aria-labelledby="rules" className="flex flex-col gap-6">
        <h2 id="rules" className="text-title-2-medium text-text-primary">
          Rules
        </h2>
        <ul className="grid gap-x-8 gap-y-6 md:grid-cols-2">
          {RULES.map((r) => (
            <li key={r.title} className="flex flex-col gap-1">
              <h3 className="text-body-medium text-text-primary">{r.title}</h3>
              <p className="text-body-regular text-text-secondary">{r.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
