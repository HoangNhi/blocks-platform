import type { ReactNode } from "react"
import { Activity, AlertTriangle, FileText } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

import type { TradeLabPaperSessionDetail, TradeLabPaperSessionRunLocalResult } from "../types"
import {
  buildPaperRuntimeTimeline,
  type TradeLabPaperRuntimeTimelineEvent,
} from "../utils/paper-runtime-timeline"

type PaperRuntimeDetailPanelProps = {
  detail: TradeLabPaperSessionDetail | null
  runResult: TradeLabPaperSessionRunLocalResult | null
  errorMessage: string | null
}

function formatNumber(value: number | null | undefined) {
  return typeof value === "number" ? new Intl.NumberFormat("en-US").format(value) : "-"
}

function latestSnapshot(detail: TradeLabPaperSessionDetail | null) {
  return detail?.artifacts.portfolioSnapshots.at(-1) ?? null
}

function formatStatusLabel(status: string | null | undefined) {
  if (!status) return "No session"

  const words = status.split(/[_\s-]+/).filter(Boolean)

  if (words.length === 0) return "No session"

  return [words[0].slice(0, 1).toUpperCase() + words[0].slice(1), ...words.slice(1)].join(" ")
}

function lifecycleCopy(status: string | null | undefined, runResult: TradeLabPaperSessionRunLocalResult | null) {
  if (runResult?.status === "completed") return "Local/dev run finished"
  if (runResult?.status) return `Local/dev run ${runResult.status}`
  if (status === "queued") return "Awaiting local/dev run"
  if (status === "completed") return "Local/dev run finished"
  if (status === "failed") return "Local/dev run failed"
  if (status === "cancelled") return "Local/dev run cancelled"
  if (status === "running") return "Local/dev run in progress"
  return "No paper session loaded"
}

function artifactLimitSummary(detail: TradeLabPaperSessionDetail) {
  const limits = detail.artifacts.limits
  return `orders ${limits.orders} / fills ${limits.fills} / snapshots ${limits.portfolioSnapshots}`
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "not available"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return date.toISOString().replace(".000Z", "Z")
}

function isHappyPathStatus(status: string | null | undefined) {
  return status === "queued" || status === "running" || status === "completed"
}

function gateEvidenceFromDetail(detail: TradeLabPaperSessionDetail) {
  const context = detail.gateContext as Record<string, unknown>
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

function artifactCounts(detail: TradeLabPaperSessionDetail | null) {
  return {
    orders: detail?.artifacts.orders.length ?? 0,
    fills: detail?.artifacts.fills.length ?? 0,
    positions: detail?.artifacts.positions.length ?? 0,
    snapshots: detail?.artifacts.portfolioSnapshots.length ?? 0,
  }
}

function artifactCountsCopy(detail: TradeLabPaperSessionDetail | null) {
  const counts = artifactCounts(detail)
  return `Orders ${counts.orders} / fills ${counts.fills} / positions ${counts.positions} / snapshots ${counts.snapshots}`
}

function hasRuntimeArtifacts(detail: TradeLabPaperSessionDetail | null) {
  const counts = artifactCounts(detail)
  return counts.orders + counts.fills + counts.positions + counts.snapshots > 0
}

function artifactStateCopy(detail: TradeLabPaperSessionDetail | null) {
  if (!hasRuntimeArtifacts(detail)) return "No runtime artifacts have been persisted yet."
  if (detail?.session.status === "completed") return "Runtime artifacts persisted for completed session."
  return "Partial runtime artifacts are available for inspection."
}

function latestAuditEvent(detail: TradeLabPaperSessionDetail | null) {
  return detail?.auditEvents.at(-1) ?? null
}

function relevantAuditEvents(detail: TradeLabPaperSessionDetail) {
  return detail.auditEvents
    .filter((event) => event.newState === detail.session.status || event.reasonCode === detail.session.reasonCode)
    .slice(-3)
}

function runOutcomeCopy(status: string | null | undefined, runResult: TradeLabPaperSessionRunLocalResult | null) {
  if (status === "blocked" || status === "cannot_run" || status === "cannot-run") {
    return "No local/dev run happened for this loaded paper session."
  }

  return lifecycleCopy(status, runResult)
}

function formatTimelineTime(value: string | null) {
  if (!value) return "Time unavailable"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  return date.toISOString().replace(".000Z", "Z")
}

function timelineBadgeClass(kind: TradeLabPaperRuntimeTimelineEvent["kind"]) {
  if (kind === "session") return "border-blue-200 bg-blue-50 text-blue-700"
  if (kind === "audit") return "border-slate-200 bg-slate-50 text-slate-700"
  if (kind === "order") return "border-amber-200 bg-amber-50 text-amber-800"
  if (kind === "fill") return "border-emerald-200 bg-emerald-50 text-emerald-700"
  return "border-violet-200 bg-violet-50 text-violet-700"
}

function RuntimeTimeline({ detail }: { detail: TradeLabPaperSessionDetail | null }) {
  const events = buildPaperRuntimeTimeline(detail)

  return (
    <div
      aria-label="Runtime timeline"
      className="grid min-w-0 gap-3 rounded-lg border border-platform-border bg-platform-surface-muted p-3 [overflow-wrap:anywhere]"
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-platform-ink">Runtime timeline</p>
        <Badge variant="outline">{events.length} events</Badge>
      </div>
      {events.length === 0 ? (
        <div className="rounded-md border border-dashed border-platform-border bg-platform-surface px-3 py-2 text-sm text-platform-muted">
          No timeline evidence is available for this paper session.
        </div>
      ) : (
        <ol className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 border-l border-platform-border pl-3">
          {events.map((event) => (
            <li
              key={event.id}
              className="grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)] gap-1 rounded-md border border-platform-border bg-platform-surface px-3 py-2 [overflow-wrap:anywhere]"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="break-all text-sm font-medium text-platform-ink [overflow-wrap:anywhere]">{event.title}</p>
                  <p className="break-all text-xs text-platform-muted [overflow-wrap:anywhere]">{event.description}</p>
                </div>
                <Badge variant="outline" className={timelineBadgeClass(event.kind)}>
                  {event.kind}
                </Badge>
              </div>
              <div className="grid min-w-0 gap-1 text-xs text-platform-muted">
                <TimelineField label="time" value={formatTimelineTime(event.occurredAt)} />
                {event.status ? <TimelineField label="status" value={event.status} /> : null}
                {event.reasonCode ? <TimelineField label="reason" value={event.reasonCode} /> : null}
                {event.primaryId ? <TimelineField label="primary id" value={event.primaryId} /> : null}
                {event.secondaryId ? <TimelineField label="linked id" value={event.secondaryId} /> : null}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function TimelineField({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 max-w-full gap-0.5">
      <span className="text-[11px] font-medium uppercase text-platform-muted">{label}</span>
      <code className="max-w-full break-all whitespace-normal text-xs text-platform-ink [overflow-wrap:anywhere]">{value}</code>
    </div>
  )
}

function CloseoutField({
  label,
  value,
  code = false,
}: {
  label: string
  value: string
  code?: boolean
}) {
  return (
    <div className="grid min-w-0 gap-1">
      <span className="text-[11px] font-medium uppercase text-platform-muted">{label}</span>
      {code ? (
        <code className="max-w-full break-all rounded bg-platform-surface-muted px-2 py-1 text-xs text-platform-ink [overflow-wrap:anywhere]">
          {value}
        </code>
      ) : (
        <span className="break-words text-sm text-platform-ink [overflow-wrap:anywhere]">{value}</span>
      )}
    </div>
  )
}

function CloseoutSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-3 rounded-lg border border-platform-border bg-platform-surface-muted p-3 [overflow-wrap:anywhere]">
      <h3 className="text-sm font-medium text-platform-ink">{title}</h3>
      <div className="grid min-w-0 gap-3">{children}</div>
    </div>
  )
}

function PaperRuntimeCloseoutSummary({
  detail,
  runResult,
}: {
  detail: TradeLabPaperSessionDetail | null
  runResult: TradeLabPaperSessionRunLocalResult | null
}) {
  const session = detail?.session ?? null
  const snapshot = latestSnapshot(detail)
  const audit = latestAuditEvent(detail)
  const sessionId = session?.sessionId ?? runResult?.sessionId ?? "not loaded"
  const runtimeWindow = session ? `${formatDateTime(session.startAt)} to ${formatDateTime(session.endAt)}` : "not available"
  const latestAuditCopy = audit
    ? `${audit.action || "audit event"}${audit.reasonCode ? ` (${audit.reasonCode})` : ""}`
    : "No audit event is available yet."

  return (
    <div
      aria-label="Paper runtime closeout summary"
      className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))] gap-3"
    >
      <CloseoutSection title="Session summary">
        {session ? null : (
          <p className="text-sm text-platform-muted">
            Load a paper session from the Paper session panel to inspect runtime evidence.
          </p>
        )}
        <CloseoutField label="Status" value={formatStatusLabel(session?.status ?? runResult?.status)} />
        <CloseoutField label="Session ID" value={sessionId} code />
        <CloseoutField label="Dataset" value={session?.datasetKey ?? "not available"} code />
        <CloseoutField label="Strategy version" value={session?.strategyVersionId ?? "not available"} code />
        <CloseoutField label="Runtime window" value={runtimeWindow} />
      </CloseoutSection>

      <CloseoutSection title="Runtime evidence">
        <CloseoutField label="Outcome" value={runOutcomeCopy(session?.status, runResult)} />
        <CloseoutField label="Reason" value={session?.reasonCode ?? runResult?.reasonCode ?? "none"} code />
        <CloseoutField label="Artifact state" value={artifactStateCopy(detail)} />
        <CloseoutField label="Artifacts" value={artifactCountsCopy(detail)} />
      </CloseoutSection>

      <CloseoutSection title="Portfolio summary">
        {snapshot ? (
          <>
            <CloseoutField label="Latest equity" value={formatNumber(snapshot.equity)} />
            <CloseoutField label="Cash" value={formatNumber(snapshot.cashBalance)} />
            <CloseoutField label="Drawdown" value={`${formatNumber(snapshot.drawdownPct)}%`} />
            <CloseoutField label="Exposure" value={formatNumber(snapshot.exposureNotional)} />
          </>
        ) : (
          <p className="text-sm text-platform-muted">No portfolio snapshot has been persisted yet.</p>
        )}
      </CloseoutSection>

      <CloseoutSection title="Latest audit">
        <CloseoutField label="Audit" value={latestAuditCopy} code={Boolean(audit)} />
        {audit ? <CloseoutField label="State" value={`${audit.oldState ?? "N/A"} -> ${audit.newState ?? "N/A"}`} /> : null}
        {audit?.actor ? <CloseoutField label="Actor" value={audit.actor} /> : null}
      </CloseoutSection>
    </div>
  )
}

function NonHappyPathEvidence({ detail }: { detail: TradeLabPaperSessionDetail }) {
  if (isHappyPathStatus(detail.session.status)) {
    return null
  }

  const gates = gateEvidenceFromDetail(detail)
  const auditEvents = relevantAuditEvents(detail)

  return (
    <Alert>
      <AlertTriangle className="size-4" aria-hidden="true" />
      <AlertTitle>Non-happy-path evidence</AlertTitle>
      <AlertDescription>
        <div className="mt-2 grid gap-3 text-sm">
          <div className="grid gap-1">
            <span className="font-medium text-platform-ink">Status</span>
            <code className="break-all rounded bg-platform-surface-muted px-2 py-1 text-xs">
              {detail.session.status || "unknown"}
            </code>
          </div>
          <div className="grid gap-1">
            <span className="font-medium text-platform-ink">Reason</span>
            <code className="break-all rounded bg-platform-surface-muted px-2 py-1 text-xs">
              {detail.session.reasonCode || "none"}
            </code>
          </div>
          {detail.session.errorMessage ? (
            <div className="break-words text-rose-700">{detail.session.errorMessage}</div>
          ) : null}
          {gates.length > 0 ? (
            <div className="grid gap-2">
              <span className="font-medium text-platform-ink">Gate evidence</span>
              {gates.map((gate) => (
                <div key={`${gate.gate}-${gate.reasonCode}`} className="grid gap-1 rounded-md border border-platform-border p-2">
                  <span>{gate.gate}</span>
                  <code className="break-all text-xs">{gate.reasonCode}</code>
                  {gate.message ? <span className="break-words">{gate.message}</span> : null}
                </div>
              ))}
            </div>
          ) : null}
          <div className="grid gap-1">
            <span className="font-medium text-platform-ink">Artifact state</span>
            <span>{artifactStateCopy(detail)}</span>
          </div>
          {auditEvents.length > 0 ? (
            <div className="grid gap-2">
              <span className="font-medium text-platform-ink">Latest state audit</span>
              {auditEvents.map((event) => (
                <div key={event.auditEventId || `${event.action}-${event.eventAt}`} className="grid gap-1">
                  <span className="break-all">{event.action}</span>
                  <code className="break-all text-xs">{event.reasonCode || "none"}</code>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </AlertDescription>
    </Alert>
  )
}

export function PaperRuntimeDetailPanel({ detail, runResult, errorMessage }: PaperRuntimeDetailPanelProps) {
  const session = detail?.session ?? null
  const snapshot = latestSnapshot(detail)
  const isQueued = session?.status === "queued" && !runResult

  return (
    <section className="grid gap-4 rounded-xl border border-platform-border bg-platform-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-medium uppercase text-platform-muted">
            <Activity className="size-4" aria-hidden="true" />
            Local/dev runtime
          </div>
          <h2 className="mt-1 text-xl font-semibold text-platform-ink">Paper Runtime Detail</h2>
          <p className="mt-1 break-all text-sm text-platform-muted">
            {session?.sessionId ?? runResult?.sessionId ?? "No paper session loaded yet."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {session?.status ? <Badge variant="outline">{session.status}</Badge> : null}
          {runResult?.safetyStatus ? <Badge variant="secondary">{runResult.safetyStatus}</Badge> : null}
        </div>
      </div>

      {errorMessage ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" aria-hidden="true" />
          <AlertTitle>Runtime detail error</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      {session?.reasonCode || runResult?.reasonCode ? (
        <code className="break-all rounded-md bg-platform-surface-muted px-3 py-2 text-xs text-platform-muted">
          {session?.reasonCode ?? runResult?.reasonCode}
        </code>
      ) : null}

      <PaperRuntimeCloseoutSummary detail={detail} runResult={runResult} />

      {detail ? <NonHappyPathEvidence detail={detail} /> : null}

      <RuntimeTimeline detail={detail} />

      <div className="grid gap-2 rounded-lg border border-platform-border bg-platform-surface-muted p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium text-platform-ink">Lifecycle</p>
          <Badge variant="outline">{formatStatusLabel(session?.status ?? runResult?.status)}</Badge>
        </div>
        <p className="text-sm text-platform-muted">{runOutcomeCopy(session?.status, runResult)}</p>
        {detail ? (
          <p className="text-xs text-platform-muted">
            <span className="font-medium text-platform-ink">Artifact limits</span>
            <span className="sr-only">: </span>
            <span className="block text-platform-muted">{artifactLimitSummary(detail)}</span>
          </p>
        ) : null}
      </div>

      {isQueued ? (
        <div className="rounded-lg border border-dashed border-platform-border bg-platform-surface-muted p-4 text-sm text-platform-muted">
          Session is queued and has not run locally yet.
        </div>
      ) : null}

      {runResult ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Candles processed" value={formatNumber(runResult.candlesProcessed)} />
          <Metric label="Orders created" value={formatNumber(runResult.ordersCreated)} />
          <Metric label="Fills created" value={formatNumber(runResult.fillsCreated)} />
          <Metric label="Snapshots created" value={formatNumber(runResult.snapshotsCreated)} />
        </div>
      ) : null}

      {snapshot ? (
        <div className="grid gap-3 rounded-lg border border-platform-border p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-platform-ink">
            <FileText className="size-4" aria-hidden="true" />
            Latest portfolio snapshot
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-4">
            <Metric label="Equity" value={formatNumber(snapshot.equity)} />
            <Metric label="Cash" value={formatNumber(snapshot.cashBalance)} />
            <Metric label="Realized PnL" value={formatNumber(snapshot.realizedPnl)} />
            <Metric label="Exposure" value={formatNumber(snapshot.exposureNotional)} />
          </div>
        </div>
      ) : null}

      {detail ? (
        <>
          <Separator />
          <ArtifactTable
            title="Orders"
            rows={detail.artifacts.orders.map((order) => ({
              id: order.orderId,
              primary: order.side,
              secondary: order.status,
              value: formatNumber(order.requestedNotional),
            }))}
          />
          <ArtifactTable
            title="Fills"
            rows={detail.artifacts.fills.map((fill) => ({
              id: fill.fillId,
              primary: fill.side,
              secondary: fill.sourceCandleId ?? "-",
              value: formatNumber(fill.notional),
            }))}
          />
          <ArtifactTable
            title="Audit events"
            rows={detail.auditEvents.map((event) => ({
              id: event.auditEventId,
              primary: event.action,
              secondary: event.actor ?? "-",
              value: event.newState ?? "-",
            }))}
          />
        </>
      ) : null}
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-platform-border bg-platform-surface-muted p-3">
      <p className="text-xs text-platform-muted">{label}</p>
      <p className="mt-1 break-all text-lg font-semibold text-platform-ink">{value}</p>
    </div>
  )
}

function ArtifactTable({
  title,
  rows,
}: {
  title: string
  rows: Array<{ id: string; primary: string; secondary: string; value: string }>
}) {
  return (
    <div className="grid gap-2">
      <h3 className="text-sm font-medium text-platform-ink">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-platform-muted">No {title.toLowerCase()} have been persisted for this paper session.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Value</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="break-all font-mono text-xs">{row.id}</TableCell>
                  <TableCell className="break-all">{row.primary}</TableCell>
                  <TableCell className="break-all">{row.secondary}</TableCell>
                  <TableCell>{row.value}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
