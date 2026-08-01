import { useMemo, useState } from "react"
import { History, PlaySquare, RotateCcw } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"

import type { TradeLabRunHistoryEntry } from "../types"
import { formatDateTime } from "../utils"
import { filterResearchRunHistory } from "../utils/research-run-readiness"

type RunHistoryListProps = {
  runs: TradeLabRunHistoryEntry[]
  selectedRunId: string | null
  latestCurrentRunId?: string | null
  currentRunIds?: Set<string>
  onOpenRun: (runId: string) => void
  onCompareSelectedRun?: (runId: string) => void
  onRefresh?: () => void
}

export function RunHistoryList({
  runs,
  selectedRunId,
  latestCurrentRunId = null,
  currentRunIds = new Set<string>(),
  onOpenRun,
  onCompareSelectedRun,
  onRefresh,
}: RunHistoryListProps) {
  const [currentConfigOnly, setCurrentConfigOnly] = useState(false)
  const [completedOnly, setCompletedOnly] = useState(false)
  const [hideFixtures, setHideFixtures] = useState(true)
  const selectedRun = runs.find((run) => run.id === selectedRunId) ?? null
  const visibleRuns = useMemo(
    () => filterResearchRunHistory(runs, { completedOnly, hideFixtures, currentConfigOnly, currentRunIds }),
    [completedOnly, currentConfigOnly, currentRunIds, hideFixtures, runs],
  )

  return (
    <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
      <CardHeader className="space-y-3 border-b border-slate-200 bg-slate-50/80">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="size-4 text-slate-600" aria-hidden="true" />
              Run history
            </CardTitle>
            <p className="mt-1 text-xs text-slate-500">Reopen previous runs and inspect their snapshot.</p>
          </div>
          {onRefresh ? (
            <div className="flex flex-wrap items-center gap-2">
              {onCompareSelectedRun && selectedRun?.status === "completed" ? (
                <Button type="button" variant="outline" size="sm" onClick={() => onCompareSelectedRun(selectedRun.id)}>
                  Compare with...
                </Button>
              ) : null}
              <Button type="button" variant="outline" size="sm" onClick={onRefresh}>
                <RotateCcw className="mr-2 size-4" aria-hidden="true" />
                Refresh
              </Button>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={currentConfigOnly} onChange={(event) => setCurrentConfigOnly(event.target.checked)} />
            Current config only
          </label>
          <label className="inline-flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={completedOnly} onChange={(event) => setCompletedOnly(event.target.checked)} />
            Completed only
          </label>
          <label className="inline-flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={hideFixtures} onChange={(event) => setHideFixtures(event.target.checked)} />
            Hide fixtures/test runs
          </label>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {visibleRuns.length === 0 ? (
          <div className="grid gap-2 p-4 text-sm text-slate-500">
            <strong className="text-slate-900">No run history yet.</strong>
            <span>Run a backtest or adjust filters to populate this list.</span>
          </div>
        ) : (
          <ScrollArea className="h-[420px]">
            <div className="grid gap-2 p-3">
              {visibleRuns.map((run) => {
                const selected = run.id === selectedRunId
                const latestCurrent = run.id === latestCurrentRunId

                return (
                  <button
                    key={run.id}
                    type="button"
                    onClick={() => onOpenRun(run.id)}
                    className={[
                      "grid gap-2 rounded-xl border p-3 text-left transition hover:bg-slate-50",
                      selected ? "border-blue-500 bg-blue-50/60" : "border-slate-200 bg-white",
                    ].join(" ")}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{run.status}</Badge>
                        <Badge className="bg-slate-700 hover:bg-slate-700">{run.pipelineStatus}</Badge>
                        {latestCurrent ? <Badge className="bg-blue-600 hover:bg-blue-600">Latest current config</Badge> : null}
                      </div>
                      <span className="text-xs text-slate-500">{formatDateTime(run.createdAt)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="grid gap-1">
                        <strong className="text-sm text-slate-900">
                          {run.symbol} - {run.timeframe}
                        </strong>
                        <span className="text-xs text-slate-500">
                          {formatDateTime(run.startAt)} to {formatDateTime(run.endAt)}
                        </span>
                        <span className="text-xs text-slate-500">
                          {run.id.slice(0, 8)} - {run.exchange}
                        </span>
                      </div>
                      <PlaySquare className="size-4 text-slate-400" aria-hidden="true" />
                    </div>
                    {run.errorMessage ? <span className="text-xs text-rose-600">{run.errorMessage}</span> : null}
                  </button>
                )
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}
