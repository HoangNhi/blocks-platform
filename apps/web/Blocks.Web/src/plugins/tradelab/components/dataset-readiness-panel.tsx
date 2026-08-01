import { Database, ExternalLink, Info, ShieldAlert } from "lucide-react"
import { Link } from "react-router"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

import type {
  TradeLabDatasetFillEnqueueLocalResult,
  TradeLabDatasetFillPreview,
  TradeLabDatasetLocalFillResult,
  TradeLabPreflightResult,
  TradeLabRunPipeline,
  TradeLabRuntimeConfig,
} from "../types"
import { buildDatasetReadinessGate, type DatasetReadinessGate } from "../utils/dataset-readiness-gate"
import {
  buildDatasetFreshnessSignals,
  type DatasetFreshnessSignal,
  type DatasetFreshnessSignalTone,
} from "../utils/dataset-freshness-signals"
import type { DatasetQualitySignalTone } from "../utils/dataset-quality-signals"
import { formatDateTime, formatSourceSummary } from "../utils"

type ReadinessStatus = "not_checked" | "ready" | "needs_fill" | "needs_repair" | "blocked"

type DatasetReadinessPanelProps = {
  preflight: TradeLabPreflightResult | null
  pipeline: TradeLabRunPipeline | null
  runtimeConfig: TradeLabRuntimeConfig
  runtimeErrorMessage?: string | null
  datasetCatalogHref?: string | null
  fillPreview?: TradeLabDatasetFillPreview | null
  fillPreviewError?: string | null
  isPreviewingFillPlan?: boolean
  onPreviewFillPlan?: (() => void | Promise<unknown>) | null
  localFillResult?: TradeLabDatasetLocalFillResult | null
  localFillError?: string | null
  enqueueFillResult?: TradeLabDatasetFillEnqueueLocalResult | null
  enqueueFillError?: string | null
  isFillingLocalDataset?: boolean
  isEnqueueingDatasetFill?: boolean
  isLocalFillConfirmed?: boolean
  onLocalFillConfirmChange?: ((checked: boolean) => void) | null
  onConfirmLocalFill?: (() => void | Promise<unknown>) | null
  onQueueBackgroundFill?: (() => void | Promise<unknown>) | null
}

const statusCopy: Record<ReadinessStatus, { label: string; className: string }> = {
  not_checked: { label: "Not checked", className: "bg-slate-600 hover:bg-slate-600" },
  ready: { label: "Ready", className: "bg-emerald-600 hover:bg-emerald-600" },
  needs_fill: { label: "Needs fill", className: "bg-amber-600 hover:bg-amber-600" },
  needs_repair: { label: "Needs repair", className: "bg-orange-600 hover:bg-orange-600" },
  blocked: { label: "Blocked", className: "bg-rose-600 hover:bg-rose-600" },
}

const gateClassNames: Record<DatasetReadinessGate["tone"], string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  danger: "border-rose-200 bg-rose-50 text-rose-700",
  info: "border-blue-200 bg-blue-50 text-blue-700",
}

const qualitySignalClassNames: Record<DatasetQualitySignalTone, string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  danger: "border-rose-200 bg-rose-50 text-rose-700",
  info: "border-blue-200 bg-blue-50 text-blue-700",
}

const freshnessSignalClassNames: Record<DatasetFreshnessSignalTone, string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  danger: "border-rose-200 bg-rose-50 text-rose-700",
  info: "border-blue-200 bg-blue-50 text-blue-700",
}

const freshnessStatusLabels: Record<DatasetFreshnessSignal["status"], string> = {
  pass: "Pass",
  warning: "Warning",
  fail: "Fail",
  unknown: "Unknown",
}

export function DatasetReadinessPanel({
  preflight,
  pipeline,
  runtimeConfig,
  runtimeErrorMessage = null,
  datasetCatalogHref = null,
  fillPreview = null,
  fillPreviewError = null,
  isPreviewingFillPlan = false,
  onPreviewFillPlan = null,
  localFillResult = null,
  localFillError = null,
  enqueueFillResult = null,
  enqueueFillError = null,
  isFillingLocalDataset = false,
  isEnqueueingDatasetFill = false,
  isLocalFillConfirmed = false,
  onLocalFillConfirmChange = null,
  onConfirmLocalFill = null,
  onQueueBackgroundFill = null,
}: DatasetReadinessPanelProps) {
  const coverage = preflight?.coverage ?? null
  const dataJob = pipeline?.dataJob ?? null
  const runtimeFailureMessage = runtimeErrorMessage ?? pipeline?.run.errorMessage ?? dataJob?.errorMessage ?? null
  const errorMessage = runtimeFailureMessage ?? (pipeline?.status === "failed" ? pipeline.message : null)
  const gate = buildDatasetReadinessGate({
    preflight,
    pipeline,
    runtimeErrorMessage: runtimeFailureMessage,
  })
  const freshnessSignals = buildDatasetFreshnessSignals({
    coveredEndAt: coverage?.coveredEndAt ?? null,
    latestOpenTime: coverage?.latestOpenTime ?? null,
    lastCheckedAt: null,
    gapCount: coverage?.gapCount ?? null,
    segmentCount: coverage?.segmentCount ?? null,
    requestedEndAt: preflight?.requestedEndAt ?? runtimeConfig.endAt ?? null,
  })
  const status = getReadinessStatus(preflight, errorMessage)
  const statusMeta = statusCopy[status]
  const missingSegments = preflight?.missingSegments ?? []
  const visibleMissingSegments = missingSegments.slice(0, 3)
  const hiddenMissingCount = Math.max(0, missingSegments.length - visibleMissingSegments.length)
  const activeJobLabel = preflight?.activeJobId
    ? `${preflight.activeJobType ?? "job"} - ${preflight.activeJobId.slice(0, 8)}`
    : dataJob
      ? `${dataJob.jobType} - ${dataJob.id.slice(0, 8)}`
      : "None"
  const localFillDisabledReason = getLocalFillDisabledReason(
    fillPreview,
    Boolean(isLocalFillConfirmed),
    Boolean(isFillingLocalDataset),
  )
  const enqueueFillDisabledReason = getLocalFillDisabledReason(
    fillPreview,
    Boolean(isLocalFillConfirmed),
    Boolean(isEnqueueingDatasetFill),
  )
  const showLocalFillControls = Boolean(
    fillPreview && (fillPreview.missingRanges.length > 0 || fillPreview.blockedReasons.length > 0),
  )

  return (
    <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
      <CardHeader className="space-y-3 border-b border-slate-200 bg-slate-50/80">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="size-4 text-blue-600" aria-hidden="true" />
              Dataset readiness
            </CardTitle>
            <p className="mt-1 text-xs text-slate-500">Read-only dataset coverage for the current backtest target.</p>
          </div>
          <Badge className={statusMeta.className}>{statusMeta.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 p-4">
        <div className="grid gap-2 text-sm text-slate-600">
          <Field label="Dataset key" value={preflight?.datasetKey ?? "N/A"} />
          <Field label="Symbol" value={preflight?.symbol ?? runtimeConfig.symbol ?? "N/A"} />
          <Field label="Timeframe" value={preflight?.timeframe ?? runtimeConfig.timeframe ?? "N/A"} />
          <Field
            label="Sources"
            value={preflight ? formatSourceSummary(preflight.sourceSummary) : "N/A"}
          />
          <Field
            label="Requested range"
            value={formatRange(
              preflight?.requestedStartAt ?? runtimeConfig.startAt,
              preflight?.requestedEndAt ?? runtimeConfig.endAt,
            )}
          />
        </div>

        {datasetCatalogHref ? (
          <Button asChild type="button" variant="outline" size="sm" className="w-full justify-start">
            <Link to={datasetCatalogHref} aria-label="Open in Dataset Catalog">
              <ExternalLink className="size-4" aria-hidden="true" />
              Open in Dataset Catalog
            </Link>
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full justify-start"
            disabled
            title="Dataset catalog needs symbol and timeframe."
            aria-label="Open in Dataset Catalog unavailable: symbol and timeframe required"
          >
            <ExternalLink className="size-4" aria-hidden="true" />
            Open in Dataset Catalog
          </Button>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full justify-start"
          disabled={isPreviewingFillPlan || !onPreviewFillPlan}
          onClick={() => void onPreviewFillPlan?.()}
        >
          <Database className="size-4" aria-hidden="true" />
          {isPreviewingFillPlan ? "Previewing..." : "Preview fill plan"}
        </Button>

        <ReadinessGateSummary gate={gate} />
        <FreshnessSignalsSummary signals={freshnessSignals} />

        {fillPreview ? <FillPreviewSummary preview={fillPreview} /> : null}

        {showLocalFillControls ? (
          <section className="grid gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3" aria-label="Local dataset fill controls">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">Local dataset fill</h3>
              <Badge variant="outline" className="border-amber-200 bg-white text-amber-700">
                Local/dev only
              </Badge>
            </div>
            <label className="flex items-start gap-2 text-sm leading-6 text-amber-900">
              <input
                type="checkbox"
                className="mt-1 size-4"
                checked={Boolean(isLocalFillConfirmed)}
                disabled={Boolean(isFillingLocalDataset || fillPreview?.blockedReasons.includes("active_job_exists"))}
                onChange={(event) => onLocalFillConfirmChange?.(event.target.checked)}
              />
              <span>I understand this writes missing market candles in local/dev only.</span>
            </label>
            <Button
              type="button"
              variant="default"
              size="sm"
              className="w-full justify-start"
              disabled={Boolean(localFillDisabledReason)}
              title={localFillDisabledReason ? `Reason: ${localFillDisabledReason}` : "Confirm local dataset fill"}
              onClick={() => void onConfirmLocalFill?.()}
            >
              <Database className="size-4" aria-hidden="true" />
              {isFillingLocalDataset ? "Filling local dataset" : "Confirm local fill"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-full justify-start border-amber-300 bg-white"
              disabled={Boolean(enqueueFillDisabledReason || !onQueueBackgroundFill)}
              title={enqueueFillDisabledReason ? `Reason: ${enqueueFillDisabledReason}` : "Queue background fill"}
              onClick={() => void onQueueBackgroundFill?.()}
            >
              <Database className="size-4" aria-hidden="true" />
              {isEnqueueingDatasetFill ? "Queueing background fill" : "Queue background fill"}
            </Button>
            {localFillDisabledReason ? (
              <p className="break-words text-xs font-medium text-amber-700">Reason: {localFillDisabledReason}</p>
            ) : null}
          </section>
        ) : null}

        {localFillResult ? (
          <section className="grid gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3" aria-label="Local dataset fill result">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">Local fill result</h3>
              <Badge variant="outline" className="border-emerald-200 bg-white text-emerald-700">
                {localFillResult.status}
              </Badge>
            </div>
            <div className="grid gap-2 text-sm text-slate-700">
              <Field label="Job" value={localFillResult.jobId.slice(0, 8)} />
              <Field label="Rows fetched" value={String(localFillResult.rowsFetched)} />
              <Field label="Rows inserted" value={String(localFillResult.rowsInserted)} />
              <Field label="Rows skipped" value={String(localFillResult.rowsSkippedExisting)} />
              <Field label="Safety" value={localFillResult.safetyStatus} />
            </div>
          </section>
        ) : null}

        {enqueueFillResult ? (
          <section className="grid gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3" aria-label="Background fill enqueue result">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">Background fill queued</h3>
              <Badge variant="outline" className="border-blue-200 bg-white text-blue-700">
                {enqueueFillResult.status}
              </Badge>
            </div>
            <div className="grid gap-2 text-sm text-slate-700">
              <Field label="Job" value={enqueueFillResult.jobId.slice(0, 8)} />
              <Field label="Missing ranges" value={String(enqueueFillResult.missingRangeCount)} />
              <Field label="Safety" value={enqueueFillResult.safetyStatus} />
            </div>
          </section>
        ) : null}

        {fillPreviewError ? (
          <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            <ShieldAlert className="mt-0.5 size-4" aria-hidden="true" />
            <span className="break-words">{fillPreviewError}</span>
          </div>
        ) : null}

        {localFillError ? (
          <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            <ShieldAlert className="mt-0.5 size-4" aria-hidden="true" />
            <span className="break-words">{localFillError}</span>
          </div>
        ) : null}

        {enqueueFillError ? (
          <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            <ShieldAlert className="mt-0.5 size-4" aria-hidden="true" />
            <span className="break-words">{enqueueFillError}</span>
          </div>
        ) : null}

        {!preflight ? (
          <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
            <Info className="mt-0.5 size-4 text-blue-600" aria-hidden="true" />
            <span>Run preflight to inspect dataset coverage.</span>
          </div>
        ) : null}

        <Separator />

        <div className="grid gap-2 text-sm text-slate-600">
          <Field label="Coverage health" value={coverage?.healthStatus ?? "N/A"} />
          <Field label="Covered range" value={formatRange(coverage?.coveredStartAt, coverage?.coveredEndAt)} />
          <Field label="Segments" value={coverage ? String(coverage.segmentCount) : "N/A"} />
          <Field label="Gaps" value={coverage ? String(coverage.gapCount) : "N/A"} />
          <Field label="Missing windows" value={String(missingSegments.length)} />
          <Field label="Active job" value={activeJobLabel} />
        </div>

        {visibleMissingSegments.length > 0 ? (
          <div className="grid gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {visibleMissingSegments.map((segment, index) => (
              <div key={`${segment.kind}-${segment.startAt}-${index}`} className="grid gap-1">
                <strong className="font-medium">{segment.kind}: missing window</strong>
                <span>
                  {formatDateTime(segment.startAt)} - {formatDateTime(segment.endAt)}
                </span>
              </div>
            ))}
            {hiddenMissingCount > 0 ? <span className="text-xs font-medium">+{hiddenMissingCount} more</span> : null}
          </div>
        ) : null}

        {errorMessage ? (
          <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            <ShieldAlert className="mt-0.5 size-4" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function ReadinessGateSummary({ gate }: { gate: DatasetReadinessGate }) {
  return (
    <section className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3" aria-label="Readiness gate">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Readiness gate</h3>
        <Badge variant="outline" className={gateClassNames[gate.tone]}>
          {gate.label}
        </Badge>
      </div>
      <p className="text-sm leading-6 text-slate-600">{gate.description}</p>
      <p className="break-words text-xs font-medium text-slate-500">Reason: {gate.reason}</p>

      {gate.signals.length > 0 ? (
        <div className="grid gap-2" aria-label="Quality signals">
          <h4 className="text-xs font-semibold uppercase text-slate-500">Quality signals</h4>
          {gate.signals.map((signal) => (
            <div key={signal.id} className="rounded-md border border-slate-200 bg-white p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-slate-900">{signal.label}</span>
                <Badge variant="outline" className={qualitySignalClassNames[signal.tone]}>
                  {signal.status}
                </Badge>
              </div>
              <p className="mt-2 leading-6 text-slate-600">{signal.description}</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function FreshnessSignalsSummary({ signals }: { signals: DatasetFreshnessSignal[] }) {
  return (
    <section className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3" aria-label="Freshness and gaps">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Freshness & gaps</h3>
        <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
          Read-only
        </Badge>
      </div>
      <div className="grid gap-2">
        {signals.map((signal) => (
          <div key={signal.id} className="rounded-md border border-slate-200 bg-white p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-slate-900">{signal.label}</span>
              <Badge variant="outline" className={freshnessSignalClassNames[signal.tone]}>
                {freshnessStatusLabels[signal.status]}
              </Badge>
            </div>
            <p className="mt-2 leading-6 text-slate-600">{signal.description}</p>
            <p className="mt-1 break-words text-xs font-medium text-slate-500">Reason: {signal.reason}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function FillPreviewSummary({ preview }: { preview: TradeLabDatasetFillPreview }) {
  return (
    <section className="grid gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3" aria-label="Dataset fill preview">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Dataset fill preview</h3>
        <Badge variant="outline" className="border-blue-200 bg-white text-blue-700">
          Preview only
        </Badge>
      </div>
      <div className="grid gap-2 text-sm text-slate-700">
        <Field label="Dataset key" value={preview.datasetKey} />
        <Field label="Requested range" value={formatRange(preview.requestedRange.startAt, preview.requestedRange.endAt)} />
        <Field label="Coverage status" value={preview.coverageStatus} />
        <Field label="Estimated rows" value={String(preview.estimatedRows)} />
        <Field label="Gap count" value={String(preview.gapCount)} />
        <Field label="Safety" value={preview.safetyStatus} />
      </div>
      {preview.blockedReasons.length > 0 ? (
        <div className="grid gap-1 text-xs font-medium text-amber-700">
          {preview.blockedReasons.map((reason) => (
            <span key={reason} className="break-words">
              {reason}
            </span>
          ))}
        </div>
      ) : null}
    </section>
  )
}

function getReadinessStatus(preflight: TradeLabPreflightResult | null, errorMessage: string | null): ReadinessStatus {
  if (errorMessage) return "blocked"
  if (!preflight) return "not_checked"
  if (preflight.outcome === "blocked" || preflight.coverage?.healthStatus === "blocked") return "blocked"
  if (preflight.outcome === "needs_repair" || preflight.coverage?.healthStatus === "suspect") return "needs_repair"
  if (preflight.outcome === "needs_fill" || preflight.missingSegments.length > 0) return "needs_fill"
  return "ready"
}

function getLocalFillDisabledReason(
  preview: TradeLabDatasetFillPreview | null,
  isConfirmed: boolean,
  isSubmitting: boolean,
) {
  if (!preview) return "dataset_fill_preview_required"
  if (isSubmitting) return "dataset_fill_submit_in_progress"
  if (preview.blockedReasons.includes("active_job_exists")) return "active_job_exists"
  if (preview.blockedReasons.length > 0) return preview.blockedReasons[0]
  if (preview.missingRanges.length === 0 || preview.gapCount === 0) return "dataset_fill_no_missing_ranges"
  if (!isConfirmed) return "local_fill_confirmation_required"
  return null
}

function formatRange(startAt?: string | null, endAt?: string | null) {
  if (!startAt || !endAt) return "N/A"
  return `${formatDateTime(startAt)} - ${formatDateTime(endAt)}`
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span className="min-w-0 text-right font-medium text-slate-900">{value}</span>
    </div>
  )
}
