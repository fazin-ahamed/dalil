import copy from "@/lib/copy.json";
import type { ChecklistData, ConvertData, ExplainData, StepsData } from "./types";

/** Sample content for the design system. Everything here is labelled "Sample" where it is shown. */

export const STEPS_SAMPLE: StepsData = {
  strip: "Octal to decimal",
  heading: "235 in octal",
  places: ["64", "8", "1"],
  digits: ["2", "3", "5"],
  working: ["2 × 64 = 128", "3 × 8 = 24", "5 × 1 = 5"],
  answer: "128 + 24 + 5 = 157",
  conclusion: "235 octal = 157 decimal",
  pill: copy.cards.pill_labels.convert,
};

export const CONVERT_SAMPLE: ConvertData = {
  strip: copy.cards.title_strips.convert,
  heading: copy.cards.samples.convert.heading,
  subtitle: copy.cards.samples.convert.subtitle,
  label: "45 decimal → binary",
  values: ["45", "22", "11", "5", "2", "1", "0"],
  remainders: ["1", "0", "1", "1", "0", "1"],
  result: "45 → 101101",
  pill: copy.cards.pill_alternates[1],
};

export const CHECKLIST_SAMPLE: ChecklistData = {
  strip: copy.cards.title_strips.checklist,
  heading: "Turn off Wi-Fi",
  subtitle: copy.cards.samples.checklist.subtitle,
  items: ["Open Network", "Find Wi-Fi", "Turn it off"],
  pill: copy.cards.pill_labels.checklist,
};

export const EXPLAIN_SAMPLE: ExplainData = {
  strip: copy.cards.title_strips.explain,
  heading: copy.cards.samples.explain.heading,
  body: copy.cards.samples.explain.body,
  mark: "1 left over",
  note: copy.cards.samples.explain.margin_note,
  pill: copy.cards.pill_labels.explain,
};
