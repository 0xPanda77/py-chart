"use client";

import { useEffect, useRef, useState } from "react";
import { ChartPanel } from "@/components/chart-panel";
import { RawData } from "@/components/raw-data";
import { Metrics } from "@/components/metrics";
import { EARLIEST } from "@/lib/session";
import {
  INTERVALS,
  PROVIDERS,
  type Bar,
  type BarsQuery,
  type BarsResponse,
  type Feed,
  type IntervalKey,
  type Provider,
} from "@/lib/types";

type Loaded = { query: BarsQuery; bars: Bar[] };
type Status = { kind: "idle" | "loading" } | { kind: "error"; message: string };

const same = (a: BarsQuery, b: BarsQuery) => JSON.stringify(a) === JSON.stringify(b);

export function Workbench({
  available,
  today,
  defaultDay,
}: {
  available: Provider[];
  today: string;
  defaultDay: string;
}) {
  const [form, setForm] = useState<BarsQuery>({
    provider: available[0] ?? "massive",
    symbol: "AAPL",
    day: defaultDay,
    sessions: 1,
    interval: "1min",
    feed: "iex",
    regularHoursOnly: true,
  });
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const set = <K extends keyof BarsQuery>(key: K, value: BarsQuery[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // One search at a time. Hammering Load chart cancels the previous request
  // rather than racing it, so a slow response can't overwrite a newer one.
  const inFlight = useRef<AbortController | null>(null);
  useEffect(() => () => inFlight.current?.abort(), []);

  async function load(event: React.FormEvent) {
    event.preventDefault();
    if (!available.length || !form.symbol.trim()) return;

    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;

    const query: BarsQuery = { ...form, symbol: form.symbol.trim().toUpperCase() };
    setStatus({ kind: "loading" });

    const params = new URLSearchParams({
      provider: query.provider,
      symbol: query.symbol,
      day: query.day,
      sessions: String(query.sessions),
      interval: query.interval,
      feed: query.feed,
      rth: query.regularHoursOnly ? "1" : "0",
    });

    try {
      const res = await fetch(`/api/bars?${params}`, { signal: controller.signal });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error ?? `Request failed (${res.status}).`);
      setLoaded({ query, bars: (body as BarsResponse).bars });
      setStatus({ kind: "idle" });
    } catch (error) {
      if (controller.signal.aborted) return;
      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  const stale = loaded !== null && !same(loaded.query, { ...form, symbol: form.symbol.trim().toUpperCase() });

  return (
    <div className="flex min-h-screen flex-col gap-4 p-4 lg:flex-row">
      <form
        onSubmit={load}
        className="h-fit w-full shrink-0 space-y-4 rounded-lg border border-slate-800 bg-slate-900/40 p-4 lg:w-72"
      >
        <h2 className="text-sm font-semibold tracking-wide text-slate-200">Settings</h2>

        {available.length === 0 ? (
          <p className="rounded border border-amber-800/60 bg-amber-950/40 p-2 text-xs text-amber-200">
            No API keys on the server. Set <code>MASSIVE_API_KEY</code> or{" "}
            <code>ALPACA_KEY</code> + <code>ALPACA_SECRET</code> and restart.
          </p>
        ) : available.length === 1 ? (
          <p className="text-xs text-slate-400">Source: {PROVIDERS[available[0]]}</p>
        ) : (
          <Field label="Data source">
            <Select
              value={form.provider}
              onChange={(v) => set("provider", v as Provider)}
              options={available.map((p) => [p, PROVIDERS[p]])}
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Load the same session on both to see how much IEX misses.
            </p>
          </Field>
        )}

        <Field label="Ticker">
          <input
            value={form.symbol}
            onChange={(e) => set("symbol", e.target.value.toUpperCase())}
            className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 font-mono text-sm text-slate-100 outline-none focus:border-slate-500"
          />
        </Field>

        <Field label="Session date">
          <input
            type="date"
            value={form.day}
            min={EARLIEST}
            max={today}
            onChange={(e) => set("day", e.target.value)}
            className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-slate-500 [color-scheme:dark]"
          />
        </Field>

        <Field label="Interval">
          <Select
            value={form.interval}
            onChange={(v) => set("interval", v as IntervalKey)}
            options={Object.entries(INTERVALS).map(([k, v]) => [k, v.label])}
          />
        </Field>

        <Field label="Days to load (ending on that date)">
          <input
            type="number"
            min={1}
            max={15}
            value={form.sessions}
            onChange={(e) => set("sessions", Math.trunc(Number(e.target.value)) || 1)}
            className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-slate-500"
          />
        </Field>

        {form.provider === "alpaca" && (
          <Field label="Feed">
            <Select
              value={form.feed}
              onChange={(v) => set("feed", v as Feed)}
              options={[
                ["iex", "IEX (free plan)"],
                ["sip", "SIP (paid plan)"],
              ]}
            />
            <p className="mt-1 text-[11px] text-slate-500">
              SIP needs Algo Trader Plus. On the free plan, leave this on IEX.
            </p>
          </Field>
        )}

        <label className="flex items-center gap-2 text-xs text-slate-300">
          <input
            type="checkbox"
            checked={form.regularHoursOnly}
            onChange={(e) => set("regularHoursOnly", e.target.checked)}
            className="accent-teal-500"
          />
          Regular hours only (09:30–16:00 ET)
        </label>

        <button
          type="submit"
          disabled={!available.length || !form.symbol.trim() || status.kind === "loading"}
          className="w-full rounded bg-teal-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-teal-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          {status.kind === "loading" ? "Fetching…" : "Load chart"}
        </button>

        {stale && status.kind !== "loading" && (
          <p className="text-[11px] text-amber-400">
            Settings changed — press Load chart to refresh.
          </p>
        )}
      </form>

      <main className="flex min-w-0 flex-1 flex-col gap-4">
        {status.kind === "error" && (
          <p className="rounded border border-red-900 bg-red-950/50 p-3 text-sm text-red-200">
            {status.message}
          </p>
        )}

        {loaded && <Metrics bars={loaded.bars} query={loaded.query} />}

        {/* Mounted once the first search lands and never unmounted after, so
            the chart instance survives every subsequent search. */}
        <div className="relative min-h-[28rem] flex-1 rounded-lg border border-slate-800 bg-slate-900/40 p-2">
          {loaded && loaded.bars.length > 0 ? (
            <ChartPanel
              bars={loaded.bars}
              watermark={`${loaded.query.symbol}  ·  ${loaded.query.day}`}
            />
          ) : (
            <div className="flex h-full min-h-[28rem] items-center justify-center px-6 text-center text-sm text-slate-500">
              {loaded
                ? `No bars for ${loaded.query.symbol} on ${loaded.query.day}. Weekend, market holiday, the symbol wasn't trading yet, or the date is outside your plan's history window (Massive Basic covers 2 years).`
                : "Choose your settings, then press Load chart."}
            </div>
          )}
        </div>

        {loaded && loaded.bars.length > 0 && (
          <>
            <p className="text-xs text-slate-500">
              {loaded.query.provider === "massive"
                ? "Massive aggregates the consolidated tape. Minutes with no trade anywhere still produce no bar — that's real inactivity, not missing data."
                : loaded.query.feed === "iex"
                  ? "IEX is a single exchange, so a bar only exists for minutes where a trade printed on IEX. Thin tickers will look sparse and volume is not representative of the wider market."
                  : "SIP is the consolidated tape. Minutes with no trade anywhere still produce no bar."}
            </p>
            <RawData
              bars={loaded.bars}
              filename={`${loaded.query.symbol}_${loaded.query.day}_${loaded.query.interval}_${loaded.query.provider}.csv`}
            />
          </>
        )}
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-slate-400">{label}</span>
      {children}
    </div>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-slate-500"
    >
      {options.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  );
}
