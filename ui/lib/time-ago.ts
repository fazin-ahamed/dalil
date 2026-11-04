/**
 * Short "how long ago" text for the Memory list. Pure: the caller passes `now` and the words, so this
 * file has no imports and runs under Node's test runner. Each word is a template with `{n}` for the count.
 */

/** The templates behind timeAgo, read from copy.json under `memory.time`. */
export interface TimeAgoWords {
  now: string;
  minutes: string;
  hours: string;
  days: string;
  weeks: string;
  months: string;
  years: string;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

function count(template: string, n: number): string {
  return template.replace("{n}", String(n));
}

/**
 * Returns "Just now", "5 min ago", "3 h ago", "2 d ago", "2 wk ago", "4 mo ago" or "1 y ago".
 * A time in the future counts as just now, and a time that cannot be read gives an empty string.
 */
export function timeAgo(iso: string, now: number, words: TimeAgoWords): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then) || Number.isNaN(now)) return "";
  const elapsed = now - then;
  if (elapsed < MINUTE) return words.now;
  if (elapsed < HOUR) return count(words.minutes, Math.floor(elapsed / MINUTE));
  if (elapsed < DAY) return count(words.hours, Math.floor(elapsed / HOUR));
  if (elapsed < WEEK) return count(words.days, Math.floor(elapsed / DAY));
  if (elapsed < MONTH) return count(words.weeks, Math.floor(elapsed / WEEK));
  const months = Math.floor(elapsed / MONTH);
  // Twelve months near the year mark reads as one year, so "12 mo ago" never appears.
  if (months < 12) return count(words.months, months);
  return count(words.years, Math.max(1, Math.floor(elapsed / YEAR)));
}
