import { useEffect, useMemo, useRef } from "react"
import { ColorType, createChart, LineSeries, type LineData, type LineSeriesPartialOptions, type UTCTimestamp } from "lightweight-charts"
import { ArrowUpRight, Scale } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import type { TradeLabEquityPoint } from "../types"
import { formatCurrency, formatPercent } from "../utils"

type EquityDrawdownPanelProps = {
  equityCurve: TradeLabEquityPoint[]
}

export function EquityDrawdownPanel({ equityCurve }: EquityDrawdownPanelProps) {
  const equityContainerRef = useRef<HTMLDivElement | null>(null)
  const drawdownContainerRef = useRef<HTMLDivElement | null>(null)

  const summary = useMemo(() => {
    const finalPoint = equityCurve[equityCurve.length - 1]
    const worstDrawdown = equityCurve.reduce((max, point) => Math.max(max, point.drawdownPct), 0)
    return {
      finalEquity: finalPoint?.equity ?? null,
      worstDrawdown,
    }
  }, [equityCurve])

  useEffect(() => {
    if (!equityContainerRef.current || equityCurve.length === 0) {
      return
    }

    const container = equityContainerRef.current
    const chart = createChart(container, {
      autoSize: false,
      width: container.clientWidth,
      height: 180,
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
    })

    const lineSeries = chart.addSeries(LineSeries, {
      color: "#2563eb",
      lineWidth: 2,
    } satisfies LineSeriesPartialOptions)

    const lineData: LineData[] = equityCurve.map((point) => ({
      time: toChartTime(point.timestamp),
      value: point.equity,
    }))
    lineSeries.setData(lineData)
    chart.timeScale().fitContent()

    const resize = () => {
      chart.applyOptions({ width: container.clientWidth })
    }

    window.addEventListener("resize", resize)
    resize()

    return () => {
      window.removeEventListener("resize", resize)
      chart.remove()
    }
  }, [equityCurve])

  useEffect(() => {
    if (!drawdownContainerRef.current || equityCurve.length === 0) {
      return
    }

    const container = drawdownContainerRef.current
    const chart = createChart(container, {
      autoSize: false,
      width: container.clientWidth,
      height: 140,
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
    })

    const lineSeries = chart.addSeries(LineSeries, {
      color: "#dc2626",
      lineWidth: 2,
    } satisfies LineSeriesPartialOptions)

    const lineData: LineData[] = equityCurve.map((point) => ({
      time: toChartTime(point.timestamp),
      value: point.drawdownPct,
    }))
    lineSeries.setData(lineData)
    chart.timeScale().fitContent()

    const resize = () => {
      chart.applyOptions({ width: container.clientWidth })
    }

    window.addEventListener("resize", resize)
    resize()

    return () => {
      window.removeEventListener("resize", resize)
      chart.remove()
    }
  }, [equityCurve])

  if (equityCurve.length === 0) {
    return (
      <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
        <CardHeader className="space-y-2 border-b border-slate-200 bg-slate-50/80">
          <Badge variant="outline" className="w-fit">
            Equity / drawdown
          </Badge>
          <CardTitle className="text-base">No equity data yet</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-500">
          Complete a backtest to inspect the equity curve and drawdown track.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
      <CardHeader className="space-y-3 border-b border-slate-200 bg-slate-50/80">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="w-fit">
            <ArrowUpRight className="mr-1 size-3.5" aria-hidden="true" />
            Equity curve
          </Badge>
          <Badge variant="secondary" className="w-fit">
            <Scale className="mr-1 size-3.5" aria-hidden="true" />
            Drawdown track
          </Badge>
        </div>
        <CardTitle className="text-lg">Equity and drawdown</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 p-4">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Final equity</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">
              {summary.finalEquity === null ? "N/A" : formatCurrency(summary.finalEquity)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">Worst drawdown</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{formatPercent(summary.worstDrawdown)}</p>
          </div>
        </div>
        <div ref={equityContainerRef} className="min-h-[180px] w-full overflow-hidden rounded-xl border border-slate-200" />
        <div ref={drawdownContainerRef} className="min-h-[140px] w-full overflow-hidden rounded-xl border border-slate-200" />
      </CardContent>
    </Card>
  )
}

function toChartTime(timestamp: string): UTCTimestamp {
  return Math.floor(new Date(timestamp).getTime() / 1000) as UTCTimestamp
}
