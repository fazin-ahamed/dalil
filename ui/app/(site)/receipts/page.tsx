import { DeskStrip } from "@/components/dalil/receipts/desk-strip";
import { ReceiptsPanel } from "@/components/dalil/receipts/receipts-panel";
import { SAMPLE_RECEIPTS } from "@/components/dalil/receipts/sample-data";
import { NotchSettings } from "@/components/dalil/settings/notch-settings";

export const metadata = { title: "Receipts and settings | Dalil design system" };

const HOST = "api.example.com";

export default function Page() {
  return (
    <main className="mx-auto flex w-full max-w-300 flex-1 flex-col gap-14 px-6 py-12 md:px-12">
      <header className="flex max-w-2xl flex-col gap-2">
        <h1 className="text-title-1-medium text-text-primary">Receipts and notch settings</h1>
        <p className="text-body-regular text-text-secondary">
          Black speaks: what left this computer, and the few switches that shape the notch. Every row on this page is sample data.
        </p>
      </header>

      <section aria-labelledby="board" className="flex flex-col gap-6">
        <h2 id="board" className="sr-only">
          Receipts and settings
        </h2>
        <div className="grid items-start gap-x-8 gap-y-12 lg:grid-cols-2">
          <DeskStrip label="Receipts, sample data">
            <ReceiptsPanel rows={SAMPLE_RECEIPTS} host={HOST} defaultExpanded={[]} />
          </DeskStrip>
          <DeskStrip label="Settings">
            <NotchSettings />
          </DeskStrip>
        </div>
      </section>

      <section aria-labelledby="states" className="flex flex-col gap-6">
        <div className="flex max-w-2xl flex-col gap-1">
          <h2 id="states" className="text-title-2-medium text-text-primary">
            Receipts states
          </h2>
          <p className="text-body-regular text-text-secondary">The empty list, and a row opened to show its payload hash and what was redacted.</p>
        </div>
        <div className="grid items-start gap-x-8 gap-y-12 lg:grid-cols-2">
          <DeskStrip label="Empty">
            <ReceiptsPanel rows={[]} host={null} />
          </DeskStrip>
          <DeskStrip label="Row expanded, sample data">
            <ReceiptsPanel rows={SAMPLE_RECEIPTS.slice(0, 3)} host={HOST} defaultExpanded={["r1"]} />
          </DeskStrip>
        </div>
      </section>
    </main>
  );
}
