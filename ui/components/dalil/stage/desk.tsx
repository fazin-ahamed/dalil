"use client";

import { useState, type RefObject } from "react";
import {
  RiBattery2ChargeLine,
  RiComputerLine,
  RiVolumeUpLine,
  RiWifiLine,
} from "@remixicon/react";
import { Button } from "@/components/base/buttons/button";
import { Chip } from "@/components/base/badges/chip";
import { Kbd } from "@/components/base/kbd/kbd";
import { Switch } from "@/components/base/switch/switch";
import { PointerLabel, RingFrame, ringOutset } from "@/components/dalil/pointer/pointer-parts";
import copy from "@/lib/copy.json";
import { cx } from "@/utils/cx";
import { SECTION_LABEL, STAGE_COPY, type PanelState, type SectionId } from "./script";

/** A calm wallpaper from the accent ramp: flat shapes, no gradient. */
export function Wallpaper() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 1200 750"
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 size-full"
    >
      <rect width="1200" height="750" fill="var(--color-accent-200)" />
      <circle cx="1010" cy="150" r="250" fill="var(--color-accent-100)" />
      <circle cx="150" cy="560" r="170" fill="var(--color-accent-100)" />
      <path
        d="M0 520C190 440 380 470 570 540S920 650 1200 520V750H0Z"
        fill="var(--color-accent-300)"
      />
      <path
        d="M0 620C250 565 470 615 710 655S1030 705 1200 640V750H0Z"
        fill="var(--color-accent-400)"
      />
    </svg>
  );
}

/* ---------------------------------------------------------------- keys */

function KeyCap({ pressed, children }: { pressed: boolean; children: string }) {
  return (
    <Kbd
      data-pressed={pressed}
      className={cx(
        "h-9 min-w-14 rounded-xl px-3 text-body-2-semibold",
        "bg-paper-2 text-ink shadow-[0_3px_0_var(--color-rule-strong),0_0_0_1px_var(--color-control-edge)]",
        "transition-[transform,box-shadow] duration-100 ease-dalil-out motion-reduce:transition-none",
        pressed &&
          "translate-y-0.75 bg-accent-100 text-accent-700 shadow-[0_0_0_var(--color-rule-strong),0_0_0_1px_var(--color-accent-600)]",
      )}
    >
      {children}
    </Kbd>
  );
}

/** The hotkey, drawn as two keycaps that press while Dalil is listening. */
export function KeyHint({ ctrl, alt, className }: { ctrl: boolean; alt: boolean; className?: string }) {
  /* "Hold Ctrl + Alt and ask what's on your screen." split around the two keys. */
  const [lead, tail] = copy.notch.home.hint.split(/Ctrl \+ Alt/);
  return (
    <div className={cx("flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-body-medium text-ink", className)}>
      <span>{lead.trim()}</span>
      <KeyCap pressed={ctrl}>Ctrl</KeyCap>
      <span aria-hidden>+</span>
      <KeyCap pressed={alt}>Alt</KeyCap>
      <span>{tail.trim()}</span>
    </div>
  );
}

/* ---------------------------------------------------------------- settings panel */

const NAV: { id: SectionId; icon: typeof RiWifiLine }[] = [
  { id: "network", icon: RiWifiLine },
  { id: "display", icon: RiComputerLine },
  { id: "sound", icon: RiVolumeUpLine },
  { id: "power", icon: RiBattery2ChargeLine },
];

interface ExtraRow {
  id: string;
  title: string;
  on: boolean;
}

const EXTRAS: Record<Exclude<SectionId, "network">, ExtraRow[]> = {
  display: [
    { id: "night", title: "Night light", on: false },
    { id: "auto-brightness", title: "Auto brightness", on: true },
    { id: "dark", title: "Dark appearance", on: false },
    { id: "text", title: "Larger text", on: false },
  ],
  sound: [
    { id: "alerts", title: "Alert sounds", on: true },
    { id: "startup", title: "Play a sound on startup", on: false },
    { id: "mute-lock", title: "Mute when the screen locks", on: true },
    { id: "mono", title: "Mono audio", on: false },
  ],
  power: [
    { id: "saver", title: "Battery saver", on: false },
    { id: "dim", title: "Dim the screen when idle", on: true },
    { id: "percent", title: "Show battery percentage", on: true },
    { id: "sleep", title: "Sleep when the lid closes", on: true },
  ],
};

const NETWORK_EXTRAS: ExtraRow[] = [
  { id: "airplane", title: "Airplane mode", on: false },
  { id: "vpn", title: "VPN", on: false },
];


function SettingRow({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex h-14 items-center justify-between gap-4 border-b border-separator-border last:border-b-0 xl:h-18">
      <div className="min-w-0">
        <p className="text-body-medium text-text-primary max-xl:leading-5">{title}</p>
        {hint ? <p className="text-body-2-regular text-text-tertiary max-xl:hidden">{hint}</p> : null}
      </div>
      {children}
    </div>
  );
}

/** The ring on Network in the server-rendered frame. The live pointer layer draws the same ring. */
function StaticRing({ shown }: { shown: boolean }) {
  const out = ringOutset(false);
  return (
    <div
      aria-hidden
      className={cx(
        "pointer-events-none absolute z-10 transition-opacity duration-150 ease-dalil-out motion-reduce:transition-none",
        shown ? "opacity-100" : "opacity-0",
      )}
      style={{ inset: -out }}
    >
      <RingFrame radius={10 + out} />
      <PointerLabel
        text={STAGE_COPY.label1}
        stepText={copy.pointer.count.replace("{n}", "1").replace("{total}", String(STAGE_COPY.total))}
        className="absolute start-full top-1/2 ms-3 -translate-y-1/2"
      />
    </div>
  );
}

export interface SettingsPanelProps {
  panelRef: RefObject<HTMLDivElement | null>;
  networkRef: RefObject<HTMLButtonElement | null>;
  wifiRef: RefObject<HTMLLabelElement | null>;
  bluetoothRef: RefObject<HTMLLabelElement | null>;
  state: PanelState;
  locked: boolean;
  /** Draw the static ring on Network (the frame the server renders). */
  staticRing: boolean;
  onNav: (id: SectionId) => void;
  onWifi: (on: boolean) => void;
  onBluetooth: (on: boolean) => void;
  className?: string;
}

/** A sample Settings app built from real BoardUI controls. No window chrome. */
export function SettingsPanel({
  panelRef,
  networkRef,
  wifiRef,
  bluetoothRef,
  state,
  locked,
  staticRing,
  onNav,
  onWifi,
  onBluetooth,
  className,
}: SettingsPanelProps) {
  const [extras, setExtras] = useState<Record<string, boolean>>({});
  const extra = (row: ExtraRow) => extras[row.id] ?? row.on;
  const setExtra = (row: ExtraRow, on: boolean) => setExtras((prev) => ({ ...prev, [row.id]: on }));

  const rows = (list: ExtraRow[]) =>
    list.map((row) => (
      <SettingRow key={row.id} title={row.title} hint={extra(row) ? "On" : "Off"}>
        <Switch aria-label={row.title} isSelected={extra(row)} onChange={(on) => setExtra(row, on)} />
      </SettingRow>
    ));

  return (
    <div
      ref={panelRef}
      inert={locked}
      className={cx(
        "flex rounded-3xl border border-separator-border bg-background-primary-default shadow-card",
        className,
      )}
    >
      <nav
        aria-label="Sample settings sections"
        className="flex w-28 shrink-0 flex-col gap-1 rounded-s-3xl border-e border-separator-border bg-background-secondary-default p-2 xl:w-52 xl:p-3"
      >
        <p className="flex h-10 items-center px-2 text-body-semibold text-text-primary">Settings</p>
        {NAV.map(({ id, icon }) => {
          const selected = state.section === id;
          const pressed = state.press === id;
          return (
            <div key={id} className="relative">
              <Button
                ref={id === "network" ? networkRef : undefined}
                variant="ghost"
                size="medium"
                leadingIcon={icon}
                aria-current={selected ? "page" : undefined}
                onClick={() => onNav(id)}
                className={cx(
                  "w-full justify-start gap-1 px-2 max-xl:[&>svg]:hidden",
                  !selected && "bg-transparent text-text-secondary hover:bg-background-secondary-hover",
                  pressed && "scale-[0.98] bg-button-ghost-active",
                )}
              >
                {SECTION_LABEL[id]}
              </Button>
              {id === "network" ? <StaticRing shown={staticRing} /> : null}
            </div>
          );
        })}
      </nav>

      <section aria-label={SECTION_LABEL[state.section]} className="min-w-0 flex-1 px-4 pt-6 pb-4 xl:px-6">
        <div key={state.section} className="dalil-stage-fade">
          <div className="flex h-8 items-center justify-between gap-3">
            <h3 className="text-title-3-semibold text-text-primary">{SECTION_LABEL[state.section]}</h3>
            <Chip color="soft" variant="caption">
              {copy.cards.sample_tag}
            </Chip>
          </div>
          <div className="mt-8">
            {state.section === "network" ? (
              <>
                <SettingRow title="Wi-Fi" hint={state.wifi ? "On" : "Off"}>
                  <span
                    className={cx(
                      "rounded-full transition-transform duration-100 ease-dalil-out motion-reduce:transition-none",
                      state.press === "wifi" && "scale-95",
                    )}
                  >
                    <Switch
                      ref={wifiRef}
                      aria-label="Wi-Fi"
                      className="rounded-full"
                      isSelected={state.wifi}
                      onChange={onWifi}
                    />
                  </span>
                </SettingRow>
                <SettingRow title="Bluetooth" hint={state.bluetooth ? "On" : "Off"}>
                  <Switch
                    ref={bluetoothRef}
                    aria-label="Bluetooth"
                    className="rounded-full"
                    isSelected={state.bluetooth}
                    onChange={onBluetooth}
                  />
                </SettingRow>
                {rows(NETWORK_EXTRAS)}
              </>
            ) : (
              rows(EXTRAS[state.section])
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
