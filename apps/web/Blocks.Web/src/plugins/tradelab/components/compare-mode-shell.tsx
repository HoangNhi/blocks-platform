import { X } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import type { TradeLabCompareModeState } from "../types"
import { CompareConfigDiffPanel } from "./compare-config-diff-panel"
import { CompareMetricsPanel } from "./compare-metrics-panel"
import { CompareTradeSummaryPanel } from "./compare-trade-summary-panel"

type CompareModeShellProps = {
  compareMode: TradeLabCompareModeState
  onExit: () => void
}

export function CompareModeShell({ compareMode, onExit }: CompareModeShellProps) {
  return (
    <div className="grid gap-4">
      <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
        <CardHeader className="space-y-3 border-b border-slate-200 bg-slate-50/80">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">Compare mode</Badge>
                <Badge className="bg-slate-700 hover:bg-slate-700">Run A vs Run B</Badge>
              </div>
              <CardTitle className="mt-2 text-lg">
                {compareMode.baseAnalysis.run.symbol} · {compareMode.baseAnalysis.run.timeframe} vs{" "}
                {compareMode.compareAnalysis.run.symbol} · {compareMode.compareAnalysis.run.timeframe}
              </CardTitle>
              <p className="mt-1 text-sm text-slate-500">
                {compareMode.baseAnalysis.run.id} → {compareMode.compareAnalysis.run.id}
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={onExit}>
              <X className="mr-2 size-4" aria-hidden="true" />
              Exit compare
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 p-4">
          {compareMode.datasetMismatchWarning ? (
            <Alert variant="destructive">
              <AlertTitle>Dataset mismatch</AlertTitle>
              <AlertDescription>{compareMode.datasetMismatchWarning}</AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <AlertTitle>Like-for-like comparison</AlertTitle>
              <AlertDescription>These two runs share the same symbol, timeframe, and date range.</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <CompareMetricsPanel metricDiffs={compareMode.metricDiffs} />
      <CompareConfigDiffPanel configDiff={compareMode.configDiff} datasetMismatchWarning={compareMode.datasetMismatchWarning} />
      <CompareTradeSummaryPanel tradeSummaryDiffs={compareMode.tradeSummaryDiffs} />
    </div>
  )
}
