import { useSyncExternalStore } from "react";

const MINUTE_MS = 60_000;

function subscribe(onTick: () => void): () => void {
  const timer = window.setInterval(onTick, MINUTE_MS);
  return () => window.clearInterval(timer);
}

/** Whole minutes since the epoch. It changes once a minute, so React gets a stable snapshot. */
function currentMinute(): number {
  return Math.floor(Date.now() / MINUTE_MS);
}

/**
 * The current time to the minute, for "how long ago" text. It is null on the server and during
 * hydration, so the server HTML and the first client render match. After that it ticks once a minute.
 */
export function useClock(): number | null {
  const minute = useSyncExternalStore<number | null>(subscribe, currentMinute, () => null);
  return minute === null ? null : minute * MINUTE_MS;
}
