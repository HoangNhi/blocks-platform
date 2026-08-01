import * as React from "react"

type StrategyLabEvaluatePanelProps = {
  runSummary: React.ReactNode
  scorecard: React.ReactNode
  chart: React.ReactNode
  tradeBreakdown: React.ReactNode
  tradeDetail: React.ReactNode
  equity: React.ReactNode
  metrics: React.ReactNode
  logs: React.ReactNode
}

export function StrategyLabEvaluatePanel({
  runSummary,
  scorecard,
  chart,
  tradeBreakdown,
  tradeDetail,
  equity,
  metrics,
  logs,
}: StrategyLabEvaluatePanelProps) {
  return (
    <section aria-label="Strategy Lab evaluation" className="grid gap-4">
      {runSummary}
      {scorecard}
      {chart}
      {tradeBreakdown}
      {tradeDetail}
      {equity}
      {metrics}
      {logs}
    </section>
  )
}
