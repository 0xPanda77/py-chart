# Intraday Chart

1-minute candles for any US equity session, rendered with TradingView's
Lightweight Charts. Built to work around TradingView's free-tier limit on
intraday bar history.

Two implementations live here:

| | Path | Status |
| --- | --- | --- |
| **Next.js app** | `web/` | Current. Deploy this. |
| Streamlit app | `app.py` | Kept as-is, still runs. |

Both read the same providers and apply the same session rules. The Next.js app
exists because the Streamlit one becomes unusable after a handful of searches —
see [Why the rewrite](#why-the-rewrite).

## Data sources

Whichever providers have keys are offered; Massive is the default when both do.

|              | Massive (formerly Polygon.io) | Alpaca                |
| ------------ | ----------------------------- | --------------------- |
| Coverage     | Full consolidated tape        | Free plan is IEX only |
| Free history | 2 years (Basic plan)          | Back to 2016-01-01    |
| Free recency | End-of-day                    | 15-minute delayed     |
| Rate limit   | 5 calls/min                   | Generous              |
| Credentials  | One API key                   | Key ID + secret       |

**Prefer Massive.** On a thin small-cap, Alpaca's free IEX feed may return under
100 bars for a 390-minute session, because a bar only exists for minutes where a
trade printed on IEX specifically. Massive builds bars from trades across all
exchanges. Neither can invent a bar for a minute with no trades at all, so some
gaps are genuine inactivity.

If you have both keys, load the same session on each — the "Bars" metric shows
what share of the session you actually got. On AAPL, 16 Jun 2025: Massive
returns all 390 bars, Alpaca/IEX returns 387.

## Run the Next.js app

```bash
cd web
npm install
cp .env.example .env.local   # then fill in your keys
npm run dev                  # http://localhost:3000
```

```bash
npm test          # timezone + session-filter tests
npm run build
```

Keys are read from server env vars only and never reach the browser. Both
spellings work, so the repo's existing `.env` can be copied straight to
`web/.env.local`:

- `MASSIVE_API_KEY` or `POLYGON_API_KEY`
- `ALPACA_API_KEY` / `ALPACA_SECRET_KEY`, or `ALPACA_KEY` / `ALPACA_SECRET`

Use Alpaca **paper** keys — data keys and trading keys are the same credential.

## Deploy to Vercel

The app is one dynamic page plus one route handler, which fits the Hobby plan.

1. Push the repo to GitHub, import it at vercel.com.
2. **Set the project's Root Directory to `web`** — the repo root is the Python
   app and has no `package.json`.
3. Add the keys under Settings -> Environment Variables.
4. Deploy.

To keep it to yourself, put every deployment behind your own Vercel login:

```bash
vercel project protection enable <project> --sso
```

That is `ssoProtection.deploymentType: "all"`, which covers production as well
as previews. Anyone without access to your Vercel account gets a login wall, so
nobody else can spend your Massive rate limit. (Password protection — `--password` —
is the other option, but it needs a paid plan.)

## Why the rewrite

The Streamlit app gets slower with each search and eventually stops responding,
usually after four or five loads. It isn't React state or browser storage — the
app stores nothing client-side, and the DataFrame lives on the server.

`StreamlitChart` extends `StaticLWC`, which inlines the **entire** chart library
into an HTML string (210 KB of JS and CSS), appends every bar as a JSON literal,
and hands the result to `components.html()` — an `<iframe srcdoc="...">`.

| Load | Bundle | Data | Payload per render |
| --- | --- | --- | --- |
| 1 day, 1-min | 210 KB | 60 KB | 270 KB |
| 5 days, 1-min | 210 KB | 301 KB | 511 KB |

That runs on every *script rerun*, not every submit. Once `request` is in
session state the chart block re-executes whenever anything reruns the script —
every keystroke in the ticker box, every checkbox. Typing `TSLA` is four
rebuilds. Each one swaps the iframe's `srcdoc`, which tears down the document
and builds a fresh chart: new canvases (~8 MB each at 900x600 on a retina
display, several per chart), new `ResizeObserver`, new rAF loop. Browsers are
slow to reclaim detached iframe documents, so they stack up.

The Next.js app creates the chart **once**, on mount, and every later search is
a `setData()` call on series that already exist (`web/components/chart-panel.tsx`).
The library ships once as a cached static chunk instead of being re-sent inline
per interaction, and the browser holds exactly one chart instance no matter how
many symbols you look at.

Other things that came out in the wash:

- **No API keys in the browser.** The Streamlit app asked visitors to paste keys
  into sidebar password boxes, which needed `AUTOFILL_SYNC` — a `setInterval`
  that reached into the parent document to reset React's `_valueTracker` so
  password-manager autofill would reach the server. With server-side env vars,
  that whole mechanism is gone.
- **Honest timestamps.** The Python version handed the chart tz-naive ET
  datetimes, so the epoch values were wrong by the UTC offset. The Next.js app
  keeps true UTC epochs and formats to ET in `tickMarkFormatter` and
  `localization.timeFormatter`, so the exported CSV means what it says.
- **Requests cancel.** Pressing Load chart twice aborts the first fetch instead
  of racing it.

## Notes

- **Rebrand.** Polygon.io became Massive.com on 30 Oct 2025. Existing keys and
  accounts still work. Both apps use the new `api.massive.com` base;
  `api.polygon.io` remains supported for an extended period.
- **Adjustment.** Massive requests use `adjusted=true` and Alpaca uses
  `adjustment=all`, so a split between the chosen date and today doesn't leave a
  false gap in the chart.
- **Timezone.** Massive returns `t` as Unix milliseconds; Alpaca returns RFC-3339
  UTC. The regular-hours filter compares ET *wall clock*, so 09:30 is the real
  open in both EST and EDT — including on DST changeover days. `web/lib/session.ts`
  does this with `Intl`, no tz library, and `npm test` covers the edges.
- **Today's data.** Massive's Basic plan is end-of-day, so the current session
  won't be complete. Use Alpaca or pick an earlier date. The date picker
  defaults to 90 days back for this reason.
- **Days to load** counts *calendar* days ending on the chosen date, not trading
  days. Three days ending on a Monday includes the weekend, so you get one
  session.
- **Chart timestamps (Streamlit only).** The `time` column handed to
  `chart.set()` must be tz-naive `datetime64[ns]`. lightweight-charts converts
  it with `.astype("int64") // 10**9`, which is only correct at nanosecond
  resolution. pandas 2+ keeps whatever unit it was given, so
  `pd.to_datetime(t, unit="ms")` yields `datetime64[ms]`, that division returns
  ~1789 instead of ~1.79e9, and every bar lands on 1970-01-01 — while the raw
  data table still shows perfect dates. `finalize()` pins the unit with
  `.dt.as_unit("ns")`.

## Run the Streamlit app

Still works, unchanged.

```bash
pip install -r requirements.txt
streamlit run app.py     # http://localhost:8501
```

Keys go in `.streamlit/secrets.toml` (already gitignored) as `MASSIVE_API_KEY`,
`ALPACA_API_KEY`, `ALPACA_SECRET_KEY`.
