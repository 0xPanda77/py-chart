import { test } from "node:test";
import assert from "node:assert/strict";
import {
  etMidnightUtcMs,
  etMinuteOfDay,
  etTime,
  etWindow,
  shiftDate,
  MARKET_OPEN_MIN,
  MARKET_CLOSE_MIN,
} from "./session.ts";
import { finalize, type RawBar } from "./providers/finalize.ts";

const at = (iso: string) => Date.parse(iso);

test("midnight ET resolves to the right UTC instant on both sides of DST", () => {
  // EDT, UTC-4
  assert.equal(new Date(etMidnightUtcMs("2025-06-16")).toISOString(), "2025-06-16T04:00:00.000Z");
  // EST, UTC-5
  assert.equal(new Date(etMidnightUtcMs("2025-01-16")).toISOString(), "2025-01-16T05:00:00.000Z");
  // Spring-forward day: midnight is still EST, the jump happens at 02:00
  assert.equal(new Date(etMidnightUtcMs("2025-03-09")).toISOString(), "2025-03-09T05:00:00.000Z");
  // Fall-back day
  assert.equal(new Date(etMidnightUtcMs("2025-11-02")).toISOString(), "2025-11-02T04:00:00.000Z");
});

test("the open is minute 570 in both EDT and EST", () => {
  assert.equal(etMinuteOfDay(at("2025-06-16T13:30:00Z")), MARKET_OPEN_MIN); // EDT
  assert.equal(etMinuteOfDay(at("2025-01-16T14:30:00Z")), MARKET_OPEN_MIN); // EST
  assert.equal(MARKET_OPEN_MIN, 570);
  assert.equal(MARKET_CLOSE_MIN, 960);
});

test("ET clock formatting matches the session, not UTC", () => {
  assert.equal(etTime(at("2025-06-16T13:30:00Z") / 1000), "09:30");
  assert.equal(etTime(at("2025-06-16T19:59:00Z") / 1000), "15:59");
  assert.equal(etTime(at("2025-01-16T21:00:00Z") / 1000), "16:00");
});

test("shiftDate crosses months and leap days", () => {
  assert.equal(shiftDate("2025-03-01", -1), "2025-02-28");
  assert.equal(shiftDate("2024-03-01", -1), "2024-02-29");
  assert.equal(shiftDate("2025-01-01", -1), "2024-12-31");
  assert.equal(shiftDate("2025-06-16", 1), "2025-06-17");
});

test("etWindow spans whole ET days, end-exclusive", () => {
  const w = etWindow("2025-06-16", 3);
  assert.equal(w.startDay, "2025-06-14");
  assert.equal(new Date(w.startMs).toISOString(), "2025-06-14T04:00:00.000Z");
  assert.equal(new Date(w.endMs).toISOString(), "2025-06-17T04:00:00.000Z");
});

test("finalize keeps 09:30 and drops 16:00, and sorts", () => {
  const bar = (iso: string): RawBar => ({
    ms: at(iso), open: 1, high: 2, low: 0.5, close: 1.5, volume: 10,
  });
  const raw = [
    bar("2025-06-16T19:59:00Z"), // 15:59 ET — last bar of the session
    bar("2025-06-16T13:29:00Z"), // 09:29 ET — pre-market, dropped
    bar("2025-06-16T13:30:00Z"), // 09:30 ET — the open, kept
    bar("2025-06-16T20:00:00Z"), // 16:00 ET — the close, dropped (half-open)
  ];

  const rth = finalize(raw, true);
  assert.deepEqual(rth.map((b) => etTime(b.time)), ["09:30", "15:59"]);

  const all = finalize(raw, false);
  assert.equal(all.length, 4);
  const times = all.map((b) => b.time);
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
});

test("finalize converts ms to seconds", () => {
  const [b] = finalize([{ ms: 1750080600000, open: 1, high: 1, low: 1, close: 1, volume: 0 }], false);
  assert.equal(b.time, 1750080600);
});
