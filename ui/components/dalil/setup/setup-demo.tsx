"use client";

import { useState } from "react";
import { Focusable } from "react-aria-components";
import { Chip } from "@/components/base/badges/chip";
import { SegmentedControl, SegmentedControlItem } from "@/components/base/segmented-control/segmented-control";
import { Tooltip, TooltipTrigger } from "@/components/base/tooltip/tooltip";
import { SAMPLE_ENDPOINTS, normalizeBase } from "@/lib/endpoint";
import { EndpointNotch } from "./endpoint-notch";
import { GRID_PAPER } from "./grid-paper";
import { StatesGallery } from "./states-gallery";
import { useEndpointSetup, type SetupSource } from "./use-endpoint-setup";

const MODE_NOTE: Record<SetupSource, string> = {
  sample:
    "Sample hosts answer from this page, so every state is one click away. Nothing leaves your browser.",
  live: "Live request sends a real request from this browser to the address you enter. Your key goes only to that host.",
  native: "The desktop app sends the request from the app itself, so there is no browser limit.",
};

/** The interactive flow: a segmented control, the notch hanging from a desk strip, and the sample hosts. */
export function SetupDemo() {
  const [source, setSource] = useState<SetupSource>("sample");
  const { model, actions } = useEndpointSetup(source);
  const current = normalizeBase(model.baseUrl).base;

  return (
    <div className="flex flex-col gap-16">
      <section aria-labelledby="flow-heading" className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-8">
          <h2 id="flow-heading" className="sr-only">
            Try the flow
          </h2>
          <SegmentedControl
            aria-label="Where requests go"
            selectedKeys={[source]}
            onSelectionChange={(keys) => {
              const next = [...keys][0];
              if (next === "sample" || next === "live") setSource(next);
            }}
            className="self-start"
          >
            <SegmentedControlItem id="sample">Sample endpoints</SegmentedControlItem>
            <SegmentedControlItem id="live">Live request</SegmentedControlItem>
          </SegmentedControl>
          <p aria-live="polite" className="max-w-prose text-balance text-body-regular text-text-secondary md:max-w-md md:text-end">
            {MODE_NOTE[source]}
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-separator-border bg-paper-2 px-4 pb-8 sm:px-8" style={GRID_PAPER}>
          <EndpointNotch model={model} actions={actions} sampleMode={source === "sample"} />

          <div className="mt-8 flex flex-col items-center gap-1 text-center">
            {source === "sample" ? (
              <>
                <p className="text-body-medium text-text-primary">Sample hosts</p>
                <ul className="flex max-w-175 list-none flex-wrap justify-center gap-x-1.5 gap-y-1 p-0">
                  {SAMPLE_ENDPOINTS.map((sample) => {
                    const active = current === normalizeBase(sample.url).base;
                    return (
                      <li key={sample.url}>
                        <TooltipTrigger delay={400}>
                          <Focusable>
                            <button
                              type="button"
                              aria-label={`${sample.label}. ${sample.outcome}.`}
                              onClick={() => {
                                if (model.screen === "home") actions.openSetup();
                                actions.fetchModels(sample.url);
                              }}
                              className="group relative flex h-7 items-center rounded-md outline-none after:absolute after:-inset-y-2 after:inset-x-0 focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                            >
                              <Chip
                                variant="caption"
                                color={active ? "blue" : "soft"}
                                className="font-mono transition-colors duration-150 group-hover:bg-background-tertiary-default"
                              >
                                {sample.label}
                              </Chip>
                            </button>
                          </Focusable>
                          <Tooltip size="sm">{sample.outcome}</Tooltip>
                        </TooltipTrigger>
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <p className="max-w-prose text-body-regular text-text-secondary">
                A browser only reads answers from servers that allow this page. The Dalil desktop app has no such limit.
              </p>
            )}
          </div>
        </div>
      </section>

      <section aria-labelledby="states-heading" className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h2 id="states-heading" className="text-title-2-medium text-text-primary">
            States
          </h2>
          <p className="max-w-prose text-body-regular text-text-secondary">
            Every state the flow can reach, drawn by the same panels as above.
          </p>
        </div>
        <StatesGallery />
      </section>
    </div>
  );
}
