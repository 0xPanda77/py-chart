"use client";

import { useMemo } from "react";
import { etDateTime } from "@/lib/session";
import type { Bar } from "@/lib/types";

const PREVIEW_ROWS = 500;

export function RawData({ bars, filename }: { bars: Bar[]; filename: string }) {
  const csv = useMemo(() => {
    const head = "time,open,high,low,close,volume";
    const rows = bars.map(
      (b) =>
        `${new Date(b.time * 1000).toISOString()},${b.open},${b.high},${b.low},${b.close},${b.volume}`,
    );
    return [head, ...rows].join("\n");
  }, [bars]);

  function download() {
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <details className="rounded border border-slate-800 bg-slate-900/40">
      <summary className="cursor-pointer select-none px-3 py-2 text-sm text-slate-300">
        Raw data
      </summary>
      <div className="border-t border-slate-800 p-3">
        <button
          type="button"
          onClick={download}
          className="mb-3 rounded border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:border-slate-500 hover:bg-slate-800"
        >
          Download CSV ({bars.length.toLocaleString()} bars)
        </button>
        {/* Only a slice is rendered. All of it goes into the CSV — putting a
            couple of thousand rows into the DOM is exactly the kind of cost
            this rewrite is trying to avoid. */}
        <div className="max-h-80 overflow-auto rounded border border-slate-800">
          <table className="w-full text-left font-mono text-xs">
            <thead className="sticky top-0 bg-slate-900 text-slate-400">
              <tr>
                {["Time (ET)", "Open", "High", "Low", "Close", "Volume"].map((h) => (
                  <th key={h} className="px-2 py-1.5 font-normal">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-slate-300">
              {bars.slice(0, PREVIEW_ROWS).map((b) => (
                <tr key={b.time} className="border-t border-slate-800/60">
                  <td className="px-2 py-1">{etDateTime(b.time)}</td>
                  <td className="px-2 py-1">{b.open.toFixed(2)}</td>
                  <td className="px-2 py-1">{b.high.toFixed(2)}</td>
                  <td className="px-2 py-1">{b.low.toFixed(2)}</td>
                  <td className="px-2 py-1">{b.close.toFixed(2)}</td>
                  <td className="px-2 py-1">{b.volume.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {bars.length > PREVIEW_ROWS && (
          <p className="mt-2 text-xs text-slate-500">
            Showing the first {PREVIEW_ROWS} of {bars.length.toLocaleString()} bars. The
            CSV has all of them.
          </p>
        )}
      </div>
    </details>
  );
}
