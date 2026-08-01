import { AlertTriangle, Clock3, RefreshCw, TimerReset } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

import type { TradeLabJobVisibilityItem, TradeLabStrategyJobVisibility } from "../types"
import { formatDateTime } from "../utils"

type JobVisibilityPanelProps = {
  visibility: TradeLabStrategyJobVisibility | null
  isLoading?: boolean
  errorMessage?: string | null
  onRefresh?: () => void
}

export function JobVisibilityPanel({
  visibility,
  isLoading = false,
  errorMessage = null,
  onRefresh,
}: JobVisibilityPanelProps) {
  const active = visibility?.active ?? []
  const recent = visibility?.recent ?? []
  const hasJobs = active.length > 0 || recent.length > 0
  const staleCount = active.filter((item) => item.isStale).length

  return (
    <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
      <CardHeader className="space-y-3 border-b border-slate-200 bg-slate-50/80">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <TimerReset className="size-4 text-blue-600" aria-hidden="true" />
              Job visibility
            </CardTitle>
            <p className="mt-1 text-xs text-slate-500">Current strategy active jobs and latest finished runs.</p>
          </div>
          <div className="flex items-center gap-2">
            {active.length > 0 ? <Badge className="bg-blue-600 hover:bg-blue-600">{active.length} active</Badge> : null}
            {staleCount > 0 ? <Badge className="bg-amber-600 hover:bg-amber-600">{staleCount} stale</Badge> : null}
            {onRefresh ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onRefresh}
                disabled={isLoading}
                aria-label="Refresh job visibility"
              >
                <RefreshCw className={isLoading ? "mr-2 size-4 animate-spin" : "mr-2 size-4"} aria-hidden="true" />
                Refresh
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 p-4">
        {errorMessage ? (
          <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            <AlertTriangle className="mt-0.5 size-4" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        ) : null}

        {isLoading && !visibility ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Loading job visibility...
          </div>
        ) : null}

        {!isLoading && !errorMessage && !hasJobs ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            No active or recent jobs for this strategy.
          </div>
        ) : null}

        {active.length > 0 ? (
          <section className="grid gap-2" aria-label="Active jobs">
            <SectionHeader label="Active jobs" count={active.length} />
            {active.map((item) => (
              <JobRow key={item.run.id} item={item} active />
            ))}
          </section>
        ) : null}

        {recent.length > 0 ? (
          <>
            <Separator />
            <section className="grid gap-2" aria-label="Recent jobs">
              <SectionHeader label="Recent jobs" count={recent.length} />
              {recent.map((item) => (
                <JobRow key={item.run.id} item={item} />
              ))}
            </section>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="font-medium text-slate-900">{label}</span>
      <span className="text-slate-500">{count}</span>
    </div>
  )
}

function JobRow({ item, active = false }: { item: TradeLabJobVisibilityItem; active?: boolean }) {
  const tone =
    item.isStale ? "bg-amber-600 hover:bg-amber-600" : item.status === "failed" ? "bg-rose-600 hover:bg-rose-600" : ""

  return (
    <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">
            {item.run.symbol} {item.run.timeframe}
          </p>
          <p className="text-xs text-slate-500">{item.run.id.slice(0, 8)}</p>
        </div>
        <Badge className={tone} variant={tone ? "default" : "outline"}>
          {item.isStale ? "Stale" : item.status}
        </Badge>
      </div>
      <div className="grid gap-1 text-xs text-slate-600">
        <span>{item.dataJob ? `${item.dataJob.jobType} - ${item.dataJob.status}` : active ? "Backtest queued" : "Backtest run"}</span>
        <span className="flex items-center gap-1">
          <Clock3 className="size-3" aria-hidden="true" />
          {item.lastActivityAt ? formatDateTime(item.lastActivityAt) : "N/A"}
        </span>
        {item.isStale && item.staleReason ? <span className="font-medium text-amber-700">{item.staleReason}</span> : null}
      </div>
    </div>
  )
}
