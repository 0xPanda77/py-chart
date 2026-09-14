import { INTERVALS, ProviderError, type Bar, type BarsQuery } from "../types.ts";
import { etWindow } from "../session.ts";
import { finalize } from "./finalize.ts";

const BASE = "https://api.massive.com";

type Agg = { t: number; o: number; h: number; l: number; c: number; v: number };

/**
 * Massive (formerly Polygon.io) — the full consolidated tape, so this is the
 * preferred source. Free Basic plan is end-of-day and 5 calls/min.
 */
export async function fetchMassive(q: BarsQuery, key: string): Promise<Bar[]> {
  const [multiplier, timespan] = INTERVALS[q.interval].massive;
  const { startDay, endDay } = etWindow(q.day, q.sessions);

  const url = new URL(
    `${BASE}/v2/aggs/ticker/${encodeURIComponent(q.symbol)}/range/${multiplier}/${timespan}/${startDay}/${endDay}`,
  );
  url.searchParams.set("adjusted", "true"); // split-adjusted; the default, but be explicit
  url.searchParams.set("sort", "asc");
  url.searchParams.set("limit", "50000"); // documented max; a session is well under this
  url.searchParams.set("apiKey", key);

  const res = await fetch(url, {
    signal: AbortSignal.timeout(30_000),
    // Mirrors the Python @st.cache_data(ttl=3600). Shared across every browser
    // tab and reload, not just one Streamlit session, so repeat searches for a
    // session you already pulled cost nothing against the 5/min limit.
    next: { revalidate: 3600 },
  });

  if (res.status === 401 || res.status === 403) {
    throw new ProviderError("Massive rejected the API key.", 401);
  }
  if (res.status === 429) {
    throw new ProviderError("Massive rate limit hit (free tier allows 5 calls/min).", 429);
  }
  if (!res.ok) {
    throw new ProviderError(`Massive returned ${res.status} ${res.statusText}.`);
  }

  const results: Agg[] = (await res.json())?.results ?? [];

  // 't' is the Unix MILLISECOND timestamp for the start of the bar.
  return finalize(
    results.map((r) => ({
      ms: r.t,
      open: r.o,
      high: r.h,
      low: r.l,
      close: r.c,
      volume: r.v,
    })),
    q.regularHoursOnly,
  );
}
