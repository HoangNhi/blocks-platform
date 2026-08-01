import { useEffect, useMemo, useRef } from "react"
import {
  ColorType,
  createChart,
  createSeriesMarkers,
  CandlestickSeries,
  type CandlestickData,
  type CandlestickSeriesPartialOptions,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts"
import { ActivitySquare, CandlestickChart, Crosshair } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import type { TradeLabAnalyzedTrade, TradeLabChartMarker, TradeLabCandleEntry, TradeLabTradeDetail } from "../types"
import { formatDateTime } from "../utils"

type BacktestChartPanelProps = {
  candles: TradeLabCandleEntry[]
  markers: TradeLabChartMarker[]
  selectedTrade: TradeLabTradeDetail | null
  focusTrade: TradeLabAnalyzedTrade | null
  onMarkerSelect: (trade: TradeLabTradeDetail | null) => void
}

export function BacktestChartPanel({
  candles,
  markers,
  selectedTrade,
  focusTrade,
  onMarkerSelect,
}: BacktestChartPanelProps) {
  const priceContainerRef = useRef<HTMLDivElement | null>(null)

  const chartMarkers = useMemo(() => {
    return markers.map((marker) => {
      // Đánh dấu đặc biệt cho sự kiện thanh lý futures
      if (marker.kind === "LIQUIDATION") {
        return {
          time: toChartTime(marker.timestamp),
          position: "aboveBar" as const,
          color: "#dc2626",
          shape: "arrowDown" as const,
          id: marker.id,
          text: "💥 LIQ",
          size: 2,
        }
      }
      return {
        time: toChartTime(marker.timestamp),
        position: marker.side === "buy" ? ("belowBar" as const) : ("aboveBar" as const),
        color: marker.side === "buy" ? "#16a34a" : "#dc2626",
        shape: marker.side === "buy" ? ("arrowUp" as const) : ("arrowDown" as const),
        id: marker.id,
        text: marker.kind.toUpperCase(),
        size: 1,
      }
    }) satisfies SeriesMarker<Time>[]
  }, [markers])

  useEffect(() => {
    if (!priceContainerRef.current || candles.length === 0) {
      return
    }

    const container = priceContainerRef.current
    const chart = createChart(container, {
      autoSize: false,
      width: container.clientWidth,
      height: 380,
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: "#0f172a",
      },
      grid: {
        vertLines: { color: "#e2e8f0" },
        horzLines: { color: "#e2e8f0" },
      },
      rightPriceScale: {
        borderColor: "#cbd5e1",
      },
      timeScale: {
        borderColor: "#cbd5e1",
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: 1,
      },
    })

    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#16a34a",
      downColor: "#dc2626",
      borderUpColor: "#16a34a",
      borderDownColor: "#dc2626",
      wickUpColor: "#16a34a",
      wickDownColor: "#dc2626",
    } satisfies CandlestickSeriesPartialOptions)

    const candleSeriesData: CandlestickData[] = candles.map((candle) => ({
      time: toChartTime(candle.openTime),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
    }))
    series.setData(candleSeriesData)
    const seriesMarkers = createSeriesMarkers(series, chartMarkers)

    const focusRange = buildFocusRange(focusTrade, candles)
    if (focusRange) {
      chart.timeScale().setVisibleRange(focusRange)
    } else {
      chart.timeScale().fitContent()
    }

    const handleClick = (param: { time?: Time }) => {
      if (param.time === undefined) {
        return
      }
      const normalizedTime = String(param.time)
      const marker = markers.find((entry) => String(toChartTime(entry.timestamp)) === normalizedTime)
      if (!marker) {
        return
      }
      onMarkerSelect({
        marker,
        order: null,
        signal: marker.signal ?? null,
        logs: [],
      })
    }

    chart.subscribeClick(handleClick)

    const resize = () => {
      chart.applyOptions({ width: container.clientWidth })
    }

    window.addEventListener("resize", resize)
    resize()

    return () => {
      chart.unsubscribeClick(handleClick)
      window.removeEventListener("resize", resize)
      seriesMarkers.detach()
      chart.remove()
    }
  }, [candles, chartMarkers, focusTrade, markers, onMarkerSelect])

  if (candles.length === 0) {
    return (
      <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
        <CardHeader className="space-y-2">
          <Badge variant="outline" className="w-fit">
            <CandlestickChart className="mr-1 size-3.5" aria-hidden="true" />
            Chart
          </Badge>
          <CardTitle className="text-base">No chart data yet</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-500">
          Run a backtest to render candles and trade markers.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
      <CardHeader className="space-y-3 border-b border-slate-200 bg-slate-50/80">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="w-fit">
            <CandlestickChart className="mr-1 size-3.5" aria-hidden="true" />
            Price
          </Badge>
          {selectedTrade ? (
            <Badge className="w-fit">
              <ActivitySquare className="mr-1 size-3.5" aria-hidden="true" />
              Trade selected
            </Badge>
          ) : null}
          {focusTrade ? (
            <Badge variant="secondary" className="w-fit">
              <Crosshair className="mr-1 size-3.5" aria-hidden="true" />
              Focused trade
            </Badge>
          ) : null}
        </div>
        <CardTitle className="text-lg">Backtest chart</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 p-4">
        <div ref={priceContainerRef} className="min-h-[380px] w-full overflow-hidden rounded-xl border border-slate-200" />
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          Marker clicks update the trade detail panel. Rejected signals remain in logs.
          {focusTrade ? ` Focused trade starts at ${formatDateTime(focusTrade.entryTime)}.` : ""}
        </div>
      </CardContent>
    </Card>
  )
}

function toChartTime(timestamp: string): UTCTimestamp {
  return Math.floor(new Date(timestamp).getTime() / 1000) as UTCTimestamp
}

function buildFocusRange(
  focusTrade: TradeLabAnalyzedTrade | null,
  candles: TradeLabCandleEntry[],
): { from: UTCTimestamp; to: UTCTimestamp } | null {
  if (!focusTrade) {
    return null
  }

  const entry = toChartTime(focusTrade.entryTime)
  const exit = toChartTime(focusTrade.exitTime ?? focusTrade.entryTime)
  const candleStep =
    candles.length > 1 ? Math.max(toChartTime(candles[1].openTime) - toChartTime(candles[0].openTime), 3600) : 3600

  return {
    from: Math.max(entry - candleStep * 3, 0) as UTCTimestamp,
    to: Math.max(exit + candleStep * 3, entry + candleStep) as UTCTimestamp,
  }
}
