"""
Intraday chart viewer — Alpaca bars rendered with TradingView's Lightweight Charts.

Pick a ticker and a date, get 1-minute candles. Works for any session back to
2016-01-01, which is where Alpaca's history starts.
"""

import datetime as dt

import pandas as pd
import streamlit as st
from lightweight_charts.widgets import StreamlitChart

from alpaca.data.enums import Adjustment, DataFeed
from alpaca.data.historical import StockHistoricalDataClient
from alpaca.data.requests import StockBarsRequest
from alpaca.data.timeframe import TimeFrame, TimeFrameUnit

ET = "America/New_York"
MARKET_OPEN = dt.time(9, 30)
MARKET_CLOSE = dt.time(16, 0)
EARLIEST = dt.date(2016, 1, 1)  # Alpaca history begins here

TIMEFRAMES = {
    "1 min": TimeFrame(1, TimeFrameUnit.Minute),
    "5 min": TimeFrame(5, TimeFrameUnit.Minute),
    "15 min": TimeFrame(15, TimeFrameUnit.Minute),
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
# Data
# --------------------------------------------------------------------------
@st.cache_resource(show_spinner=False)
def get_client(key: str, secret: str) -> StockHistoricalDataClient:
    return StockHistoricalDataClient(key, secret)


@st.cache_data(ttl=3600, show_spinner=False)
def fetch_bars(
    _client: StockHistoricalDataClient,
    symbol: str,
    end_day: dt.date,
    sessions: int,
    tf_label: str,
    feed: str,
    regular_hours_only: bool,
) -> pd.DataFrame:
    """Fetch bars for `sessions` calendar days ending on `end_day` (inclusive)."""
    start_day = end_day - dt.timedelta(days=sessions - 1)

    # Alpaca wants UTC. Build the window in ET so the session lines up properly.
    start = pd.Timestamp(start_day, tz=ET).tz_convert("UTC").to_pydatetime()
    end = (
        (pd.Timestamp(end_day, tz=ET) + pd.Timedelta(days=1))
        .tz_convert("UTC")
        .to_pydatetime()
    )

    request = StockBarsRequest(
        symbol_or_symbols=symbol,
        timeframe=TIMEFRAMES[tf_label],
        start=start,
        end=end,
        feed=DataFeed.IEX if feed == "iex" else DataFeed.SIP,
        # 'all' applies both split and dividend adjustments, so a corporate
        # action between then and now doesn't put a fake gap in the chart.
        adjustment=Adjustment.ALL,
    )

    df = _client.get_stock_bars(request).df
    if df.empty:
        return pd.DataFrame()

    # bars.df is MultiIndexed on (symbol, timestamp)
    df = df.reset_index()
    df["timestamp"] = df["timestamp"].dt.tz_convert(ET)

    if regular_hours_only:
        times = df["timestamp"].dt.time
        df = df[(times >= MARKET_OPEN) & (times < MARKET_CLOSE)]

    if df.empty:
        return pd.DataFrame()

    # Lightweight Charts wants lowercase OHLCV and a naive 'time' column.
    df = df.rename(columns={"timestamp": "time"})
    df["time"] = df["time"].dt.tz_localize(None)
    return df[["time", "open", "high", "low", "close", "volume"]].reset_index(drop=True)


# --------------------------------------------------------------------------
# Sidebar
# --------------------------------------------------------------------------
with st.sidebar:
    st.header("Settings")

    key = load_secret("ALPACA_API_KEY")
    secret = load_secret("ALPACA_SECRET_KEY")

    if not (key and secret):
        st.caption("No keys found in secrets — enter them for this session.")
        key = st.text_input("API key ID", type="password")
        secret = st.text_input("Secret key", type="password")

    symbol = st.text_input("Ticker", value="AAPL").strip().upper()

    day = st.date_input(
        "Session date",
        value=dt.date.today() - dt.timedelta(days=90),
        min_value=EARLIEST,
        max_value=dt.date.today(),
    )

    tf_label = st.selectbox("Interval", list(TIMEFRAMES), index=0)
    sessions = st.number_input("Days to load (ending on that date)", 1, 5, 1)

    feed = st.radio(
        "Feed",
        ["iex", "sip"],
        format_func=lambda f: "IEX (free plan)" if f == "iex" else "SIP (paid plan)",
        help="SIP needs an Algo Trader Plus subscription. On the free plan, leave this on IEX.",
    )

    regular_hours_only = st.checkbox("Regular hours only (09:30–16:00 ET)", value=True)


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------
st.title("Intraday Chart")

if not (key and secret):
    st.info("Add your Alpaca API keys in the sidebar to get started.")
    st.stop()

if not symbol:
    st.warning("Enter a ticker.")
    st.stop()

try:
    with st.spinner(f"Fetching {symbol}…"):
        df = fetch_bars(
            get_client(key, secret),
            symbol,
            day,
            int(sessions),
            tf_label,
            feed,
            regular_hours_only,
        )
except Exception as exc:  # noqa: BLE001 — surface the real message to the user
    st.error(f"Couldn't fetch data: {exc}")
    st.stop()

if df.empty:
    st.warning(
        f"No bars for {symbol} on {day:%d %b %Y}. "
        "Weekend, market holiday, or the symbol wasn't trading yet."
    )
    st.stop()

first, last = df.iloc[0], df.iloc[-1]
change = (last["close"] - first["open"]) / first["open"] * 100

c1, c2, c3, c4, c5 = st.columns(5)
c1.metric("Open", f"{first['open']:.2f}")
c2.metric("High", f"{df['high'].max():.2f}")
c3.metric("Low", f"{df['low'].min():.2f}")
c4.metric("Close", f"{last['close']:.2f}", f"{change:+.2f}%")
c5.metric("Bars", f"{len(df):,}")

chart = StreamlitChart(width=1400, height=620)
chart.legend(visible=True)
chart.watermark(f"{symbol}  ·  {day:%d %b %Y}")
chart.set(df)
chart.load()

if feed == "iex":
    st.caption(
        "IEX is a single exchange, so volume is a fraction of the consolidated tape "
        "and thin symbols will show gaps. Switch to SIP if you have the paid plan."
    )

with st.expander("Raw data"):
    st.dataframe(df, use_container_width=True)
    st.download_button(
        "Download CSV",
        df.to_csv(index=False).encode(),
        file_name=f"{symbol}_{day:%Y-%m-%d}_{tf_label.replace(' ', '')}.csv",
        mime="text/csv",
    )