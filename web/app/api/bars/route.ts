import { NextResponse } from "next/server";
import { fetchAlpaca } from "@/lib/providers/alpaca";
import { fetchMassive } from "@/lib/providers/massive";
import { credentials } from "@/lib/credentials";
import { EARLIEST, todayInEt } from "@/lib/session";
import {
  INTERVALS,
  PROVIDERS,
  ProviderError,
  type BarsQuery,
  type BarsResponse,
  type Feed,
  type IntervalKey,
  type Provider,
} from "@/lib/types";

const MAX_SESSIONS = 15;
const SYMBOL_RE = /^[A-Z.\-]{1,10}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parse(params: URLSearchParams): BarsQuery {
  const provider = params.get("provider") ?? "";
  if (!(provider in PROVIDERS)) throw new ProviderError("Unknown data source.", 400);

  const symbol = (params.get("symbol") ?? "").trim().toUpperCase();
  if (!SYMBOL_RE.test(symbol)) throw new ProviderError("Invalid ticker.", 400);

  const day = params.get("day") ?? "";
  if (!DATE_RE.test(day) || Number.isNaN(Date.parse(day))) {
    throw new ProviderError("Invalid session date.", 400);
  }
  if (day < EARLIEST || day > todayInEt()) {
    throw new ProviderError(`Session date must be between ${EARLIEST} and today.`, 400);
  }

  const interval = params.get("interval") ?? "";
  if (!(interval in INTERVALS)) throw new ProviderError("Unknown interval.", 400);

  const sessions = Number(params.get("sessions") ?? "1");
  if (!Number.isInteger(sessions) || sessions < 1 || sessions > MAX_SESSIONS) {
    throw new ProviderError(`Days to load must be 1-${MAX_SESSIONS}.`, 400);
  }

  const feed = params.get("feed") === "sip" ? "sip" : "iex";

  return {
    provider: provider as Provider,
    symbol,
    day,
    sessions,
    interval: interval as IntervalKey,
    feed: feed as Feed,
    regularHoursOnly: params.get("rth") !== "0",
  };
}

export async function GET(request: Request) {
  try {
    const q = parse(new URL(request.url).searchParams);
    const { massive, alpacaKey, alpacaSecret } = credentials();

    let bars;
    if (q.provider === "massive") {
      if (!massive) throw new ProviderError("No Massive key configured on the server.", 400);
      bars = await fetchMassive(q, massive);
    } else {
      if (!alpacaKey || !alpacaSecret) {
        throw new ProviderError("No Alpaca credentials configured on the server.", 400);
      }
      bars = await fetchAlpaca(q, alpacaKey, alpacaSecret);
    }

    const body: BarsResponse = {
      bars,
      meta: { provider: q.provider, symbol: q.symbol, day: q.day, interval: q.interval },
    };
    return NextResponse.json(body);
  } catch (error) {
    if (error instanceof ProviderError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    // A provider timeout or DNS failure lands here. Surface the real message —
    // the Python app did the same, and a vague "something went wrong" on a
    // single-user tool just costs you a round trip to the logs.
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[/api/bars]", error);
    return NextResponse.json({ error: `Couldn't fetch data: ${message}` }, { status: 502 });
  }
}
