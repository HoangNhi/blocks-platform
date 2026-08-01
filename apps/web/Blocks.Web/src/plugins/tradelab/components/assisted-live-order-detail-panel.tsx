import { ClipboardList, LoaderCircle, ShieldCheck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"

import type { TradeLabLiveOrderDetail, TradeLabLiveOrderJournalProjectionResult, TradeLabLiveOrderPreviewResult } from "../types"

type AssistedLiveOrderDetailPanelProps = {
  detail?: TradeLabLiveOrderDetail | null
  preview?: TradeLabLiveOrderPreviewResult | null
  errorMessage?: string | null
  isLoading?: boolean
  canProjectToJournal?: boolean
  isProjectingToJournal?: boolean
  projectionResult?: TradeLabLiveOrderJournalProjectionResult | null
  projectionError?: string | null
  onProjectToJournal?: () => void
}

function JsonBlock({ value }: { value: Record<string, unknown> | null | undefined }) {
  return (
    <pre className="max-h-48 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">
      {JSON.stringify(value ?? {}, null, 2)}
    </pre>
  )
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="break-all text-sm font-medium text-slate-800">{value || "-"}</dd>
    </div>
  )
}

export function AssistedLiveOrderDetailPanel({
  detail = null,
  preview = null,
  errorMessage = null,
  isLoading = false,
  canProjectToJournal = false,
  isProjectingToJournal = false,
  projectionResult = null,
  projectionError = null,
  onProjectToJournal,
}: AssistedLiveOrderDetailPanelProps) {
  const intent = detail?.intent ?? null
  const latestPreview = detail?.latestPreview ?? null
  const previewOrder = preview?.order ?? null

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="size-4 text-sky-600" aria-hidden="true" />
            Assisted Live Evidence
          </CardTitle>
          <Badge variant="secondary">Explicit confirm</Badge>
        </div>
        <p className="text-xs text-slate-500">Read-only live order intent, preview snapshots, and lifecycle audit trail.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? <Skeleton className="h-28 w-full" /> : null}
        {errorMessage ? <p className="break-words text-sm text-rose-600">{errorMessage}</p> : null}
        {!detail && !preview && !isLoading ? (
          <div className="rounded-md border border-dashed p-4 text-sm text-slate-500">
            Generate a preview or select a recent assisted live order to inspect read-only evidence.
          </div>
        ) : null}

        {preview ? (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-emerald-600" aria-hidden="true" />
              <h3 className="text-sm font-semibold text-slate-800">Current preview result</h3>
            </div>
            <dl className="grid gap-3 md:grid-cols-3">
              <Field label="Status" value={preview.status} />
              <Field label="Reason" value={preview.reasonCode} />
              <Field label="clientOrderId" value={preview.clientOrderId} />
              <Field label="Intent ID" value={preview.intentId} />
              <Field label="Preview ID" value={preview.previewId} />
              <Field label="Safety" value={preview.safetyStatus} />
              <Field label="Symbol" value={previewOrder?.symbol} />
              <Field label="Side" value={previewOrder?.side} />
              <Field label="Order type" value={previewOrder?.orderType} />
              <Field label="Quantity" value={previewOrder?.quantity} />
              <Field label="Quote quantity" value={previewOrder?.quoteQuantity} />
              <Field label="Expires at" value={preview.expiresAt} />
            </dl>
          </section>
        ) : null}

        {detail ? (
          <section className="space-y-4">
            <Separator />
            <dl className="grid gap-3 md:grid-cols-3">
              <Field label="Intent ID" value={intent?.intentId} />
              <Field label="clientOrderId" value={intent?.clientOrderId} />
              <Field label="Status" value={intent?.status} />
              <Field label="Reason" value={intent?.reasonCode} />
              <Field label="Credential ref" value={intent?.credentialRefId} />
              <Field label="Latest preview" value={intent?.latestPreviewId} />
              <Field label="Environment" value={intent?.environment} />
              <Field label="Symbol" value={intent?.symbol} />
              <Field label="Side" value={intent?.side} />
            </dl>

            <div className="grid gap-3 lg:grid-cols-3">
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-800">Credential snapshot</h3>
                <JsonBlock value={latestPreview?.credentialSnapshot} />
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-800">Risk snapshot</h3>
                <JsonBlock value={latestPreview?.riskSnapshot} />
              </div>
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-slate-800">Source snapshot</h3>
                <JsonBlock value={latestPreview?.sourceSnapshot} />
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-800">Lifecycle events</h3>
              <div className="grid gap-2">
                {detail.events.length ? detail.events.map((event) => (
                  <div key={event.eventId} className="rounded-md border p-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-slate-800">{event.eventType}</span>
                      <Badge variant="outline">{event.toStatus ?? event.reasonCode ?? "audit"}</Badge>
                    </div>
                    <p className="mt-2 break-all text-slate-500">eventId: {event.eventId}</p>
                    <p className="break-all text-slate-500">clientOrderId: {event.clientOrderId ?? "-"}</p>
                    <p className="text-slate-500">createdAt: {event.createdAt ?? "-"}</p>
                  </div>
                )) : <p className="text-sm text-slate-500">No lifecycle events recorded.</p>}
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-800">Reconciliation attempts</h3>
              <div className="grid gap-2">
                {detail.reconciliationAttempts.length ? detail.reconciliationAttempts.map((attempt, index) => (
                  <div key={String(attempt.attemptId ?? index)} className="rounded-md border p-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-slate-800">Attempt {String(attempt.attemptNo ?? index)}</span>
                      <Badge variant="outline">{String(attempt.status ?? "recorded")}</Badge>
                    </div>
                    <p className="mt-2 break-all text-slate-500">trigger: {String(attempt.trigger ?? "-")}</p>
                    <p className="break-all text-slate-500">reason: <span>{String(attempt.reasonCode ?? attempt.reason_code ?? "-")}</span></p>
                    <p className="break-all text-slate-500">exchange: {String(attempt.exchangeOrderStatus ?? attempt.exchange_order_status ?? "-")}</p>
                  </div>
                )) : <p className="text-sm text-slate-500">No reconciliation attempts recorded.</p>}
              </div>
            </div>

            <div className="rounded-md border border-dashed p-3 text-sm text-slate-600">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-slate-800">Journal bridge readiness</span>
                <Badge variant="secondary">Phase 20</Badge>
              </div>
              <p className="mt-2">Projection writes live execution evidence into the execution journal after terminal order evidence exists.</p>
              {projectionResult ? <p className="mt-2 break-all text-emerald-700">{projectionResult.reasonCode}</p> : null}
              {projectionError ? <p className="mt-2 break-words text-rose-600">{projectionError}</p> : null}
              <Dialog>
                <DialogTrigger asChild>
                  <Button type="button" className="mt-3" disabled={!canProjectToJournal || isProjectingToJournal}>
                    {isProjectingToJournal ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : null}
                    Project to journal
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Project assisted live evidence</DialogTitle>
                    <DialogDescription>
                      This writes live execution evidence into the execution journal and does not mutate exchange state.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button type="button" onClick={onProjectToJournal} disabled={isProjectingToJournal}>
                      Project to journal
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </section>
        ) : null}
      </CardContent>
    </Card>
  )
}
