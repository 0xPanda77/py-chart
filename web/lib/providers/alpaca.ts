import { INTERVALS, ProviderError, type Bar, type BarsQuery } from "../types.ts";
import { etWindow } from "../session.ts";
import { finalize, type RawBar } from "./finalize.ts";

const BASE = "https://data.alpaca.markets/v2/stocks";

type AlpacaBar = { t: string; o: number; h: number; l: number; c: number; v: number };

/**
 * Alpaca market data. The free plan is IEX-only, so a bar exists only for
 * minutes where a trade printed on IEX specifically — thin tickers come back
 * sparse. SIP needs Algo Trader Plus.
 *
 * Uses the REST endpoint directly rather than alpaca-py's TypeScript cousin:
 * this is two fields and a page token, and it keeps the dependency list short.
 */
export async function fetchAlpaca(
  q: BarsQuery,
  key: string,
  secret: string,
): Promise<Bar[]> {
  const { startMs, endMs } = etWindow(q.day, q.sessions);

  const headers = {
    "APCA-API-KEY-ID": key,
    "APCA-API-SECRET-KEY": secret,
    accept: "application/json",
  };

  const raw: RawBar[] = [];
  let pageToken: string | undefined;

  // The window is small enough that one page is the norm, but a 15-day 1-min
  // pull can cross the 10k cap, and a truncated chart is worse than a slow one.
  do {
    const url = new URL(`${BASE}/${encodeURIComponent(q.symbol)}/bars`);
    url.searchParams.set("timeframe", INTERVALS[q.interval].alpaca);
    url.searchParams.set("start", new Date(startMs).toISOString());
    url.searchParams.set("end", new Date(endMs).toISOString());
    url.searchParams.set("feed", q.feed);
    url.searchParams.set("adjustment", "all"); // so a later split doesn't leave a false gap
    url.searchParams.set("limit", "10000");
    if (pageToken) url.searchParams.set("page_token", pageToken);

    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(30_000),
      next: { revalidate: 3600 },
    });

    if (res.status === 401 || res.status === 403) {
      throw new ProviderError("Alpaca rejected the key/secret pair.", 401);
    }
    if (res.status === 429) {
      throw new ProviderError("Alpaca rate limit hit.", 429);
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new ProviderError(
        `Alpaca returned ${res.status}. ${detail.slice(0, 200)}`.trim(),
      );
    }

    const body = await res.json();
    for (const b of (body?.bars ?? []) as AlpacaBar[]) {
      raw.push({
        ms: Date.parse(b.t), // RFC-3339 UTC
        open: b.o,
        high: b.h,
        low: b.l,
        close: b.c,
        volume: b.v,
      });
    }
    pageToken = body?.next_page_token ?? undefined;
  } while (pageToken);

  return finalize(raw, q.regularHoursOnly);
}
