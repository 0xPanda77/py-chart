# Intraday Chart

A small Streamlit app that draws 1-minute candles for any US equity session back
to 2016, using Alpaca for data and TradingView's Lightweight Charts for rendering.

Built to work around TradingView's free-tier bar limit on intraday history.

## Run locally

```bash
pip install -r requirements.txt
streamlit run app.py
```

Opens at `http://localhost:8501`. You can paste your keys into the sidebar for a
one-off, or store them properly (below).

## Keys

Create `.streamlit/secrets.toml`:

```toml
ALPACA_API_KEY = "your-key-id"
ALPACA_SECRET_KEY = "your-secret"
```

Add `.streamlit/secrets.toml` to `.gitignore` before you commit anything.

Get keys from the Alpaca dashboard — a paper account works fine, and it doesn't
need to be funded.

## Deploy to Streamlit Community Cloud

1. Push this folder to a GitHub repo (without the secrets file).
2. Go to share.streamlit.io, sign in with GitHub, click **New app**.
3. Pick the repo, branch, and `app.py` as the entry point.
4. Under **Advanced settings → Secrets**, paste the same two lines from
   `secrets.toml`.
5. Deploy.

Free tier gives you one always-on public app. Anyone with the URL can use it and
burn your Alpaca rate limit, so keep the URL unlisted or add a password gate.

Hugging Face Spaces works too — create a Space with the Streamlit SDK, upload
these files, and set the keys as Space secrets.

## Notes on the data

- **Feed.** The free Alpaca plan serves the IEX feed only. IEX is one exchange,
  so volume is a small fraction of the consolidated tape and illiquid symbols
  will have visible gaps. Prices are real; volume is not representative. SIP
  (the full tape) needs the Algo Trader Plus subscription.
- **Adjustment.** Requests use `Adjustment.ALL`, so a split or dividend between
  the chosen date and today won't put a false gap in the chart.
- **Timezone.** Bars come back in UTC and are converted to America/New_York, so
  09:30 on the chart is the real open.
- **History.** Alpaca's minute data starts 2016-01-01.

## Switching to Massive (formerly Polygon.io)

Replace `fetch_bars` with a call to the aggregates endpoint:

```
https://api.polygon.io/v2/aggs/ticker/{SYMBOL}/range/1/minute/{FROM}/{TO}?apiKey={KEY}
```

The endpoint and keys are unchanged after the rebrand. Results arrive as `t`
(epoch ms), `o`, `h`, `l`, `c`, `v` — rename them to `time`/`open`/`high`/`low`/
`close`/`volume` and the rest of the app works as-is. The free tier is capped at
5 calls per minute, which is ample here since one session is one call.
