export const PROVIDERS = {
  massive: "Massive (formerly Polygon.io)",
  alpaca: "Alpaca",
} as const;

export type Provider = keyof typeof PROVIDERS;

/** label -> (minutes per bar, alpaca timeframe, massive [multiplier, timespan]) */
export const INTERVALS = {
  "1min": { label: "1 min", minutes: 1, alpaca: "1Min", massive: [1, "minute"] },
  "5min": { label: "5 min", minutes: 5, alpaca: "5Min", massive: [5, "minute"] },
  "15min": { label: "15 min", minutes: 15, alpaca: "15Min", massive: [15, "minute"] },
} as const satisfies Record<string, IntervalSpec>;

export type IntervalSpec = {
  label: string;
  minutes: number;
  alpaca: string;
  massive: readonly [number, string];
};

export type IntervalKey = keyof typeof INTERVALS;

export type Feed = "iex" | "sip";

/** One OHLCV bar. `time` is a true UTC epoch in SECONDS, as lightweight-charts wants. */
export type Bar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type BarsQuery = {
  provider: Provider;
  symbol: string;
  /** End of the window, as a YYYY-MM-DD calendar date in ET. */
  day: string;
  /** Calendar days to load, ending on `day`. Matches the Python app's window(). */
  sessions: number;
  interval: IntervalKey;
  feed: Feed;
  regularHoursOnly: boolean;
};

export type BarsResponse = {
  bars: Bar[];
  meta: { provider: Provider; symbol: string; day: string; interval: IntervalKey };
};

/** Thrown by providers with a message meant to be shown to the user verbatim. */
export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
