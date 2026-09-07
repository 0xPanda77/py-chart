"""
Intraday chart viewer — 1-minute candles for any US equity session.

Supports two data sources:
  * Massive (formerly Polygon.io) — full consolidated tape. Preferred.
  * Alpaca — free plan is IEX-only, so thin tickers come back sparse.

Only sources you have a key for are offered.
"""

import datetime as dt

import pandas as pd
import requests
import streamlit as st
from lightweight_charts.widgets import StreamlitChart

from alpaca.data.enums import Adjustment, DataFeed
from alpaca.data.historical import StockHistoricalDataClient
from alpaca.data.requests import StockBarsRequest
from alpaca.data.timeframe import TimeFrame, TimeFrameUnit

ET = "America/New_York"
MARKET_OPEN = dt.time(9, 30)
MARKET_CLOSE = dt.time(16, 0)
EARLIEST = dt.date(2016, 1, 1)

MASSIVE_BASE = "https://api.massive.com"

PROVIDER_NAMES = {
    "massive": "Massive (formerly Polygon.io)",
    "alpaca": "Alpaca",
}

# label -> (alpaca TimeFrame, massive (multiplier, timespan))
TIMEFRAMES = {
    "1 min": (TimeFrame(1, TimeFrameUnit.Minute), (1, "minute")),
    "5 min": (TimeFrame(5, TimeFrameUnit.Minute), (5, "minute")),
    "15 min": (TimeFrame(15, TimeFrameUnit.Minute), (15, "minute")),
}

st.set_page_config(page_title="Intraday Chart", layout="wide")


# --------------------------------------------------------------------------
# Credentials
# --------------------------------------------------------------------------
def load_secret(name: str) -> str:
    """Read from st.secrets, tolerating the file not existing at all."""
    try:
        return st.secrets.get(name, "")
    except Exception:
        return ""


# --------------------------------------------------------------------------
# Shared post-processing
# --------------------------------------------------------------------------
def finalize(df: pd.DataFrame, regular_hours_only: bool) -> pd.DataFrame:
    """Filter to the session and hand back tidy OHLCV in ET."""
    if df.empty:
        return pd.DataFrame()

    if regular_hours_only:
        times = df["time"].dt.time
        df = df[(times >= MARKET_OPEN) & (times < MARKET_CLOSE)]

    if df.empty:
        return pd.DataFrame()

    df = df.copy()
    df["time"] = df["time"].dt.tz_localize(None)
    return (
        df[["time", "open", "high", "low", "close", "volume"]]
        .sort_values("time")
        .reset_index(drop=True)
    )


def window(end_day: dt.date, sessions: int) -> tuple[dt.date, dt.date]:
    return end_day - dt.timedelta(days=sessions - 1), end_day


# --------------------------------------------------------------------------
# Massive
# --------------------------------------------------------------------------
@st.cache_data(ttl=3600, show_spinner=False)
def fetch_massive(
    _key: str,
    symbol: str,
    end_day: dt.date,
    sessions: int,
    tf_label: str,
    regular_hours_only: bool,
) -> pd.DataFrame:
    multiplier, timespan = TIMEFRAMES[tf_label][1]
    start_day, end_day = window(end_day, sessions)

    url = (
        f"{MASSIVE_BASE}/v2/aggs/ticker/{symbol}/range/"
        f"{multiplier}/{timespan}/{start_day:%Y-%m-%d}/{end_day:%Y-%m-%d}"
    )
    response = requests.get(
        url,
        params={
            "adjusted": "true",  # split-adjusted; default, but be explicit
            "sort": "asc",
            "limit": 50000,  # documented max; a session is well under this
            "apiKey": _key,
        },
        timeout=30,
    )

    if response.status_code in (401, 403):
        raise RuntimeError("Massive rejected the API key.")
    if response.status_code == 429:
        raise RuntimeError("Massive rate limit hit (free tier allows 5 calls/min).")
    response.raise_for_status()

    results = response.json().get("results") or []
    if not results:
        return pd.DataFrame()

    df = pd.DataFrame(results).rename(
        columns={"o": "open", "h": "high", "l": "low", "c": "close", "v": "volume"}
    )
    # 't' is the Unix MILLISECOND timestamp for the start of the bar.
    df["time"] = pd.to_datetime(df["t"], unit="ms", utc=True).dt.tz_convert(ET)
    return finalize(df, regular_hours_only)


# --------------------------------------------------------------------------
# Alpaca
# --------------------------------------------------------------------------
@st.cache_resource(show_spinner=False)
def alpaca_client(key: str, secret: str) -> StockHistoricalDataClient:
    return StockHistoricalDataClient(key, secret)


@st.cache_data(ttl=3600, show_spinner=False)
def fetch_alpaca(
    _client: StockHistoricalDataClient,
    symbol: str,
    end_day: dt.date,
    sessions: int,
    tf_label: str,
    feed: str,
    regular_hours_only: bool,
) -> pd.DataFrame:
    start_day, end_day = window(end_day, sessions)

    # Alpaca wants UTC; build the window in ET so the session lines up.
    start = pd.Timestamp(start_day, tz=ET).tz_convert("UTC").to_pydatetime()
    end = (
        (pd.Timestamp(end_day, tz=ET) + pd.Timedelta(days=1))
        .tz_convert("UTC")
        .to_pydatetime()
    )

    request = StockBarsRequest(
        symbol_or_symbols=symbol,
        timeframe=TIMEFRAMES[tf_label][0],
        start=start,
        end=end,
        feed=DataFeed.IEX if feed == "iex" else DataFeed.SIP,
        adjustment=Adjustment.ALL,
    )

    df = _client.get_stock_bars(request).df
    if df.empty:
        return pd.DataFrame()

    df = df.reset_index()  # MultiIndexed on (symbol, timestamp)
    df["time"] = df["timestamp"].dt.tz_convert(ET)
    return finalize(df, regular_hours_only)


# --------------------------------------------------------------------------
# Sidebar
# --------------------------------------------------------------------------
with st.sidebar:
    st.header("Settings")

    massive_key = load_secret("MASSIVE_API_KEY") or load_secret("POLYGON_API_KEY")
    alpaca_key = load_secret("ALPACA_API_KEY")
    alpaca_secret = load_secret("ALPACA_SECRET_KEY")

    if not (massive_key or (alpaca_key and alpaca_secret)):
        st.caption("No keys in secrets — add one below for this session.")
        with st.expander("Massive key", expanded=True):
            massive_key = st.text_input("API key", type="password", key="massive_in")
        with st.expander("Alpaca keys"):
            alpaca_key = st.text_input("API key ID", type="password", key="ak_in")
            alpaca_secret = st.text_input("Secret key", type="password", key="as_in")

    # Massive first — it's the better source, so it wins the default.
    available = []
    if massive_key:
        available.append("massive")
    if alpaca_key and alpaca_secret:
        available.append("alpaca")

    provider = None
    if len(available) == 1:
        provider = available[0]
        st.caption(f"Source: {PROVIDER_NAMES[provider]}")
    elif len(available) > 1:
        provider = st.radio(
            "Data source",
            available,
            format_func=PROVIDER_NAMES.get,
            help="Load the same session on both to see how much IEX misses.",
        )

    st.divider()

    symbol = st.text_input("Ticker", value="AAPL").strip().upper()

    day = st.date_input(
        "Session date",
        value=dt.date.today() - dt.timedelta(days=90),
        min_value=EARLIEST,
        max_value=dt.date.today(),
    )

    tf_label = st.selectbox("Interval", list(TIMEFRAMES), index=0)
    sessions = st.number_input("Days to load (ending on that date)", 1, 5, 1)

    feed = "iex"
    if provider == "alpaca":
        feed = st.radio(
            "Feed",
            ["iex", "sip"],
            format_func=lambda f: "IEX (free plan)" if f == "iex" else "SIP (paid plan)",
            help="SIP needs Algo Trader Plus. On the free plan, leave this on IEX.",
        )

    regular_hours_only = st.checkbox("Regular hours only (09:30–16:00 ET)", value=True)


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------
st.title("Intraday Chart")

if provider is None:
    st.info("Add a Massive or Alpaca key in the sidebar to get started.")
    st.stop()

if not symbol:
    st.warning("Enter a ticker.")
    st.stop()

try:
    with st.spinner(f"Fetching {symbol} from {PROVIDER_NAMES[provider]}…"):
        if provider == "massive":
            df = fetch_massive(
                massive_key, symbol, day, int(sessions), tf_label, regular_hours_only
            )
        else:
            df = fetch_alpaca(
                alpaca_client(alpaca_key, alpaca_secret),
                symbol,
                day,
                int(sessions),
                tf_label,
                feed,
                regular_hours_only,
            )
except Exception as exc:  # noqa: BLE001 — surface the real message
    st.error(f"Couldn't fetch data: {exc}")
    st.stop()

if df.empty:
    st.warning(
        f"No bars for {symbol} on {day:%d %b %Y}. Weekend, market holiday, the "
        "symbol wasn't trading yet, or the date is outside your plan's history "
        "window (Massive Basic covers 2 years)."
    )
    st.stop()

first, last = df.iloc[0], df.iloc[-1]
change = (last["close"] - first["open"]) / first["open"] * 100

# A full regular session is 390 one-minute bars.
expected = 390 if (regular_hours_only and tf_label == "1 min") else None
coverage = f"{len(df) / (expected * sessions):.0%} of session" if expected else None

c1, c2, c3, c4, c5 = st.columns(5)
c1.metric("Open", f"{first['open']:.2f}")
c2.metric("High", f"{df['high'].max():.2f}")
c3.metric("Low", f"{df['low'].min():.2f}")
c4.metric("Close", f"{last['close']:.2f}", f"{change:+.2f}%")
c5.metric("Bars", f"{len(df):,}", coverage, delta_color="off")

# Pass datetimes, NOT epoch ints. The library runs pd.to_datetime() on this
# column itself, and pd.to_datetime(1789000000) reads the int as nanoseconds,
# which lands every bar on 1970-01-01.
chart = StreamlitChart(width=900, height=600)
chart.legend(visible=True)
chart.watermark(f"{symbol}  ·  {day:%d %b %Y}")
chart.set(df)
chart.fit()
chart.load()

if provider == "alpaca" and feed == "iex":
    st.caption(
        "IEX is a single exchange, so a bar only exists for minutes where a trade "
        "printed on IEX. Thin tickers will look sparse and volume is not "
        "representative of the wider market."
    )
elif provider == "massive":
    st.caption(
        "Massive aggregates the consolidated tape. Minutes with no trade anywhere "
        "still produce no bar — that's real inactivity, not missing data."
    )

with st.expander("Raw data"):
    st.dataframe(df, use_container_width=True)
    st.download_button(
        "Download CSV",
        df.to_csv(index=False).encode(),
        file_name=f"{symbol}_{day:%Y-%m-%d}_{tf_label.replace(' ', '')}_{provider}.csv",
        mime="text/csv",
    )