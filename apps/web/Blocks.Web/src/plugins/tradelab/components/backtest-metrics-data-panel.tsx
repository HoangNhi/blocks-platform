import { Activity, ArrowUpRight, BadgeDollarSign, Scale, Trophy } from "lucide-react"

import { Panel } from "@/components/platform/panel"
import { StatCard } from "@/components/platform/stat-card"
import { StatusBadge } from "@/components/platform/status-badge"
import { cn } from "@/lib/utils"

import type {
  TradeLabCandleEntry,
  TradeLabEquityPoint,
  TradeLabMetricSnapshot,
  TradeLabOrderEntry,
} from "../types"
import {
  formatCurrency,
  formatDateTime,
  formatPercent,
  orderTone,
} from "../utils"

type BacktestMetricsDataPanelProps = {
  metrics: TradeLabMetricSnapshot | null
  equityCurve: TradeLabEquityPoint[]
  candles: TradeLabCandleEntry[]
  orders: TradeLabOrderEntry[]
}

export function BacktestMetricsDataPanel({
  metrics,
  equityCurve,
  candles,
  orders,
}: BacktestMetricsDataPanelProps) {
  if (!metrics) {
    return (
      <div className="rounded-xl border border-dashed border-platform-border bg-platform-surface-muted p-6 text-sm text-platform-muted">
        Run a backtest to load metrics, candles, and orders from TradeLab.
      </div>
    )
  }

  const isZeroTrade = metrics.totalTrades === 0
  const chartPath = buildChartPath(equityCurve)

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Total return"
          value={formatPercent(metrics.totalReturnPct)}
          helper="Return on initial equity"
          icon={ArrowUpRight}
          tone={metrics.totalReturnPct >= 0 ? "success" : "danger"}
        />
        <StatCard
          label="Max drawdown"
          value={formatPercent(metrics.maxDrawdownPct)}
          helper="Peak-to-trough decline"
          icon={Scale}
          tone="warning"
        />
        <StatCard
          label="Profit factor"
          value={metrics.profitFactor === null ? "N/A" : metrics.profitFactor.toFixed(2)}
          helper="Gross profit divided by gross loss"
          icon={BadgeDollarSign}
          tone="info"
        />
        <StatCard
          label="Win rate"
          value={metrics.winRatePct === null ? "N/A" : formatPercent(metrics.winRatePct)}
          helper="Closed trades that ended in profit"
          icon={Trophy}
          tone="info"
        />
        <StatCard
          label="Total trades"
          value={String(metrics.totalTrades)}
          helper="Filled market orders"
          icon={Activity}
          tone={metrics.totalTrades > 0 ? "primary" : "warning"}
        />
      </div>

      <Panel title="Equity Curve" meta={isZeroTrade ? "Flat sample output" : "Live backtest curve"}>
        <div className="p-4">
          <svg viewBox="0 0 1000 280" className="h-64 w-full rounded-xl bg-slate-50">
            <defs>
              <linearGradient id="trade-lab-equity-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#2563eb" stopOpacity="0.24" />
                <stop offset="100%" stopColor="#2563eb" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <path d={chartPath.line} fill="none" stroke="#2563eb" strokeWidth="4" />
            <path d={chartPath.area} fill="url(#trade-lab-equity-fill)" />
          </svg>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Candles Used" meta={`${candles.length} rows`}>
          <div className="max-h-[360px] overflow-auto">
            <table className="min-w-full divide-y divide-platform-border text-left text-sm">
              <thead className="bg-platform-surface-muted text-xs uppercase tracking-wide text-platform-muted">
                <tr>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3">Open</th>
                  <th className="px-4 py-3">High</th>
                  <th className="px-4 py-3">Low</th>
                  <th className="px-4 py-3">Close</th>
                  <th className="px-4 py-3">Volume</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-platform-border">
                {candles.map((candle, index) => (
                  <tr key={`${candle.openTime}-${index}`} className={cn(index % 2 === 1 && "bg-slate-50/50")}>
                    <td className="px-4 py-3 text-platform-ink">{formatDateTime(candle.openTime)}</td>
                    <td className="px-4 py-3">{formatCurrency(candle.open)}</td>
                    <td className="px-4 py-3">{formatCurrency(candle.high)}</td>
                    <td className="px-4 py-3">{formatCurrency(candle.low)}</td>
                    <td className="px-4 py-3 font-semibold text-platform-ink">{formatCurrency(candle.close)}</td>
                    <td className="px-4 py-3">{formatCompact(candle.volume)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Orders & Trades" meta={`${orders.length} rows`}>
          {orders.length === 0 ? (
            <div className="grid gap-2 p-4 text-sm text-platform-muted">
              <strong className="text-platform-ink">No trade orders yet.</strong>
              <span>Run a backtest with real backend data to populate orders here.</span>
            </div>
          ) : (
            <div className="max-h-[360px] overflow-auto">
              <table className="min-w-full divide-y divide-platform-border text-left text-sm">
                <thead className="bg-platform-surface-muted text-xs uppercase tracking-wide text-platform-muted">
                  <tr>
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Side</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Fill</th>
                    <th className="px-4 py-3">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-platform-border">
                  {orders.map((order, index) => (
                    <tr key={order.id} className={cn(index % 2 === 1 && "bg-slate-50/50")}>
                      <td className="px-4 py-3 text-platform-ink">{formatDateTime(order.timestamp)}</td>
                      <td className="px-4 py-3 uppercase tracking-wide">{order.side}</td>
                      <td className="px-4 py-3">
                        <StatusBadge tone={orderTone(order.status)}>{order.status}</StatusBadge>
                      </td>
                      <td className="px-4 py-3">
                        {order.fillPrice === null ? "-" : formatCurrency(order.fillPrice)}
                      </td>
                      <td className="px-4 py-3">{order.reason ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}

function buildChartPath(points: TradeLabEquityPoint[]) {
  if (points.length === 0) {
    return {
      line: "M 0 140 L 1000 140",
      area: "M 0 280 L 0 140 L 1000 140 L 1000 280 Z",
    }
  }

  const width = 1000
  const height = 280
  const padding = 24
  const usableWidth = width - padding * 2
  const usableHeight = height - padding * 2
  const equityValues = points.map((point) => point.equity)
  const minValue = Math.min(...equityValues)
  const maxValue = Math.max(...equityValues)
  const range = Math.max(maxValue - minValue, 1)

  const toPoint = (point: TradeLabEquityPoint, index: number) => {
    const x = padding + (usableWidth * index) / Math.max(points.length - 1, 1)
    const normalized = (point.equity - minValue) / range
    const y = height - padding - normalized * usableHeight
    return { x, y }
  }

  const coordinates = points.map(toPoint)
  const line = coordinates
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
    .join(" ")
  const area = `${line} L ${padding + usableWidth} ${height - padding} L ${padding} ${height - padding} Z`

  return { line, area }
}

function formatCompact(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value)
}
