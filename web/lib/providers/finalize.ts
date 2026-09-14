import { MARKET_CLOSE_MIN, MARKET_OPEN_MIN, etMinuteOfDay } from "../session.ts";
import type { Bar } from "../types.ts";

export type RawBar = {
  /** Bar start, Unix milliseconds UTC. */
  ms: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

/**
 * Filter to the session and hand back tidy OHLCV sorted by time.
 *
 * The Python finalize() had to strip the timezone and pin the column to
 * datetime64[ns], because the chart library divided raw int64 by 1e9 and any
 * other pandas unit silently collapsed every bar onto 1970-01-01. Here the wire
 * format is plain epoch seconds, so the only thing to get right is the ET
 * session boundary — which is a wall-clock comparison, not a UTC one.
 */
export function finalize(raw: RawBar[], regularHoursOnly: boolean): Bar[] {
  const kept = regularHoursOnly
    ? raw.filter((b) => {
        const min = etMinuteOfDay(b.ms);
        return min >= MARKET_OPEN_MIN && min < MARKET_CLOSE_MIN;
      })
    : raw;

  return kept
    .map(({ ms, open, high, low, close, volume }) => ({
      time: Math.floor(ms / 1000),
      open,
      high,
      low,
      close,
      volume,
    }))
    .sort((a, b) => a.time - b.time);
}
