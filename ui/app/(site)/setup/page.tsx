import type { Metadata } from "next";
import { SetupDemo } from "@/components/dalil/setup/setup-demo";

export const metadata: Metadata = {
  title: "Endpoint setup | Dalil design system",
  description: "One custom endpoint: a base URL, an optional key, a model. The whole provider story lives in the notch.",
};

export default function SetupPage() {
  return (
    <main className="mx-auto flex w-full max-w-300 flex-1 flex-col gap-10 px-4 py-12 sm:px-6 md:px-12">
      <header className="flex max-w-2xl flex-col gap-2">
        <h1 className="text-title-1-medium text-text-primary">Endpoint setup</h1>
        <p className="text-body-regular text-text-secondary">
          Dalil talks only to the endpoint you give it. Enter a base URL, add a key if the server needs one, then pick a model.
          The whole flow works from the keyboard: Tab moves, Enter fetches, arrows move in the list, Esc closes.
        </p>
      </header>
      <SetupDemo />
    </main>
  );
}
