import { RefreshCw, Workflow } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

import type { TradeLabPreflightResult, TradeLabRunPipeline } from "../types"
import { formatDateTime } from "../utils"

type RunPipelinePanelProps = {
  pipeline: TradeLabRunPipeline | null
  preflight: TradeLabPreflightResult | null
  runtimeErrorMessage?: string | null
  isPolling?: boolean
  onRefresh?: () => void
}

export function RunPipelinePanel({
  pipeline,
  preflight,
  runtimeErrorMessage = null,
  isPolling = false,
  onRefresh,
}: RunPipelinePanelProps) {
  const run = pipeline?.run
  const dataJob = pipeline?.dataJob
  const errorMessage =
    runtimeErrorMessage ??
    pipeline?.run.errorMessage ??
    dataJob?.errorMessage ??
    (pipeline?.status === "failed" ? pipeline.message : null)

  return (
    <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
      <CardHeader className="space-y-3 border-b border-slate-200 bg-slate-50/80">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Workflow className="size-4 text-blue-600" aria-hidden="true" />
              Run pipeline
            </CardTitle>
            <p className="mt-1 text-xs text-slate-500">Persistent status for preflight, data job, and backtest job.</p>
          </div>
          {onRefresh ? (
            <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={isPolling}>
              <RefreshCw className={isPolling ? "mr-2 size-4 animate-spin" : "mr-2 size-4"} aria-hidden="true" />
              Refresh
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 p-4">
        <Row
          label="Preflight"
          value={preflight?.outcome ?? "Not run"}
          tone={preflight?.outcome === "blocked" ? "danger" : preflight?.action === "repair" ? "warning" : "info"}
        />
        <Row
          label="Data job"
          value={dataJob ? `${dataJob.jobType} - ${dataJob.status}` : "No data job"}
          tone={dataJob ? "warning" : "neutral"}
        />
        <Row
          label="Backtest"
          value={run ? `${run.status}` : "No run"}
          tone={run?.status === "completed" ? "success" : run?.status === "failed" ? "danger" : "info"}
        />
        <Separator />
        <div className="grid gap-2 text-sm text-slate-600">
          <div className="flex items-center justify-between gap-3">
            <span>Pipeline status</span>
            <Badge variant="outline">{pipeline?.status ?? "idle"}</Badge>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>Run started</span>
            <span className="text-slate-900">{run?.startedAt ? formatDateTime(run.startedAt) : "N/A"}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span>Run finished</span>
            <span className="text-slate-900">{run?.finishedAt ? formatDateTime(run.finishedAt) : "N/A"}</span>
          </div>
        </div>
        {dataJob ? (
          <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            <div className="flex items-center justify-between gap-3">
              <span>Requested range</span>
              <span className="text-right text-slate-900">
                {formatDateTime(dataJob.requestedStartAt)} - {formatDateTime(dataJob.requestedEndAt)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Applied range</span>
              <span className="text-right text-slate-900">
                {dataJob.appliedStartAt && dataJob.appliedEndAt
                  ? `${formatDateTime(dataJob.appliedStartAt)} - ${formatDateTime(dataJob.appliedEndAt)}`
                  : "N/A"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Rows imported</span>
              <span className="text-slate-900">{dataJob.rowsImported} rows imported</span>
            </div>
            {dataJob.errorMessage ? (
              <p className="rounded-md bg-rose-50 p-2 text-rose-700">{dataJob.errorMessage}</p>
            ) : null}
          </div>
        ) : null}
        {errorMessage ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {errorMessage}
          </div>
        ) : null}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
          {pipeline?.message ?? "Preflight is the blocking step. The pipeline panel stays visible while jobs are active."}
        </div>
      </CardContent>
    </Card>
  )
}

function Row({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: "neutral" | "info" | "warning" | "success" | "danger"
}) {
  const badgeClassName =
    tone === "success"
      ? "bg-emerald-600 hover:bg-emerald-600"
      : tone === "warning"
        ? "bg-amber-600 hover:bg-amber-600"
        : tone === "danger"
          ? "bg-rose-600 hover:bg-rose-600"
          : tone === "info"
            ? "bg-blue-600 hover:bg-blue-600"
            : ""

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <span className="text-sm text-slate-600">{label}</span>
      <Badge className={badgeClassName}>{value}</Badge>
    </div>
  )
}
