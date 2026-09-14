"use client";

import { useEffect, useRef } from "react";
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  createChart,
  createTextWatermark,
  type IChartApi,
  type ISeriesApi,
  type ITextWatermarkPluginApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { etDate, etDateTime, etTime } from "@/lib/session";
import type { Bar } from "@/lib/types";

const UP = "#26a69a";
const DOWN = "#ef5350";
const GRID = "#1f2937";
const TEXT = "#94a3b8";
const WATERMARK = "rgba(148,163,184,0.18)";

type ChartHandles = {
  chart: IChartApi;
  candles: ISeriesApi<"Candlestick">;
  volume: ISeriesApi<"Histogram">;
  watermark: ITextWatermarkPluginApi<Time> | null;
};

/**
 * The point of the rewrite.
 *
 * The Streamlit version rebuilt the whole chart on every script rerun: 210 KB
 * of inlined library plus every bar as JSON, dropped into an iframe srcdoc.
 * Each rebuild allocated a fresh set of canvases and left the previous document
 * detached, which is what made the app die after a handful of searches.
 *
 * Here the chart is created exactly once, on mount, and every subsequent search
 * is a setData() call on the series that already exist.
 */
export function ChartPanel({ bars, watermark }: { bars: Bar[]; watermark: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const handlesRef = useRef<ChartHandles | null>(null);

  // Mount only. No dependency may be added here without reintroducing the bug
  // this component exists to fix.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: TEXT,
        attributionLogo: false,
      },
      grid: { vertLines: { color: GRID }, horzLines: { color: GRID } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: GRID, scaleMargins: { top: 0.08, bottom: 0.28 } },
      timeScale: {
        borderColor: GRID,
        timeVisible: true,
        secondsVisible: false,
        // Bars carry true UTC epochs, so the axis would otherwise read in UTC
        // and 09:30 ET would show as 13:30. Format in ET instead of shifting
        // the timestamps, which keeps the CSV export honest.
        tickMarkFormatter: (time: Time) => {
          const sec = time as UTCTimestamp;
          return etTime(sec) === "00:00" ? etDate(sec) : etTime(sec);
        },
      },
      localization: { timeFormatter: (time: Time) => etDateTime(time as UTCTimestamp) },
    });

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: UP,
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
    });

    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "", // overlay scale, so volume sits under the candles
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });

    // A chart is constructed with an empty pane list — panes only exist once a
    // series has been added. So this must stay below the addSeries calls, and
    // the guard keeps a future reorder from throwing in here and leaving the
    // whole panel blank.
    const [pane] = chart.panes();
    const watermark = pane
      ? createTextWatermark(pane, {
          horzAlign: "center",
          vertAlign: "center",
          lines: [{ text: "", color: WATERMARK, fontSize: 34 }],
        })
      : null;

    handlesRef.current = { chart, candles, volume, watermark };

    return () => {
      chart.remove();
      handlesRef.current = null;
    };
  }, []);

  // Runs in the same commit as the mount effect above, so handles are set.
  useEffect(() => {
    const handles = handlesRef.current;
    if (!handles) return;

    handles.candles.setData(
      bars.map((b) => ({
        time: b.time as UTCTimestamp,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      })),
    );
    handles.volume.setData(
      bars.map((b) => ({
        time: b.time as UTCTimestamp,
        value: b.volume,
        color: b.close >= b.open ? "rgba(38,166,154,0.5)" : "rgba(239,83,80,0.5)",
      })),
    );
    handles.chart.timeScale().fitContent();
  }, [bars]);

  useEffect(() => {
    handlesRef.current?.watermark?.applyOptions({
      lines: [{ text: watermark, color: WATERMARK, fontSize: 34 }],
    });
  }, [watermark]);

  return <div ref={containerRef} className="h-full w-full" />;
}
