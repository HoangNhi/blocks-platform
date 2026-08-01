import { FlaskConical, PlayCircle } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import type { TradeLabBenchmarkCheck, TradeLabRunAnalysis } from "../types"

type BenchmarkRepeatabilityPanelProps = {
  analysis: TradeLabRunAnalysis | null
  check: TradeLabBenchmarkCheck | null
  isStarting?: boolean
  onStartRepeat: () => void
}

export function BenchmarkRepeatabilityPanel({
  analysis,
  check,
  isStarting = false,
  onStartRepeat,
}: BenchmarkRepeatabilityPanelProps) {
  const canRepeat = analysis?.run.status === "completed" && Boolean(analysis.datasetContext.datasetKey)
  return (
    <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
      <CardHeader className="space-y-3 border-b border-slate-200 bg-slate-50/80">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="size-4 text-blue-600" aria-hidden="true" />
            Benchmark repeatability
          </CardTitle>
          <Button type="button" size="sm" onClick={onStartRepeat} disabled={!canRepeat || isStarting}>
            <PlayCircle className="mr-2 size-4" aria-hidden="true" />
            Run benchmark repeat
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 p-4 text-sm">
        <EvidenceRow label="Dataset" value={analysis?.datasetContext.datasetKey ?? "N/A"} />
        <div className="flex items-center justify-between gap-3">
          <span className="text-slate-500">Status</span>
          <Badge variant={check?.status === "mismatched" || check?.status === "failed" ? "destructive" : "outline"}>
            {check?.status ?? "not run"}
          </Badge>
        </div>
        <EvidenceRow label="Input fingerprint" value={formatMatch(check?.inputMatch)} />
        <EvidenceRow label="Result fingerprint" value={formatMatch(check?.resultMatch)} />
        {check?.repeatRunId ? <EvidenceRow label="Repeat run" value={check.repeatRunId} /> : null}
        {check?.errorMessage ? (
          <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-rose-700">{check.errorMessage}</p>
        ) : null}
      </CardContent>
    </Card>
  )
}

function EvidenceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="break-all text-right font-medium text-slate-900">{value}</span>
    </div>
  )
}

function formatMatch(value: boolean | null | undefined) {
  if (value === true) return "match"
  if (value === false) return "mismatch"
  return "pending"
}
