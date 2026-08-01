import { AlertTriangle, Clock3, RefreshCw, TimerReset } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

import type { TradeLabPaperSchedulerStatus } from "../types"
import { formatDateTime } from "../utils"

type PaperSchedulerStatusPanelProps = {
  status: TradeLabPaperSchedulerStatus | null
  isLoading?: boolean
  errorMessage?: string | null
  onRefresh?: () => void
}

export function PaperSchedulerStatusPanel({
  status,
  isLoading = false,
  errorMessage = null,
  onRefresh,
}: PaperSchedulerStatusPanelProps) {
  const tone = status ? statusTone(status.lastTickStatus) : ""

  return (
    <section className="grid gap-3" aria-label="Paper scheduler status">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
            <TimerReset className="size-4 shrink-0 text-blue-600" aria-hidden="true" />
            Paper scheduler
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500">Read-only local/dev paper scheduler state.</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Badge variant="outline">Read-only</Badge>
          {status ? (
            <Badge className={tone} variant={tone ? "default" : "outline"}>
              {status.lastTickStatus}
            </Badge>
          ) : null}
          {onRefresh ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isLoading}
              aria-label="Refresh paper scheduler status"
            >
              <RefreshCw className={isLoading ? "mr-2 size-4 animate-spin" : "mr-2 size-4"} aria-hidden="true" />
              Refresh
            </Button>
          ) : null}
        </div>
      </div>

      {errorMessage ? (
        <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 break-words">{errorMessage}</span>
        </div>
      ) : null}

      {isLoading && !status ? (
        <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2" aria-label="Loading paper scheduler status">
          <span className="text-sm text-slate-600">Loading paper scheduler status...</span>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : null}

      {!isLoading && !errorMessage && !status ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          No paper scheduler status available.
        </div>
      ) : null}

      {status ? (
        <dl className="grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
          <Field label="Safety status" value={status.safetyStatus} />
          <Field label="Enabled" value={status.enabled ? "true" : "false"} />
          <Field label="Running" value={status.running ? "true" : "false"} />
          <Field label="Worker ID" value={status.workerId} />
          <Field label="Interval seconds" value={String(status.intervalSeconds)} />
          <Field label="Started" value={status.lastTickStartedAt ? formatDateTime(status.lastTickStartedAt) : "N/A"} icon />
          <Field label="Completed" value={status.lastTickCompletedAt ? formatDateTime(status.lastTickCompletedAt) : "N/A"} icon />
          <Field label="Skip reason" value={status.lastSkipReason ?? "N/A"} />
          <Field label="Reason code" value={status.lastReasonCode ?? "N/A"} />
          <Field label="Session ID" value={status.lastSessionId ?? "N/A"} />
          <Field label="Candles" value={String(status.candlesProcessed)} />
          <Field label="Orders / fills" value={`${status.ordersCreated} / ${status.fillsCreated}`} />
          <Field label="Snapshots" value={String(status.snapshotsCreated)} />
          <Field label="Consecutive failures" value={String(status.consecutiveFailureCount)} />
        </dl>
      ) : null}
    </section>
  )
}

function Field({ label, value, icon = false }: { label: string; value: string; icon?: boolean }) {
  return (
    <div className="grid min-w-0 gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
      <dt className="font-medium text-slate-700">{label}</dt>
      <dd className="flex min-w-0 items-center gap-1 break-all text-slate-500">
        {icon ? <Clock3 className="size-3 shrink-0" aria-hidden="true" /> : null}
        <span className="min-w-0 break-all">{value}</span>
      </dd>
    </div>
  )
}

function statusTone(status: string) {
  if (status === "failed") return "bg-rose-600 hover:bg-rose-600"
  if (status === "processed") return "bg-emerald-600 hover:bg-emerald-600"
  if (status === "skipped") return "bg-amber-600 hover:bg-amber-600"
  if (status === "idle") return "bg-blue-600 hover:bg-blue-600"
  return ""
}
