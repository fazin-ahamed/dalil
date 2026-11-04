export type GuideCardType = "steps" | "convert" | "checklist" | "explain";

export interface StepsData {
  strip: string;
  heading: string;
  subtitle?: string;
  /** Place value above each box, left to right. */
  places: string[];
  /** One digit per box. */
  digits: string[];
  /** Working lines, one per box. */
  working: string[];
  /** The answer line, on the lilac highlight. */
  answer: string;
  /** Plain closing line under the answer. */
  conclusion?: string;
  /** Digits shown greyed (a binary 0 that does not count). */
  dim?: number[];
  pill?: string;
}

export interface ConvertData {
  strip: string;
  heading: string;
  subtitle?: string;
  /** Small caption above the rail, for example "45 decimal → binary". */
  label: string;
  /** The values down the rail, ending in 0. */
  values: string[];
  /** One remainder per division, read upwards. */
  remainders: string[];
  /** The result line, on the lilac highlight. */
  result: string;
  pill?: string;
}

export interface ChecklistData {
  strip: string;
  heading: string;
  subtitle?: string;
  items: string[];
  pill?: string;
}

export interface ExplainData {
  strip: string;
  heading: string;
  body: string;
  /** A phrase inside `body` to put on the blue highlight. */
  mark?: string;
  /** The note that hangs off the margin arrow. */
  note: string;
  pill?: string;
}

export interface GuideCardHandle {
  /** Tick a checklist item with the hand-drawn check. */
  tick: (index: number) => void;
  untick: (index: number) => void;
  /** Clear every tick. */
  reset: () => void;
  /** The card's root element, for measuring before placement. */
  readonly element: HTMLElement | null;
}
