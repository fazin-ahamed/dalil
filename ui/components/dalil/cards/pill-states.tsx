"use client";

import { GuidePill } from "./guide-pill";

const STATES = [
  { name: "Default", props: {} },
  { name: "Hover", props: { state: "hover" as const } },
  { name: "Pressed", props: { state: "pressed" as const } },
  { name: "Focus", props: { state: "focus" as const } },
  { name: "Disabled", props: { disabled: true } },
];

export function PillStates() {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-8 rounded-card border border-rule bg-paper-2 p-6 sm:grid-cols-3 lg:grid-cols-5">
      {STATES.map(({ name, props }) => (
        <div key={name} className="flex flex-col items-start gap-3">
          <GuidePill label="Let me try 146" {...props} />
          <span className="text-body-2-regular text-text-tertiary">{name}</span>
        </div>
      ))}
    </div>
  );
}
