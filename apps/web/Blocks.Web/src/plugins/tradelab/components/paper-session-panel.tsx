import type { ReactNode } from "react"

import {
  AlertTriangle,
  Ban,
  ChevronDown,
  CircleCheck,
  CircleDashed,
  Clock3,
  LoaderCircle,
  PlayCircle,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"

import type {
  TradeLabPaperKillSwitchStatus,
  TradeLabPaperSchedulerStatus,
  TradeLabPaperSessionDetail,
  TradeLabPaperSessionCancelLocalResult,
  TradeLabPaperSessionObservability,
  TradeLabPaperSessionPreview,
  TradeLabPaperSessionResumeLocalResult,
  TradeLabPaperSessionResumeReadiness,
  TradeLabPaperSessionRetryLocalResult,
  TradeLabPaperSessionRunLocalResult,
  TradeLabPaperSessionSetupReason,
  TradeLabPaperSessionStartResult,
} from "../types"
import { PaperSchedulerStatusPanel } from "./paper-scheduler-status-panel"

type PaperSessionPanelProps = {
  preview?: TradeLabPaperSessionPreview | null
  setupReason?: TradeLabPaperSessionSetupReason | null
  isLoading?: boolean
  errorMessage?: string | null
  paperSessionDetailInput?: string
  paperSessionDetail?: TradeLabPaperSessionDetail | null
  paperSessionDetailError?: string | null
  isPaperSessionDetailLoading?: boolean
  paperSessionObservability?: TradeLabPaperSessionObservability | null
  paperSessionObservabilityError?: string | null
  isPaperSessionObservabilityLoading?: boolean
  paperKillSwitchStatus?: TradeLabPaperKillSwitchStatus | null
  paperKillSwitchStatusError?: string | null
  isPaperKillSwitchStatusLoading?: boolean
  paperSchedulerStatus?: TradeLabPaperSchedulerStatus | null
  paperSchedulerStatusError?: string | null
  isPaperSchedulerStatusLoading?: boolean
  startResult?: TradeLabPaperSessionStartResult | null
  startError?: string | null
  isStarting?: boolean
  canStart?: boolean
  startDisabledReason?: string | null
  runLocalResult?: TradeLabPaperSessionRunLocalResult | null
  runLocalError?: string | null
  isRunningLocal?: boolean
  canRunLocal?: boolean
  runLocalDisabledReason?: string | null
  cancelLocalResult?: TradeLabPaperSessionCancelLocalResult | null
  cancelLocalError?: string | null
  isCancellingLocal?: boolean
  canCancelLocal?: boolean
  cancelLocalDisabledReason?: string | null
  retryLocalResult?: TradeLabPaperSessionRetryLocalResult | null
  retryLocalError?: string | null
  isRetryingLocal?: boolean
  canRetryLocal?: boolean
  retryLocalDisabledReason?: string | null
  paperSessionResumeReadiness?: TradeLabPaperSessionResumeReadiness | null
  paperSessionResumeReadinessError?: string | null
  isPaperSessionResumeReadinessLoading?: boolean
  resumeLocalResult?: TradeLabPaperSessionResumeLocalResult | null
  resumeLocalError?: string | null
  isResumingLocal?: boolean
  canResumeLocal?: boolean
  resumeLocalDisabledReason?: string | null
  onRefresh?: () => void
  onPaperSessionDetailInputChange?: (value: string) => void
  onLoadPaperSessionDetail?: () => void
  onRefreshPaperSessions?: () => void
  onRefreshPaperSchedulerStatus?: () => void
  onLoadPaperSessionDetailFromSummary?: (sessionId: string) => void
  onStartPaperSession?: () => void
  onRunLocalPaperSession?: () => void
  onCancelLocalPaperSession?: () => void
  onResumeLocalPaperSession?: () => void
  onRetryLocalPaperSession?: () => void
}

function getStatusLabel({
  preview,
  setupReason,
  isLoading,
  errorMessage,
}: {
  preview: TradeLabPaperSessionPreview | null
  setupReason: TradeLabPaperSessionSetupReason | null
  isLoading: boolean
  errorMessage: string | null
}) {
  if (isLoading) return "Checking"
  if (errorMessage) return "Error"
  if (setupReason) return "Setup required"
  if (!preview) return "Setup required"
  return preview.allowed || preview.previewStatus === "allowed" ? "Ready" : "Blocked"
}

function getStatusClass(label: string) {
  if (label === "Ready") return "bg-emerald-600 hover:bg-emerald-600"
  if (label === "Blocked") return "bg-amber-600 hover:bg-amber-600"
  if (label === "Error") return "bg-rose-600 hover:bg-rose-600"
  return ""
}

function StatusIcon({ label }: { label: string }) {
  if (label === "Ready") {
    return <CircleCheck className="size-4 text-emerald-600" aria-hidden="true" />
  }
  if (label === "Checking") {
    return <LoaderCircle className="size-4 animate-spin text-blue-600" aria-hidden="true" />
  }
  if (label === "Error" || label === "Blocked") {
    return <AlertTriangle className="size-4 text-amber-600" aria-hidden="true" />
  }
  return <CircleDashed className="size-4 text-slate-500" aria-hidden="true" />
}

function formatNumber(value: number) {
  return Number.isFinite(value) ? value.toLocaleString("en-US", { maximumFractionDigits: 8 }) : "0"
}

function latestPortfolioSnapshot(detail: TradeLabPaperSessionDetail) {
  return detail.artifacts.portfolioSnapshots.at(-1) ?? null
}

function latestAuditEvents(detail: TradeLabPaperSessionDetail) {
  return [...detail.auditEvents].reverse().slice(0, 5)
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-0.5 text-xs">
      <dt className="text-slate-500">{label}</dt>
      <dd className="break-all font-medium text-slate-800">{value}</dd>
    </div>
  )
}

function PaperSessionDetailSummary({ detail }: { detail: TradeLabPaperSessionDetail }) {
  const snapshot = latestPortfolioSnapshot(detail)
  const auditEvents = latestAuditEvents(detail)
  const counts = detail.artifacts

  return (
    <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="break-all text-sm font-medium text-slate-900">{detail.session.sessionId}</p>
          <p className="break-all text-xs text-slate-500">{detail.session.datasetKey || "N/A"}</p>
        </div>
        <Badge variant="outline">{detail.session.status}</Badge>
      </div>

      <dl className="grid gap-2 sm:grid-cols-2">
        <DetailField label="Reason" value={detail.session.reasonCode ?? "none"} />
        <DetailField label="Safety" value={detail.safetyStatus} />
        <DetailField label="Symbol/timeframe" value={`${detail.session.symbol || "N/A"} / ${detail.session.timeframe || "N/A"}`} />
        <DetailField label="Range" value={`${detail.session.startAt || "N/A"} - ${detail.session.endAt || "N/A"}`} />
      </dl>

      <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div className="rounded-md border border-slate-200 bg-white px-2 py-1">
          <p className="text-slate-500">Orders</p>
          <p className="font-semibold text-slate-900">{counts.orders.length}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white px-2 py-1">
          <p className="text-slate-500">Fills</p>
          <p className="font-semibold text-slate-900">{counts.fills.length}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white px-2 py-1">
          <p className="text-slate-500">Positions</p>
          <p className="font-semibold text-slate-900">{counts.positions.length}</p>
        </div>
        <div className="rounded-md border border-slate-200 bg-white px-2 py-1">
          <p className="text-slate-500">Snapshots</p>
          <p className="font-semibold text-slate-900">{counts.portfolioSnapshots.length}</p>
        </div>
      </div>

      <div className="grid gap-2">
        <p className="text-xs font-medium text-slate-900">Latest portfolio snapshot</p>
        {snapshot ? (
          <dl className="grid gap-2 rounded-md border border-slate-200 bg-white px-2 py-2 sm:grid-cols-2">
            <DetailField label="Equity" value={formatNumber(snapshot.equity)} />
            <DetailField label="Cash" value={formatNumber(snapshot.cashBalance)} />
            <DetailField label="Realized PnL" value={formatNumber(snapshot.realizedPnl)} />
            <DetailField label="Unrealized PnL" value={formatNumber(snapshot.unrealizedPnl)} />
            <DetailField label="Drawdown %" value={formatNumber(snapshot.drawdownPct)} />
            <DetailField label="Exposure" value={formatNumber(snapshot.exposureNotional)} />
          </dl>
        ) : (
          <div className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-500">
            No portfolio snapshot is available for this paper session.
          </div>
        )}
      </div>

      <div className="grid gap-2">
        <p className="text-xs font-medium text-slate-900">Audit evidence</p>
        {auditEvents.length > 0 ? (
          <div className="grid gap-2">
            {auditEvents.map((event) => (
              <Collapsible key={event.auditEventId || `${event.action}-${event.eventAt}`}>
                <div className="rounded-md border border-slate-200 bg-white px-2 py-2 text-xs">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="break-all font-medium text-slate-800">{event.action}</p>
                      <p className="break-all text-slate-500">{event.reasonCode ?? "N/A"}</p>
                    </div>
                    <CollapsibleTrigger asChild>
                      <Button type="button" variant="ghost" size="sm" aria-label={`Toggle audit event ${event.auditEventId}`}>
                        <ChevronDown className="size-4" aria-hidden="true" />
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                  <CollapsibleContent>
                    <Separator className="my-2" />
                    <dl className="grid gap-2">
                      <DetailField label="Event time" value={event.eventAt || "N/A"} />
                      <DetailField label="Actor" value={event.actor ?? "N/A"} />
                      <DetailField label="State" value={`${event.oldState ?? "N/A"} -> ${event.newState ?? "N/A"}`} />
                      <DetailField label="Metadata" value={JSON.stringify(event.metadata)} />
                    </dl>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            ))}
          </div>
        ) : (
          <div className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-500">
            No audit evidence is available for this paper session.
          </div>
        )}
      </div>
    </div>
  )
}

type PaperSessionSummaryItem = TradeLabPaperSessionObservability["items"][number]

function paperStatusBadgeClass(status: string) {
  if (status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (status === "queued" || status === "running") return "border-blue-200 bg-blue-50 text-blue-700"
  if (status === "blocked") return "border-amber-200 bg-amber-50 text-amber-800"
  if (status === "failed" || status === "cancelled") return "border-rose-200 bg-rose-50 text-rose-700"
  return "border-slate-200 bg-white text-slate-700"
}

function primarySummaryReason(item: PaperSessionSummaryItem) {
  return item.reasonCode || item.latestAudit?.reasonCode || item.gateSummary.blockedReasonCode || "none"
}

function hasGateSummaryEvidence(item: PaperSessionSummaryItem) {
  return item.gateSummary.failedGateCount > 0 || item.gateSummary.failedGateReasons.length > 0
}

function EvidenceRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-0.5">
      <span className="text-[11px] font-medium uppercase text-slate-500">{label}</span>
      <div className="min-w-0 break-all text-xs text-slate-700">{children}</div>
    </div>
  )
}

function RecentGateSummary({ item }: { item: PaperSessionSummaryItem }) {
  if (!hasGateSummaryEvidence(item)) {
    return null
  }

  return (
    <EvidenceRow label="failed gates">
      <div className="grid gap-1">
        <span>{item.gateSummary.failedGateCount}</span>
        {item.gateSummary.failedGateReasons.map((reason) => (
          <code key={reason} className="break-all rounded bg-amber-50 px-1 py-0.5 text-[11px] text-amber-800">
            {reason}
          </code>
        ))}
      </div>
    </EvidenceRow>
  )
}

function gateEvidenceFromContext(gateContext: TradeLabPaperSessionDetail["gateContext"]) {
  const context = gateContext as Record<string, unknown>
  const failedGates = Array.isArray(context.failedGates)
    ? context.failedGates
    : Array.isArray(context.failed_gates)
      ? context.failed_gates
      : []

  return failedGates
    .map((gate) => {
      if (!gate || typeof gate !== "object") return null
      const record = gate as Record<string, unknown>
      return {
        gate: typeof record.gate === "string" ? record.gate : "gate",
        reasonCode:
          typeof record.reasonCode === "string"
            ? record.reasonCode
            : typeof record.reason_code === "string"
              ? record.reason_code
              : "unknown",
        message: typeof record.message === "string" ? record.message : "",
      }
    })
    .filter((gate): gate is { gate: string; reasonCode: string; message: string } => gate !== null)
}

function RunLocalCannotRunEvidence({
  detail,
  disabledReason,
}: {
  detail: TradeLabPaperSessionDetail | null
  disabledReason: string | null
}) {
  if (!detail || !disabledReason || detail.session.status === "queued" || detail.session.status === "completed") {
    return null
  }

  const gates = gateEvidenceFromContext(detail.gateContext)
  const auditEvents = latestAuditEvents(detail).filter(
    (event) => event.newState === detail.session.status || event.reasonCode === detail.session.reasonCode,
  )

  return (
    <div className="grid gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <div className="flex flex-wrap items-center gap-2">
        <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
        <span className="font-medium">Cannot run local</span>
        <Badge variant="outline" className="border-amber-300 bg-white text-amber-900">
          {detail.session.status || "unknown"}
        </Badge>
      </div>
      <EvidenceRow label="reason">
        <code>{detail.session.reasonCode || "none"}</code>
      </EvidenceRow>
      {detail.session.errorMessage ? (
        <EvidenceRow label="error">
          <span className="text-rose-700">{detail.session.errorMessage}</span>
        </EvidenceRow>
      ) : null}
      {gates.length > 0 ? (
        <div className="grid gap-1">
          <span className="text-[11px] font-medium uppercase text-amber-800">gate evidence</span>
          {gates.map((gate) => (
            <div key={`${gate.gate}-${gate.reasonCode}`} className="grid gap-0.5 rounded-md border border-amber-200 bg-white px-2 py-1">
              <span className="break-all font-medium">{gate.gate}</span>
              <code className="break-all text-[11px]">{gate.reasonCode}</code>
              {gate.message ? <span className="break-words">{gate.message}</span> : null}
            </div>
          ))}
        </div>
      ) : null}
      {auditEvents.length > 0 ? (
        <EvidenceRow label="latest audit">
          <div className="grid gap-1">
            {auditEvents.map((event) => (
              <span key={event.auditEventId || `${event.action}-${event.eventAt}`} className="break-all">
                {event.action} / {event.reasonCode || "none"}
              </span>
            ))}
          </div>
        </EvidenceRow>
      ) : null}
    </div>
  )
}

function formatArtifactCounts(item: PaperSessionSummaryItem) {
  return `orders ${item.artifactCounts.orders} / fills ${item.artifactCounts.fills} / snapshots ${item.artifactCounts.portfolioSnapshots}`
}

function RecentPaperSessions({
  observability,
  errorMessage,
  isLoading,
  onRefresh,
  onLoadDetail,
}: {
  observability: TradeLabPaperSessionObservability | null
  errorMessage: string | null
  isLoading: boolean
  onRefresh?: () => void
  onLoadDetail?: (sessionId: string) => void
}) {
  const items = observability?.items ?? []
  return (
    <section className="grid gap-2" aria-label="Recent paper sessions">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
          <Clock3 className="size-4 text-blue-600" aria-hidden="true" />
          Recent paper sessions
        </div>
        {onRefresh ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={isLoading}
            aria-label="Refresh recent paper sessions"
          >
            <RefreshCw className={isLoading ? "size-4 animate-spin" : "size-4"} aria-hidden="true" />
            Refresh
          </Button>
        ) : null}
      </div>
      {errorMessage ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {errorMessage}
        </div>
      ) : null}
      {items.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          No paper sessions for current strategy and dataset.
        </div>
      ) : (
        <div className="grid gap-2">
          {items.map((item) => (
            <div key={item.sessionId} className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-all text-sm font-medium text-slate-900">{item.sessionId}</p>
                  <p className="break-all text-xs text-slate-500">{item.datasetKey}</p>
                </div>
                <Badge variant="outline" className={paperStatusBadgeClass(item.status)}>
                  {item.status}
                </Badge>
              </div>
              <div className="grid gap-2 text-xs text-slate-600">
                <EvidenceRow label="primary reason">
                  <code className="break-all text-slate-700">{primarySummaryReason(item)}</code>
                </EvidenceRow>
                <EvidenceRow label="artifacts">
                  <span>{formatArtifactCounts(item)}</span>
                </EvidenceRow>
                <div className="grid min-w-0 gap-0.5">
                  <span className="sr-only">latest audit</span>
                  <span className="min-w-0 break-all text-xs text-slate-700">
                    latest audit: {item.latestAudit?.action || "none"} / {item.latestAudit?.reasonCode || "none"}
                  </span>
                </div>
                <RecentGateSummary item={item} />
                {item.errorMessage ? (
                  <EvidenceRow label="error">
                    <span className="text-rose-700">{item.errorMessage}</span>
                  </EvidenceRow>
                ) : null}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="justify-start"
                onClick={() => onLoadDetail?.(item.sessionId)}
                aria-label={`Load detail for paper session ${item.sessionId}`}
              >
                <Search className="size-4" aria-hidden="true" />
                Load detail
              </Button>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export function PaperSessionPanel({
  preview = null,
  setupReason = null,
  isLoading = false,
  errorMessage = null,
  paperSessionDetailInput = "",
  paperSessionDetail = null,
  paperSessionDetailError = null,
  isPaperSessionDetailLoading = false,
  paperSessionObservability = null,
  paperSessionObservabilityError = null,
  isPaperSessionObservabilityLoading = false,
  paperKillSwitchStatus = null,
  paperKillSwitchStatusError = null,
  isPaperKillSwitchStatusLoading = false,
  paperSchedulerStatus = null,
  paperSchedulerStatusError = null,
  isPaperSchedulerStatusLoading = false,
  startResult = null,
  startError = null,
  isStarting = false,
  canStart = false,
  startDisabledReason = null,
  runLocalResult = null,
  runLocalError = null,
  isRunningLocal = false,
  canRunLocal = false,
  runLocalDisabledReason = null,
  cancelLocalResult = null,
  cancelLocalError = null,
  isCancellingLocal = false,
  canCancelLocal = false,
  cancelLocalDisabledReason = null,
  retryLocalResult = null,
  retryLocalError = null,
  isRetryingLocal = false,
  canRetryLocal = false,
  retryLocalDisabledReason = null,
  paperSessionResumeReadiness = null,
  paperSessionResumeReadinessError = null,
  isPaperSessionResumeReadinessLoading = false,
  resumeLocalResult = null,
  resumeLocalError = null,
  isResumingLocal = false,
  canResumeLocal = false,
  resumeLocalDisabledReason = null,
  onRefresh,
  onPaperSessionDetailInputChange,
  onLoadPaperSessionDetail,
  onRefreshPaperSessions,
  onRefreshPaperSchedulerStatus,
  onLoadPaperSessionDetailFromSummary,
  onStartPaperSession,
  onRunLocalPaperSession,
  onCancelLocalPaperSession,
  onResumeLocalPaperSession,
  onRetryLocalPaperSession,
}: PaperSessionPanelProps) {
  const statusLabel = getStatusLabel({ preview, setupReason, isLoading, errorMessage })
  const statusClass = getStatusClass(statusLabel)
  const canRefresh = Boolean(onRefresh && !setupReason && !isLoading)

  return (
    <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
      <CardHeader className="space-y-3 border-b border-slate-200 bg-slate-50/80">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="size-4 shrink-0 text-blue-600" aria-hidden="true" />
              Paper session
            </CardTitle>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Local/dev simulated paper run control. No external trading system is contacted.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge className={statusClass} variant={statusClass ? "default" : "outline"}>
              {statusLabel}
            </Badge>
            {onRefresh ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onRefresh}
                disabled={!canRefresh}
                aria-label="Refresh paper session readiness"
              >
                <RefreshCw className={isLoading ? "mr-2 size-4 animate-spin" : "mr-2 size-4"} aria-hidden="true" />
                Refresh
              </Button>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 p-4">
        <section className="grid gap-2" aria-label="Paper kill switch status">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
            <ShieldAlert className="size-4 text-amber-600" aria-hidden="true" />
            Paper kill switch
          </div>
          <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-slate-900">
                {isPaperKillSwitchStatusLoading
                  ? "checking"
                  : paperKillSwitchStatus?.enabled
                    ? "enabled"
                    : "disabled"}
              </span>
              <Badge variant="outline">{paperKillSwitchStatus?.safetyStatus ?? "read_only_paper_kill_switch_status"}</Badge>
            </div>
            <code className="break-all text-xs text-slate-700">
              {paperKillSwitchStatus?.reasonCode ?? "paper_kill_switch_status_read"}
            </code>
            <p className="text-xs leading-5 text-slate-600">
              Read-only local/dev simulated paper safety status. No exchange, testnet, or live route is contacted.
            </p>
            {paperKillSwitchStatusError ? (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700">
                {paperKillSwitchStatusError}
              </div>
            ) : null}
          </div>
        </section>

        <Separator />

        <PaperSchedulerStatusPanel
          status={paperSchedulerStatus}
          errorMessage={paperSchedulerStatusError}
          isLoading={isPaperSchedulerStatusLoading}
          onRefresh={onRefreshPaperSchedulerStatus}
        />

        <Separator />

        <section className="grid gap-2" aria-label="Paper readiness">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
            <StatusIcon label={statusLabel} />
            Readiness
          </div>

          {isLoading ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Checking paper session readiness...
            </div>
          ) : null}

          {setupReason && !isLoading ? (
            <div className="grid gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              <span>{setupReason.message}</span>
              <code className="break-all text-xs text-slate-500">{setupReason.code}</code>
            </div>
          ) : null}

          {errorMessage && !isLoading ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {errorMessage}
            </div>
          ) : null}

          {preview && !isLoading ? (
            <div className="grid gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-slate-900">{preview.previewStatus}</span>
                <Badge variant="outline">{preview.safetyStatus}</Badge>
              </div>
              <div className="grid gap-1 text-xs text-slate-600">
                <span className="grid gap-0.5">
                  <span>reason</span>
                  <code className="break-all text-slate-700">{preview.reasonCode || "none"}</code>
                </span>
                <span className="grid gap-0.5">
                  <span>dataset key</span>
                  <code className="break-all text-slate-700">{preview.datasetContext.datasetKey || "N/A"}</code>
                </span>
                <span>
                  range: {preview.datasetContext.startAt || "N/A"} - {preview.datasetContext.endAt || "N/A"}
                </span>
                <span>preflight: {preview.datasetContext.preflightOutcome || "N/A"}</span>
              </div>
              {preview.failedGates.length > 0 ? (
                <div className="grid gap-1">
                  {preview.failedGates.map((gate) => (
                    <div
                      key={`${gate.gate}-${gate.reasonCode}`}
                      className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800"
                    >
                      <span className="font-semibold">{gate.gate}</span>
                      <span className="mx-1">-</span>
                      <span>{gate.message}</span>
                      <code className="mt-1 block break-all text-[11px]">{gate.reasonCode}</code>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

        <Separator />

        <section className="grid gap-2" aria-label="Paper session runtime detail lookup">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
            <Search className="size-4 text-blue-600" aria-hidden="true" />
            Runtime detail lookup
          </div>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <label className="grid min-w-0 gap-1 text-xs text-slate-600">
              Paper session ID
              <Input
                value={paperSessionDetailInput}
                onChange={(event) => onPaperSessionDetailInputChange?.(event.target.value)}
                placeholder="paper-session-id"
                className="font-mono text-xs"
              />
            </label>
            <Button
              type="button"
              variant="outline"
              className="self-end"
              onClick={onLoadPaperSessionDetail}
              disabled={isPaperSessionDetailLoading}
              aria-label="Load paper session detail"
            >
              {isPaperSessionDetailLoading ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Search className="size-4" aria-hidden="true" />
              )}
              Load detail
            </Button>
          </div>
          {paperSessionDetailError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {paperSessionDetailError}
            </div>
          ) : null}
          {!paperSessionDetail && !paperSessionDetailError ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Paste a paper session ID to inspect runtime artifacts.
            </div>
          ) : null}
          {paperSessionDetail ? <PaperSessionDetailSummary detail={paperSessionDetail} /> : null}
        </section>

        <Separator />

        <RecentPaperSessions
          observability={paperSessionObservability}
          errorMessage={paperSessionObservabilityError}
          isLoading={isPaperSessionObservabilityLoading}
          onRefresh={onRefreshPaperSessions}
          onLoadDetail={onLoadPaperSessionDetailFromSummary}
        />

        <Separator />

        <section className="grid gap-2" aria-label="Paper session start">
          <Button
            type="button"
            className="justify-start"
            disabled={!canStart || isStarting}
            title={startDisabledReason ?? "Queue paper session"}
            onClick={onStartPaperSession}
          >
            {isStarting ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <ShieldAlert className="size-4" aria-hidden="true" />
            )}
            Start paper session
          </Button>
          <p className="text-xs leading-5 text-slate-600">
            Start only queues a paper session. Paper engine execution remains locked.
          </p>
          {startDisabledReason && !canStart ? (
            <code className="break-all text-xs text-slate-500">{startDisabledReason}</code>
          ) : null}
          {startError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {startError}
            </div>
          ) : null}
          {startResult ? (
            <div className="grid gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{startResult.status}</span>
                <Badge variant="outline">{startResult.safetyStatus || "paper_start"}</Badge>
              </div>
              <code className="break-all text-xs">{startResult.reasonCode || "none"}</code>
              {startResult.sessionId ? <code className="break-all text-xs">{startResult.sessionId}</code> : null}
            </div>
          ) : null}
        </section>

        <Separator />

        <section className="grid gap-2" aria-label="Local paper session run">
          <Button
            type="button"
            className="justify-start"
            disabled={!canRunLocal || isRunningLocal}
            title={runLocalDisabledReason ?? "Run local paper session"}
            onClick={onRunLocalPaperSession}
            aria-label="Run local paper session"
          >
            {isRunningLocal ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <PlayCircle className="size-4" aria-hidden="true" />
            )}
            Run local
          </Button>
          <div className="grid gap-1 text-xs leading-5 text-slate-600">
            <p>Local/dev simulated paper runtime only. No exchange, testnet, or live route is contacted.</p>
            <p>Load or start a queued session to run the local/dev engine.</p>
          </div>
          {runLocalDisabledReason && !canRunLocal ? (
            <code className="break-all text-xs text-slate-500">{runLocalDisabledReason}</code>
          ) : null}
          <RunLocalCannotRunEvidence detail={paperSessionDetail} disabledReason={runLocalDisabledReason} />
          {runLocalError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {runLocalError}
            </div>
          ) : null}
          {runLocalResult ? (
            <div className="grid gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">Latest local run</span>
                <Badge variant="outline">{runLocalResult.safetyStatus || "local_dev_paper_engine_tick"}</Badge>
              </div>
              <code className="break-all text-xs">{runLocalResult.reasonCode || "none"}</code>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <span>Candles: {formatNumber(runLocalResult.candlesProcessed)}</span>
                <span>Orders: {formatNumber(runLocalResult.ordersCreated)}</span>
                <span>Fills: {formatNumber(runLocalResult.fillsCreated)}</span>
                <span>Snapshots: {formatNumber(runLocalResult.snapshotsCreated)}</span>
              </div>
            </div>
          ) : null}
        </section>

        <Separator />

        <section className="grid gap-2" aria-label="Local paper session cancel">
          <Button
            type="button"
            variant="outline"
            className="justify-start border-amber-200 text-amber-800 hover:bg-amber-50"
            disabled={!canCancelLocal || isCancellingLocal}
            title={cancelLocalDisabledReason ?? "Cancel local paper session"}
            onClick={onCancelLocalPaperSession}
            aria-label="Cancel local paper session"
          >
            {isCancellingLocal ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Ban className="size-4" aria-hidden="true" />
            )}
            Cancel local
          </Button>
          <div className="grid gap-1 text-xs leading-5 text-slate-600">
            <p>Local/dev simulated cancel only. No exchange, testnet, or live route is contacted.</p>
            <p>Queued sessions cancel immediately; running sessions stop at the next engine checkpoint.</p>
          </div>
          {cancelLocalDisabledReason && !canCancelLocal ? (
            <code className="break-all text-xs text-slate-500">{cancelLocalDisabledReason}</code>
          ) : null}
          {cancelLocalError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {cancelLocalError}
            </div>
          ) : null}
          {cancelLocalResult ? (
            <div className="grid gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">Latest local cancel</span>
                <Badge variant="outline">{cancelLocalResult.safetyStatus || "local_dev_paper_cancel"}</Badge>
              </div>
              <code className="break-all text-xs">{cancelLocalResult.reasonCode || "none"}</code>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <span>Previous: {cancelLocalResult.previousStatus ?? "N/A"}</span>
                <span>Current: {cancelLocalResult.currentStatus ?? "N/A"}</span>
              </div>
            </div>
          ) : null}
        </section>

        <Separator />

        <section className="grid gap-2" aria-label="Local paper session resume">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-900">Local paper session resume</p>
            <Badge variant="outline">local/dev only</Badge>
          </div>
          <Button
            type="button"
            variant="outline"
            className="justify-start border-blue-200 text-blue-800 hover:bg-blue-50"
            disabled={!canResumeLocal || isResumingLocal}
            title={resumeLocalDisabledReason ?? "Resume local paper session"}
            onClick={onResumeLocalPaperSession}
            aria-label="Resume local paper session"
          >
            {isResumingLocal ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <RotateCcw className="size-4" aria-hidden="true" />
            )}
            Resume local
          </Button>
          <div className="grid gap-1 text-xs leading-5 text-slate-600">
            <p>Resume requeues the loaded cancelled session from its persisted checkpoint.</p>
            <p>Resume does not run automatically. Use Run local after the session is queued.</p>
          </div>
          {isPaperSessionResumeReadinessLoading ? (
            <code className="break-all text-xs text-slate-500">Paper resume readiness is loading.</code>
          ) : null}
          {paperSessionResumeReadiness ? (
            <div className="grid gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-slate-900">Resume readiness</span>
                <Badge variant="outline">{paperSessionResumeReadiness.safetyStatus}</Badge>
              </div>
              <code className="break-all text-slate-700">{paperSessionResumeReadiness.reasonCode || "none"}</code>
              <span>checkpoint: {paperSessionResumeReadiness.checkpointSource || "N/A"}</span>
            </div>
          ) : null}
          {resumeLocalDisabledReason && !canResumeLocal ? (
            <code className="break-all text-xs text-slate-500">{resumeLocalDisabledReason}</code>
          ) : null}
          {paperSessionResumeReadinessError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {paperSessionResumeReadinessError}
            </div>
          ) : null}
          {resumeLocalError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {resumeLocalError}
            </div>
          ) : null}
          {resumeLocalResult ? (
            <div className="grid gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">Latest local resume</span>
                <Badge variant="outline">{resumeLocalResult.safetyStatus || "local_dev_paper_resume"}</Badge>
              </div>
              <code className="break-all text-xs">{resumeLocalResult.reasonCode || "none"}</code>
              <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                <span className="min-w-0 break-all">Source: {resumeLocalResult.sourceSessionId ?? "N/A"}</span>
                <span className="min-w-0 break-all">Resume: {resumeLocalResult.resumeSessionId ?? "N/A"}</span>
                <span>Source status: {resumeLocalResult.sourceStatus ?? "N/A"}</span>
                <span>Resume status: {resumeLocalResult.resumeStatus ?? "N/A"}</span>
                <span className="min-w-0 break-all">Next candle: {resumeLocalResult.resumeCursor?.nextCandleOpenTime ?? "N/A"}</span>
                <span>Attempt: {resumeLocalResult.resumeCursor?.attemptNo ?? "N/A"}</span>
              </div>
            </div>
          ) : null}
        </section>

        <Separator />

        <section className="grid gap-2" aria-label="Local paper session retry">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-900">Retry from terminal session</p>
            <Badge variant="outline">local/dev only</Badge>
          </div>
          <Button
            type="button"
            variant="outline"
            className="justify-start border-blue-200 text-blue-800 hover:bg-blue-50"
            disabled={!canRetryLocal || isRetryingLocal}
            title={retryLocalDisabledReason ?? "Retry local paper session"}
            onClick={onRetryLocalPaperSession}
            aria-label="Retry local paper session"
          >
            {isRetryingLocal ? (
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="size-4" aria-hidden="true" />
            )}
            Retry local
          </Button>
          <div className="grid gap-1 text-xs leading-5 text-slate-600">
            <p>Local/dev retry only for loaded failed, blocked, or cancelled paper session detail.</p>
            <p>Retry queues a new session. It does not run automatically.</p>
          </div>
          {retryLocalDisabledReason && !canRetryLocal ? (
            <code className="break-all text-xs text-slate-500">{retryLocalDisabledReason}</code>
          ) : null}
          {retryLocalError ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
              {retryLocalError}
            </div>
          ) : null}
          {retryLocalResult ? (
            <div className="grid gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">Latest local retry</span>
                <Badge variant="outline">{retryLocalResult.safetyStatus || "local_dev_paper_retry"}</Badge>
              </div>
              <code className="break-all text-xs">{retryLocalResult.reasonCode || "none"}</code>
              <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                <span className="min-w-0 break-all">Source: {retryLocalResult.sourceSessionId ?? "N/A"}</span>
                <span className="min-w-0 break-all">Retry: {retryLocalResult.retrySessionId ?? "N/A"}</span>
                <span>Source status: {retryLocalResult.sourceStatus ?? "N/A"}</span>
                <span>Retry status: {retryLocalResult.retryStatus ?? "N/A"}</span>
              </div>
            </div>
          ) : null}
        </section>

        <Separator />

        <section className="grid gap-2" aria-label="Latest queued session">
          <p className="text-sm font-medium text-slate-900">Latest queued session</p>
          {startResult?.sessionId ? (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Latest same-session queue result: <code className="break-all">{startResult.sessionId}</code>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              No paper session has been started in this UI session.
            </div>
          )}
        </section>

        <section className="grid gap-2" aria-label="Audit evidence">
          <p className="text-sm font-medium text-slate-900">Audit evidence</p>
          {startResult?.auditEventIds.length ? (
            <div className="grid gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              {startResult.auditEventIds.map((auditId) => (
                <code key={auditId} className="break-all text-xs text-slate-700">
                  {auditId}
                </code>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              No audit evidence is available for this UI session.
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  )
}
