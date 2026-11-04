import type { Lesson } from "@/lib/contracts";
import copy from "@/lib/copy.json";

type SampleKey = keyof typeof copy.memory.samples;

/**
 * Seven sample lessons across the three kinds, newest first. The strings come from copy.json. The
 * dates are fixed so the server render and the browser agree; the "how long ago" text is worked out in the browser.
 */
const LAYOUT: Array<[SampleKey, Lesson["kind"], string, number]> = [
  ["figma_layout", "learned", "2026-11-02T19:40:00.000Z", 3],
  ["division_remainder", "struggled", "2026-10-31T16:05:00.000Z", 2],
  ["display_settings", "learned", "2026-10-27T10:30:00.000Z", 1],
  ["night_light", "struggled", "2026-10-20T08:15:00.000Z", 2],
  ["binary_decimal", "learned", "2026-10-12T21:00:00.000Z", 4],
  ["screenshot_shortcut", "asked", "2026-09-30T12:00:00.000Z", 1],
  ["dark_mode", "asked", "2026-08-18T14:20:00.000Z", 2],
];

export const SAMPLE_LESSONS: Lesson[] = LAYOUT.map(([key, kind, createdAt, seen]) => {
  const sample = copy.memory.samples[key];
  return {
    id: key,
    topic: sample.topic,
    note: sample.note,
    kind,
    app: "app" in sample ? sample.app : undefined,
    createdAt,
    seen,
  };
});
