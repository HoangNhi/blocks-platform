import type { TradeLabFuturesResearchSummary } from "../types"

type FuturesResearchSummaryPanelProps = {
  summary: TradeLabFuturesResearchSummary
}

function metric(value: number | null, suffix = ""): string {
  if (value == null) return "—"
  return `${value.toFixed(2)}${suffix}`
}

export function FuturesResearchSummaryPanel({ summary }: FuturesResearchSummaryPanelProps) {
  return (
    <div className="grid gap-3 rounded-lg border border-platform-border bg-white p-4">
      <div className="grid gap-1">
        <h3 className="text-sm font-semibold text-platform-ink">Futures research summary</h3>
        <p className="text-xs text-platform-muted">
          Funding, liquidation, leverage, and margin-pressure evidence from the canonical futures engine.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs text-platform-muted">Funding paid</p>
          <p className="text-lg font-semibold text-platform-ink">{metric(summary.totalFundingFeePaid)}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs text-platform-muted">Liquidations</p>
          <p className="text-lg font-semibold text-platform-ink">{summary.liquidationCount}</p>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs text-platform-muted">Max margin usage</p>
          <p className="text-lg font-semibold text-platform-ink">{metric(summary.maxMarginUsagePct, "%")}</p>
        </div>
      </div>
      <div className="grid gap-2 text-xs text-platform-muted md:grid-cols-3">
        <div>Avg leverage used: <span className="font-medium text-platform-ink">{metric(summary.avgLeverageUsed, "x")}</span></div>
        <div>Long / short trades: <span className="font-medium text-platform-ink">{summary.longTrades} / {summary.shortTrades}</span></div>
        <div>Maintenance pressure: <span className="font-medium text-platform-ink">{metric(summary.maxMaintenanceMarginPct, "%")}</span></div>
      </div>
    </div>
  )
}
