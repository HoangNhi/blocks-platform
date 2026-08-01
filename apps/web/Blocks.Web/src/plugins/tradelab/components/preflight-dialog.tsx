import { AlertTriangle, CheckCircle2, LoaderCircle, PlayCircle, ShieldAlert } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"

import type { TradeLabPreflightResult } from "../types"
import type { ResearchStatusLevel } from "../utils/research-run-readiness"
import { formatDateTime, formatSourceSummary } from "../utils"

export type PreflightPayloadSummary = {
  strategyVersion: string
  exchange: string
  symbol: string
  timeframe: string
  startAt: string
  endAt: string
  initialEquity: number
  feeBps: number
  slippageBps: number
  maxOrderPercent: number
  maxPositionPercent: number
  maxDrawdownPercent: number
  minNotional: number
  stepSize: number
  tickSize: number
}

type PreflightDialogProps = {
  open: boolean
  preflight: TradeLabPreflightResult | null
  payloadSummary?: PreflightPayloadSummary | null
  readinessLevel?: ResearchStatusLevel
  readinessMessages?: string[]
  isConfirming?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function PreflightDialog({
  open,
  preflight,
  payloadSummary = null,
  readinessLevel = "ready",
  readinessMessages = [],
  isConfirming = false,
  onConfirm,
  onCancel,
}: PreflightDialogProps) {
  const readinessBlocked = readinessLevel === "blocked"
  const blocked = preflight?.outcome === "blocked" || readinessBlocked
  const needsRepair = preflight?.outcome === "needs_repair"
  const needsFill = preflight?.outcome === "needs_fill"

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onCancel())}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {blocked ? (
              <ShieldAlert className="size-5 text-rose-600" aria-hidden="true" />
            ) : needsRepair ? (
              <AlertTriangle className="size-5 text-amber-600" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="size-5 text-emerald-600" aria-hidden="true" />
            )}
            Backtest preflight
          </DialogTitle>
          <DialogDescription>
            Review dataset coverage before the system starts a data job or queues the backtest.
          </DialogDescription>
        </DialogHeader>

        {preflight ? (
          <div className="grid gap-4">
            <section className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="grid gap-2 md:grid-cols-2">
                <Field label="Dataset" value={`${preflight.exchange} · ${preflight.symbol} · ${preflight.timeframe}`} />
                <Field label="Dataset key" value={preflight.datasetKey} />
                <Field label="Outcome" value={preflight.outcome.replaceAll("_", " ")} />
                <Field label="Sources" value={formatSourceSummary(preflight.sourceSummary)} />
                <Field label="Requested start" value={formatDateTime(preflight.requestedStartAt)} />
                <Field label="Requested end" value={formatDateTime(preflight.requestedEndAt)} />
                {preflight.activeJobId ? (
                  <Field label="Active data job" value={`${preflight.activeJobType ?? "job"} · ${preflight.activeJobId}`} />
                ) : null}
              </div>
              <Separator />
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{preflight.coverage?.healthStatus ?? "no coverage"}</Badge>
                <Badge variant="secondary">{preflight.action ?? "ready"}</Badge>
                {blocked ? <Badge variant="destructive">Blocked</Badge> : null}
                {needsRepair ? <Badge className="bg-amber-600 hover:bg-amber-600">Repair required</Badge> : null}
                {needsFill ? <Badge className="bg-blue-600 hover:bg-blue-600">Fill required</Badge> : null}
              </div>
            </section>

            {payloadSummary ? (
              <section className="grid gap-3 rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold text-slate-900">Final payload</h4>
                  <Badge variant="secondary">Modified for this run</Badge>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <Field label="Strategy version" value={payloadSummary.strategyVersion} />
                  <Field label="Market" value={`${payloadSummary.exchange} · ${payloadSummary.symbol} · ${payloadSummary.timeframe}`} />
                  <Field label="Start" value={formatDateTime(payloadSummary.startAt)} />
                  <Field label="End" value={formatDateTime(payloadSummary.endAt)} />
                  <Field label="Initial equity" value={String(payloadSummary.initialEquity)} />
                  <Field label="Fee/slippage bps" value={`${payloadSummary.feeBps} / ${payloadSummary.slippageBps}`} />
                  <Field label="Max order/position/drawdown" value={`${payloadSummary.maxOrderPercent}% / ${payloadSummary.maxPositionPercent}% / ${payloadSummary.maxDrawdownPercent}%`} />
                  <Field label="Min notional / step / tick" value={`${payloadSummary.minNotional} / ${payloadSummary.stepSize} / ${payloadSummary.tickSize}`} />
                </div>
              </section>
            ) : null}

            {readinessMessages.length > 0 ? (
              <Alert variant={readinessBlocked ? "destructive" : "default"}>
                {readinessBlocked ? <ShieldAlert className="size-4" /> : <AlertTriangle className="size-4" />}
                <AlertTitle>{readinessBlocked ? "Sizing blocks this run" : "Readiness notes"}</AlertTitle>
                <AlertDescription className="grid gap-1">
                  {readinessMessages.map((message) => (
                    <span key={message}>{message}</span>
                  ))}
                </AlertDescription>
              </Alert>
            ) : null}

            {preflight.coverage ? (
              <section className="grid gap-3 rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-900">Coverage summary</h4>
                  <Badge variant="outline">{preflight.coverage.segmentCount} segments</Badge>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <Field label="Covered start" value={formatMaybeDate(preflight.coverage.coveredStartAt)} />
                  <Field label="Covered end" value={formatMaybeDate(preflight.coverage.coveredEndAt)} />
                  <Field label="Gap count" value={String(preflight.coverage.gapCount)} />
                  <Field label="Health" value={preflight.coverage.healthStatus} />
                </div>
                {preflight.coverage.segments.length > 0 ? (
                  <div className="grid gap-2">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Segments</p>
                    <div className="grid gap-2">
                      {preflight.coverage.segments.map((segment, index) => (
                        <div key={`${segment.startAt}-${index}`} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                          <Badge variant="outline">#{index + 1}</Badge>
                          <span>{formatMaybeDate(segment.startAt)} → {formatMaybeDate(segment.endAt)}</span>
                          <span className="text-slate-500">{segment.rowCount} candles</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}

            <section className="grid gap-3 rounded-xl border border-slate-200 p-4">
              <h4 className="text-sm font-semibold text-slate-900">What happens next</h4>
              <div className="grid gap-2">
                {preflight.repairStartAt && preflight.repairEndAt ? (
                  <div className="text-sm text-slate-600">
                    Repair range: {formatMaybeDate(preflight.repairStartAt)} → {formatMaybeDate(preflight.repairEndAt)}
                  </div>
                ) : null}
                {preflight.missingSegments.length > 0 ? (
                  <div className="grid gap-2">
                    {preflight.missingSegments.map((segment, index) => (
                      <div key={`${segment.startAt}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                        <strong className="text-slate-900">{segment.kind}</strong> gap from {formatMaybeDate(segment.startAt)} to {formatMaybeDate(segment.endAt)}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-slate-600">
                    The requested range is fully covered. The system will queue the backtest job.
                  </div>
                )}
              </div>
            </section>

            {preflight.reasons.length > 0 ? (
              <Alert variant={blocked ? "destructive" : "default"}>
                {blocked ? <ShieldAlert className="size-4" /> : <AlertTriangle className="size-4" />}
                <AlertTitle>{blocked ? "Execution blocked" : needsRepair ? "Repair required" : "Preflight notes"}</AlertTitle>
                <AlertDescription className="grid gap-1">
                  {preflight.reasons.map((reason) => (
                    <span key={reason}>{reason}</span>
                  ))}
                </AlertDescription>
              </Alert>
            ) : null}
          </div>
        ) : (
          <div className="grid gap-3 text-sm text-slate-500">
            <LoaderCircle className="size-5 animate-spin text-slate-400" aria-hidden="true" />
            Loading preflight details...
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isConfirming}>
            Cancel
          </Button>
          <Button type="button" onClick={onConfirm} disabled={blocked || isConfirming || preflight === null}>
            {isConfirming ? (
              <LoaderCircle className="mr-2 size-4 animate-spin" aria-hidden="true" />
            ) : (
              <PlayCircle className="mr-2 size-4" aria-hidden="true" />
            )}
            {blocked ? "Blocked" : preflight?.action === "repair" ? "Start repair" : preflight?.action === "fill" ? "Start fill" : "Run backtest"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-sm text-slate-900">{value}</span>
    </div>
  )
}

function formatMaybeDate(value: string | null) {
  return value ? formatDateTime(value) : "N/A"
}
