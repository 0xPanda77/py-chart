# Intraday Chart

A small Streamlit app that draws 1-minute candles for any US equity session,
using TradingView's Lightweight Charts for rendering.

Built to work around TradingView's free-tier limit on intraday bar history.

## Data sources

Two providers are supported. The app offers whichever ones you have keys for,
and defaults to Massive when both are present.

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
what share of the session you actually got.

## Run locally

```bash
pip install -r requirements.txt
streamlit run app.py
```

Opens at `http://localhost:8501`.

## Keys

Create `.streamlit/secrets.toml` with whichever you have:

```toml
MASSIVE_API_KEY = "your-massive-key"

ALPACA_API_KEY = "your-alpaca-key-id"
ALPACA_SECRET_KEY = "your-alpaca-secret"
```

`POLYGON_API_KEY` is accepted as an alias for `MASSIVE_API_KEY`.

Add `.streamlit/secrets.toml` to `.gitignore` before committing. Use Alpaca
**paper** keys — data keys and trading keys are the same credential.

## Deploy to Streamlit Community Cloud

1. Push this folder to GitHub (without the secrets file).
2. At share.streamlit.io, click **New app**, pick the repo and `app.py`.
3. Under **Settings -> Secrets**, paste the same lines as above.
4. Deploy.

Community Cloud apps are public by default, so anyone with the URL spends your
rate limit. Make the app private and whitelist viewers, or leave keys out of
secrets and type them into the sidebar per session.

## Notes

- **Rebrand.** Polygon.io became Massive.com on 30 Oct 2025. Existing keys and
  accounts still work. The app uses the new `api.massive.com` base;
  `api.polygon.io` remains supported for an extended period.
- **Adjustment.** Massive requests use `adjusted=true` and Alpaca uses
  `Adjustment.ALL`, so a split between the chosen date and today doesn't leave a
  false gap in the chart.
- **Timezone.** Massive returns `t` as Unix milliseconds; Alpaca returns UTC
  timestamps. Both are converted to America/New_York, so 09:30 on the chart is
  the real open.
- **Chart timestamps.** Pass real datetimes to `chart.set()`, never epoch ints.
  The library calls `pd.to_datetime()` on the column itself, and that reads a
  bare int as nanoseconds — every bar lands on 1970-01-01.
- **Today's data.** Massive's Basic plan is end-of-day, so the current session
  won't be complete. Use Alpaca or pick an earlier date.
- **Sparse data and interval inference.** The library infers the bar interval
  from the gaps between your timestamps. Irregularly spaced data (like Alpaca's
  IEX feed on a thin ticker) can throw that off. Another reason to prefer
  Massive.
