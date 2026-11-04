"use client";

import { RiCheckLine, RiComputerLine, RiGlobalLine, RiReceiptLine, RiSettings3Line } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { IconButton, IconLinkButton } from "@/components/base/buttons/icon-button";
import { Chip } from "@/components/base/badges/chip";
import { Kbd } from "@/components/base/kbd/kbd";
import { cx } from "@/utils/cx";
import { HintTrigger } from "./hint-trigger";
import { copy, fill, local } from "./setup-copy";
import type { SetupActions, SetupModel } from "./setup-types";

/** Home is 184px tall in the notch spec (brief section 6.1). */
export const HOME_HEIGHT = 184;

const RING = "ring-offset-background-full";

/** Turns "Hold Ctrl + Alt and ..." into text with the two keys set as keycaps. */
function Hint({ text }: { text: string }) {
  return (
    <>
      {text.split(/(Ctrl|Alt)/).map((part, index) =>
        part === "Ctrl" || part === "Alt" ? <Kbd key={index}>{part}</Kbd> : <span key={index}>{part}</span>,
      )}
    </>
  );
}

export interface HomePanelProps {
  model: SetupModel;
  actions: SetupActions;
}

/** The Home face of the notch. Setup collapses into this after Save, with the endpoint chip. */
export function HomePanel({ model, actions }: HomePanelProps) {
  const saved = model.saved;
  const greeting = fill(copy.notch.home.greeting.evening, { name: local.sampleName });
  const Glyph = saved?.local ? RiComputerLine : RiGlobalLine;
  const hostLabel = saved ? (saved.local ? copy.notch.home.endpoint_chip_local : fill(copy.notch.home.endpoint_chip_remote, { host: saved.host })) : "";

  return (
    <section aria-label={local.homeLabel} className="relative flex flex-col items-center justify-center px-5 pt-12 pb-5 text-center" style={{ height: HOME_HEIGHT }}>
      <div className="absolute inset-x-4 top-3 flex items-center justify-between">
        <HintTrigger label={copy.aria.icon_buttons.receipts} placement="bottom start">
          <IconLinkButton
            icon={RiReceiptLine}
            href="/receipts"
            aria-label={copy.aria.icon_buttons.receipts}
            className={cx("after:absolute after:-inset-1", RING)}
          />
        </HintTrigger>
        <HintTrigger label={copy.aria.icon_buttons.gear} placement="bottom end">
          <IconButton
            icon={RiSettings3Line}
            aria-label={copy.aria.icon_buttons.gear}
            onClick={actions.openSetup}
            data-autofocus={saved ? true : undefined}
            className={cx("after:absolute after:-inset-1", RING)}
          />
        </HintTrigger>
      </div>

      <h2 className="text-title-2-semibold text-text-primary">{greeting}</h2>
      <p className="mt-1 flex flex-wrap items-center justify-center gap-x-1 gap-y-1 text-body-regular text-text-secondary">
        {saved ? <Hint text={copy.notch.home.hint} /> : copy.setup.first_run}
      </p>

      <div className="mt-4 flex min-h-7 flex-wrap items-center justify-center gap-x-3 gap-y-1">
        {saved ? (
          <>
            {model.justSaved ? (
              <p role="status" className="flex items-center gap-1 text-caption-1-medium text-text-secondary">
                <RiCheckLine className="size-4 shrink-0 text-notch-ok" aria-hidden />
                {copy.setup.saved}
              </p>
            ) : null}
            <button
              type="button"
              onClick={actions.openSetup}
              aria-label={saved.local ? copy.aria.icon_buttons.endpoint_chip_local : fill(copy.aria.icon_buttons.endpoint_chip, { host: saved.host })}
              className="group relative flex items-center gap-1.5 rounded-md outline-none after:absolute after:-inset-y-2.5 after:inset-x-0 focus-visible:ring-2 focus-visible:ring-border-focus-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background-full"
            >
              <Chip variant="caption" color="soft" className="gap-1.5 transition-colors duration-150 group-hover:bg-background-tertiary-default">
                <Glyph className="size-4 shrink-0" aria-hidden />
                {hostLabel}
              </Chip>
              <Chip variant="caption" color="soft" className="min-w-0 max-w-44 transition-colors duration-150 group-hover:bg-background-tertiary-default">
                <span className="truncate font-mono">{saved.model}</span>
              </Chip>
            </button>
          </>
        ) : (
          <Button size="small" className={RING} onClick={actions.openSetup} data-autofocus>
            {copy.setup.buttons.connect_endpoint}
          </Button>
        )}
      </div>
    </section>
  );
}
