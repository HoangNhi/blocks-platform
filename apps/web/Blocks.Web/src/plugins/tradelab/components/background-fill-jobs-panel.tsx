import { AlertTriangle, ChevronDown, Clock3, DatabaseZap, RefreshCw } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Separator } from "@/components/ui/separator"

import type { TradeLabDatasetFillJobVisibility, TradeLabDatasetFillJobVisibilityItem } from "../types"
import { formatDateTime } from "../utils"

type BackgroundFillJobsPanelProps = {
  visibility: TradeLabDatasetFillJobVisibility | null
  isLoading?: boolean
  errorMessage?: string | null
  onRefresh?: () => void
}

export function BackgroundFillJobsPanel({
  visibility,
  isLoading = false,
  errorMessage = null,
  onRefresh,
}: BackgroundFillJobsPanelProps) {
  const active = visibility?.active ?? []
  const recent = visibility?.recent ?? []
  const hasJobs = active.length > 0 || recent.length > 0

  return (
    <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
      <CardHeader className="space-y-3 border-b border-slate-200 bg-slate-50/80">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <DatabaseZap className="size-4 text-blue-600" aria-hidden="true" />
              Background fill jobs
            </CardTitle>
            <p className="mt-1 text-xs text-slate-500">Read-only fill job visibility for the current dataset.</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Badge variant="outline">Read-only</Badge>
            {active.length > 0 ? <Badge className="bg-blue-600 hover:bg-blue-600">{active.length} active</Badge> : null}
            {onRefresh ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onRefresh}
                disabled={isLoading}
                aria-label="Refresh background fill jobs"
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
            Loading background fill jobs...
          </div>
        ) : null}

        {!isLoading && !errorMessage && !hasJobs ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            No background fill jobs for this dataset.
          </div>
        ) : null}

        {active.length > 0 ? (
          <section className="grid gap-2" aria-label="Active background fill jobs">
            <SectionHeader label="Active jobs" count={active.length} />
            {active.map((item, index) => (
              <BackgroundFillJobRow key={item.jobId || `${item.createdAt}-${index}`} item={item} />
            ))}
          </section>
        ) : null}

        {recent.length > 0 ? (
          <>
            <Separator />
            <section className="grid gap-2" aria-label="Recent background fill jobs">
              <SectionHeader label="Recent jobs" count={recent.length} />
              {recent.map((item, index) => (
                <BackgroundFillJobRow key={item.jobId || `${item.createdAt}-${index}`} item={item} />
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

function BackgroundFillJobRow({ item }: { item: TradeLabDatasetFillJobVisibilityItem }) {
  const tone =
    item.status === "failed"
      ? "bg-rose-600 hover:bg-rose-600"
      : item.status === "completed"
        ? "bg-emerald-600 hover:bg-emerald-600"
        : item.status === "stale"
          ? "bg-amber-600 hover:bg-amber-600"
          : item.status === "running" || item.status === "queued"
            ? "bg-blue-600 hover:bg-blue-600"
            : ""
  const heartbeat = item.heartbeatAt ? formatDateTime(item.heartbeatAt) : "N/A"
  const reasonSummary = [
    item.reasonCode,
    item.providerStatus ? `providerStatus=${item.providerStatus}` : null,
  ].filter(Boolean)

  return (
    <Collapsible>
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={tone} variant={tone ? "default" : "outline"}>
                {item.status}
              </Badge>
              <span className="break-all font-medium text-slate-900">{item.datasetKey}</span>
            </div>
            <div className="mt-1 grid gap-1 text-xs text-slate-600">
              <span>
                {item.jobType} - {item.rowsInserted} rows inserted, {item.rowsImported} rows imported
              </span>
              <span>Attempt {item.attemptCount}</span>
              <span className="flex items-center gap-1">
                <Clock3 className="size-3" aria-hidden="true" />
                Heartbeat {heartbeat}
              </span>
              {reasonSummary.length > 0 ? <span className="break-all font-medium text-rose-700">{reasonSummary.join(" | ")}</span> : null}
            </div>
          </div>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="sm" aria-label={`Toggle background fill job ${item.jobId}`}>
              <ChevronDown className="size-4" aria-hidden="true" />
            </Button>
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <Separator className="my-3" />
          <dl className="grid gap-2 text-xs text-slate-600">
            <Field label="Job ID" value={item.jobId} />
            <Field label="Worker ID" value={item.workerId ?? "N/A"} />
            <Field label="Rows fetched" value={String(item.rowsFetched)} />
            <Field label="Rows skipped existing" value={String(item.rowsSkippedExisting)} />
            <Field label="Requested range" value={`${item.requestedRange.startAt ?? "N/A"} -> ${item.requestedRange.endAt ?? "N/A"}`} />
            <Field label="Applied range" value={`${item.appliedRange.startAt ?? "N/A"} -> ${item.appliedRange.endAt ?? "N/A"}`} />
            <Field label="Created" value={item.createdAt ? formatDateTime(item.createdAt) : "N/A"} />
            <Field label="Started" value={item.startedAt ? formatDateTime(item.startedAt) : "N/A"} />
            <Field label="Finished" value={item.finishedAt ? formatDateTime(item.finishedAt) : "N/A"} />
            <Field label="Metadata" value={JSON.stringify(item.metadata)} />
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
