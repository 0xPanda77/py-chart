import { INTERVALS, type Bar, type BarsQuery } from "@/lib/types";

const RTH_MINUTES = 390; // 09:30–16:00

export function Metrics({ bars, query }: { bars: Bar[]; query: BarsQuery }) {
  if (!bars.length) return null;

  const first = bars[0];
  const last = bars[bars.length - 1];
  const change = ((last.close - first.open) / first.open) * 100;

  // A full regular session is 390 minutes; how many bars that is depends on the
  // interval. Outside regular hours there's no fixed denominator to compare to.
  const expected = query.regularHoursOnly
    ? Math.floor(RTH_MINUTES / INTERVALS[query.interval].minutes) * query.sessions
    : null;
  const coverage = expected ? `${Math.round((bars.length / expected) * 100)}% of session` : null;

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      <Stat label="Open" value={first.open.toFixed(2)} />
      <Stat label="High" value={Math.max(...bars.map((b) => b.high)).toFixed(2)} />
      <Stat label="Low" value={Math.min(...bars.map((b) => b.low)).toFixed(2)} />
      <Stat
        label="Close"
        value={last.close.toFixed(2)}
        note={`${change >= 0 ? "+" : ""}${change.toFixed(2)}%`}
        noteClass={change >= 0 ? "text-teal-400" : "text-red-400"}
      />
      <Stat label="Bars" value={bars.length.toLocaleString()} note={coverage} />
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  noteClass = "text-slate-500",
}: {
  label: string;
  value: string;
  note?: string | null;
  noteClass?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="font-mono text-lg text-slate-100">{value}</div>
      {note && <div className={`text-xs ${noteClass}`}>{note}</div>}
    </div>
  );
}
