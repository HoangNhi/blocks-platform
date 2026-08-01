import { ClipboardCopy, FileText, ShieldAlert } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import type { TradeLabManualSignalPackage, TradeLabRunAnalysis } from "../types"

type ManualSignalHandoffPanelProps = {
  analysis: TradeLabRunAnalysis | null
  packageResult: TradeLabManualSignalPackage | null
  isCreating: boolean
  error: string | null
  onCreate: () => void
}

export function ManualSignalHandoffPanel({
  analysis,
  packageResult,
  isCreating,
  error,
  onCreate,
}: ManualSignalHandoffPanelProps) {
  const canCreate = analysis?.run.status === "completed"

  return (
    <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
      <CardHeader className="space-y-3 border-b border-slate-200 bg-slate-50/80">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="size-4 text-emerald-600" aria-hidden="true" />
            Signal handoff
          </CardTitle>
          <Button type="button" size="sm" onClick={onCreate} disabled={!canCreate || isCreating}>
            <ShieldAlert className="mr-2 size-4" aria-hidden="true" />
            Generate signal package
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 p-4 text-sm">
        {!canCreate ? <p className="text-slate-600">Load a completed run to create a manual signal package.</p> : null}
        {error ? <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-rose-700">{error}</p> : null}
        {packageResult ? (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{packageResult.safetyStatus}</Badge>
              <Badge variant="secondary">{packageResult.liveReadinessStatus}</Badge>
            </div>
            <EvidenceRow label="Market" value={`${packageResult.symbol} · ${packageResult.timeframe}`} />
            <EvidenceRow label="Dataset" value={packageResult.datasetKey ?? "N/A"} />
            <EvidenceRow label="Action" value={packageResult.action} />
            <EvidenceRow label="Entry" value={packageResult.entryRule} />
            <EvidenceRow label="Stop" value={packageResult.stopRule} />
            <EvidenceRow label="Exit" value={packageResult.exitRule} />
            <EvidenceRow label="Sizing" value={packageResult.positionSizingRule} />
            <div className="grid gap-2">
              <span className="text-slate-500">Warnings</span>
              <div className="flex flex-wrap gap-2">
                {packageResult.warnings.map((warning) => (
                  <Badge key={warning} variant="outline">
                    {warning}
                  </Badge>
                ))}
              </div>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => void navigator.clipboard?.writeText(packageResult.markdown)}>
              <ClipboardCopy className="mr-2 size-4" aria-hidden="true" />
              Copy package
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function EvidenceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[160px_minmax(0,1fr)]">
      <span className="text-slate-500">{label}</span>
      <span className="break-words font-medium text-slate-900">{value}</span>
    </div>
  )
}
