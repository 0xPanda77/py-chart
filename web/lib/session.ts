/**
 * Exchange-timezone helpers.
 *
 * The Python app leaned on pandas for all of this: tz_convert("America/New_York"),
 * then a tz-naive datetime64[ns] column handed to the chart. Here we keep bar
 * timestamps as true UTC epoch seconds and do every ET conversion explicitly,
 * so nothing downstream has to guess what a number means. Intl carries the
 * DST rules, so there is no tz library to keep current.
 */

export const ET = "America/New_York";

export const MARKET_OPEN_MIN = 9 * 60 + 30; // 09:30 ET
export const MARKET_CLOSE_MIN = 16 * 60; // 16:00 ET
export const EARLIEST = "2016-01-01";

const PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: ET,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

export type EtParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/** Wall-clock ET fields for a UTC instant. */
export function etParts(utcMs: number): EtParts {
  const out: Record<string, number> = {};
  for (const p of PARTS.formatToParts(new Date(utcMs))) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  // Intl renders midnight as hour 24 in some ICU versions; normalise it.
  if (out.hour === 24) out.hour = 0;
  return out as EtParts;
}

/** Minutes past ET midnight — what the regular-hours filter compares. */
export function etMinuteOfDay(utcMs: number): number {
  const p = etParts(utcMs);
  return p.hour * 60 + p.minute;
}

/** ET UTC-offset in ms at a given instant (negative: ET is behind UTC). */
function etOffsetMs(utcMs: number): number {
  const p = etParts(utcMs);
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wallAsUtc - utcMs;
}

/**
 * The UTC instant of midnight ET on a calendar date.
 *
 * Two passes: the offset depends on the instant we are still solving for, so
 * guess with UTC midnight, correct, then re-measure the offset at the corrected
 * instant in case the guess landed on the far side of a DST change.
 */
export function etMidnightUtcMs(isoDate: string): number {
  const [y, m, d] = isoDate.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const corrected = guess - etOffsetMs(guess);
  return guess - etOffsetMs(corrected);
}

/** YYYY-MM-DD, `days` calendar days before `isoDate`. Mirrors the Python window(). */
export function shiftDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Start (inclusive) and end (exclusive) UTC instants covering `sessions` ET days. */
export function etWindow(endDay: string, sessions: number) {
  return {
    startDay: shiftDate(endDay, -(sessions - 1)),
    endDay,
    startMs: etMidnightUtcMs(shiftDate(endDay, -(sessions - 1))),
    endMs: etMidnightUtcMs(shiftDate(endDay, 1)),
  };
}

const TIME_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: ET,
  hour12: false,
  hour: "2-digit",
  minute: "2-digit",
});

const DATE_FMT = new Intl.DateTimeFormat("en-GB", {
  timeZone: ET,
  day: "2-digit",
  month: "short",
});

/** "09:30" in ET, for the crosshair and time axis. */
export const etTime = (epochSec: number) => TIME_FMT.format(new Date(epochSec * 1000));

/** "16 Jun" in ET. */
export const etDate = (epochSec: number) => DATE_FMT.format(new Date(epochSec * 1000));

export function etDateTime(epochSec: number) {
  return `${etDate(epochSec)}  ${etTime(epochSec)}`;
}

export const todayInEt = () => {
  const p = etParts(Date.now());
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
};
