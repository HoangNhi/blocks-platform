import { AlertTriangle, ChevronDown, Clock3, DatabaseZap, RefreshCw } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Separator } from "@/components/ui/separator"

import type { TradeLabDatasetLocalFillAudit, TradeLabDatasetLocalFillAuditItem } from "../types"
import { formatDateTime } from "../utils"

type LocalFillAuditPanelProps = {
  audit: TradeLabDatasetLocalFillAudit | null
  isLoading?: boolean
  errorMessage?: string | null
  onRefresh?: () => void
}

export function LocalFillAuditPanel({
  audit,
  isLoading = false,
  errorMessage = null,
  onRefresh,
}: LocalFillAuditPanelProps) {
  const items = audit?.items ?? []

  return (
    <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
      <CardHeader className="space-y-3 border-b border-slate-200 bg-slate-50/80">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <DatabaseZap className="size-4 text-blue-600" aria-hidden="true" />
              Local fill audit
            </CardTitle>
            <p className="mt-1 text-xs text-slate-500">Local/dev fill attempts for the current dataset.</p>
          </div>
          {onRefresh ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={isLoading}
              aria-label="Refresh local fill audit"
            >
              <RefreshCw className={isLoading ? "mr-2 size-4 animate-spin" : "mr-2 size-4"} aria-hidden="true" />
              Refresh
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 p-4">
        {errorMessage ? (
          <div className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            <AlertTriangle className="mt-0.5 size-4" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        ) : null}

        {isLoading && !audit ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            Loading local fill audit...
          </div>
        ) : null}

        {!isLoading && !errorMessage && items.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            No local fill attempts for this dataset.
          </div>
        ) : null}

        {items.length > 0 ? (
          <section className="grid gap-2" aria-label="Local fill audit attempts">
            {items.map((item, index) => (
              <LocalFillAuditRow key={item.jobId || `${item.createdAt}-${index}`} item={item} />
            ))}
          </section>
        ) : null}
      </CardContent>
    </Card>
  )
}

function LocalFillAuditRow({ item }: { item: TradeLabDatasetLocalFillAuditItem }) {
  const tone = item.status === "failed" ? "bg-rose-600 hover:bg-rose-600" : item.status === "completed" ? "bg-emerald-600 hover:bg-emerald-600" : ""
  const happenedAt = item.finishedAt || item.createdAt
  const failureSummary = formatFailureSummary(item)

  return (
    <Collapsible>
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={tone} variant={tone ? "default" : "outline"}>
                {item.status}
              </Badge>
              <span className="font-medium text-slate-900">{item.rowsInserted} rows inserted</span>
            </div>
            <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
              <Clock3 className="size-3" aria-hidden="true" />
              {happenedAt ? formatDateTime(happenedAt) : "N/A"}
            </div>
            {failureSummary ? <p className="mt-1 text-xs font-medium text-rose-700">{failureSummary}</p> : null}
            {item.reasonCode ? <p className="mt-1 break-all text-xs text-slate-500">{item.reasonCode}</p> : null}
          </div>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="sm" aria-label={`Toggle local fill audit ${item.jobId}`}>
              <ChevronDown className="size-4" aria-hidden="true" />
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <Separator className="my-3" />
          <dl className="grid gap-2 text-xs text-slate-600">
            <Field label="Job ID" value={item.jobId} />
            <Field label="Preview ID" value={item.previewId ?? "N/A"} />
            <Field label="Request fingerprint" value={item.requestFingerprint ?? "N/A"} />
            <Field label="Provider status" value={item.providerStatus ?? "N/A"} />
            <Field label="Rows fetched" value={String(item.rowsFetched)} />
            <Field label="Rows skipped existing" value={String(item.rowsSkippedExisting)} />
            <Field label="Requested range" value={`${item.requestedRange.startAt ?? "N/A"} -> ${item.requestedRange.endAt ?? "N/A"}`} />
            <Field label="Applied range" value={`${item.appliedRange.startAt ?? "N/A"} -> ${item.appliedRange.endAt ?? "N/A"}`} />
            <Field label="Missing ranges" value={JSON.stringify(item.missingRanges)} />
            <Field label="Range results" value={JSON.stringify(item.rangeResults)} />
          </dl>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 rounded-md border border-slate-200 bg-white px-2 py-1">
      <dt className="font-medium text-slate-700">{label}</dt>
      <dd className="break-all text-slate-500">{value}</dd>
    </div>
  )
}

function formatFailureSummary(item: TradeLabDatasetLocalFillAuditItem) {
  if (item.status !== "failed") return null
  if (item.providerStatus === "429") return "Rate limited (429)"
  if (item.providerStatus === "timeout") return "Provider timeout"
  if (item.providerStatus === "network_unavailable") return "Provider unavailable"
  if (item.providerStatus === "empty_response") return "Empty provider response"
  if (item.providerStatus) return `Provider failure (${item.providerStatus})`
  return item.errorMessage ?? "Local fill failed"
}
