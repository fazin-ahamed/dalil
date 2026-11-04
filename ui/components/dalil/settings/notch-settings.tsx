"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { RiAlertLine, RiInformationLine, RiShutDownLine } from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { Kbd } from "@/components/base/kbd/kbd";
import { Switch } from "@/components/base/switch/switch";
import { NotchPanel } from "@/components/dalil/notch-panel";
import copy from "@/lib/copy.json";
import { cx } from "@/utils/cx";

/** Strings the shared copy file does not have yet. Listed in the task report. */
const LOCAL = {
  title: "Notch settings",
  on: "On",
  off: "Off",
  keepPayloads: "Keep payloads for debugging",
  keepPayloadsWarning: "Saves full requests on this computer, including what you said. Turn it off when you finish.",
  change: "Change",
  followsSystem: "Follows system",
  quit: "Quit Dalil",
  ctrl: "Ctrl",
  alt: "Alt",
};

const ROW = "flex min-h-11 w-full items-center gap-3 py-2.5";

function Helper({ children, warn = false }: { children: ReactNode; warn?: boolean }) {
  return (
    <span className={cx("flex items-start gap-1.5 text-body-2-regular", warn ? "text-notch-warn" : "text-text-tertiary")}>
      {warn && <RiAlertLine className="mt-px size-4 shrink-0" aria-hidden />}
      <span>{children}</span>
    </span>
  );
}

function ToggleRow({
  label,
  helper,
  warn,
  selected,
  onChange,
}: {
  label: string;
  helper: string;
  warn?: boolean;
  selected: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <li className="px-0">
      <Switch
        isSelected={selected}
        onChange={onChange}
        className={cx(ROW, "flex-row-reverse justify-between [&>span:last-child]:min-w-0 [&>span:last-child]:flex-1")}
      >
        <span className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="text-body-medium text-text-primary">{label}</span>
            <Helper warn={warn}>{helper}</Helper>
          </span>
          <span className="w-7 shrink-0 text-end text-body-medium text-text-secondary">{selected ? LOCAL.on : LOCAL.off}</span>
        </span>
      </Switch>
    </li>
  );
}

/** Compact settings list that hangs from the notch. State is always spelled out, never colour alone. */
export function NotchSettings({ className }: { className?: string }) {
  const [hideIdle, setHideIdle] = useState(true);
  const [largePointer, setLargePointer] = useState(false);
  const [screenshots, setScreenshots] = useState(false);
  const [keepPayloads, setKeepPayloads] = useState(false);

  return (
    <NotchPanel className={cx("flex flex-col p-4 pb-5 sm:p-5 sm:pb-6", className)}>
      <h2 className="flex min-h-9 items-center text-headline-semibold text-text-primary">{LOCAL.title}</h2>

      <ul className="mt-2 flex flex-col divide-y divide-separator-border border-y border-separator-border">
        <ToggleRow
          label={copy.settings.hide_when_idle.label}
          helper={copy.settings.hide_when_idle.helper}
          selected={hideIdle}
          onChange={setHideIdle}
        />

        <li className={cx(ROW, "justify-between max-sm:flex-wrap")}>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-body-medium text-text-primary">{copy.settings.shortcut.label}</span>
            <Helper>{copy.settings.shortcut.helper}</Helper>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Kbd className="min-w-8 bg-background-tertiary-default px-2 py-1 text-text-primary">{LOCAL.ctrl}</Kbd>
            <span aria-hidden className="text-body-2-regular text-text-tertiary">
              +
            </span>
            <Kbd className="min-w-8 bg-background-tertiary-default px-2 py-1 text-text-primary">{LOCAL.alt}</Kbd>
            <Button
              variant="secondary"
              size="small"
              className="relative ms-2 overflow-visible after:absolute after:-inset-y-1.5 after:inset-x-0 after:content-['']"
            >
              {LOCAL.change}
            </Button>
          </div>
        </li>

        <ToggleRow
          label={copy.settings.large_pointer.label}
          helper={copy.settings.large_pointer.helper}
          selected={largePointer}
          onChange={setLargePointer}
        />
        <ToggleRow
          label={copy.settings.use_screenshots.label}
          helper={copy.settings.use_screenshots.helper}
          selected={screenshots}
          onChange={setScreenshots}
        />
        <ToggleRow
          label={LOCAL.keepPayloads}
          helper={LOCAL.keepPayloadsWarning}
          warn
          selected={keepPayloads}
          onChange={setKeepPayloads}
        />

        <li className={cx(ROW, "justify-between")}>
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="text-body-medium text-text-primary">{copy.settings.reduce_motion.label}</span>
            <Helper>{copy.settings.reduce_motion.helper}</Helper>
          </div>
          <span className="flex shrink-0 items-center gap-1.5 text-body-medium text-text-secondary">
            <RiInformationLine className="size-4 text-foreground-icon-tertiary" aria-hidden />
            {LOCAL.followsSystem}
          </span>
        </li>
      </ul>

      <div className="mt-4 flex">
        <Button variant="secondary" size="medium" leadingIcon={RiShutDownLine}>
          {LOCAL.quit}
        </Button>
      </div>
    </NotchPanel>
  );
}
