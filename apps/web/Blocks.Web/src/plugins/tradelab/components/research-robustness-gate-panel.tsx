import { FlaskConical, ShieldCheck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import type { TradeLabResearchRobustnessGate, TradeLabRunAnalysis } from "../types"

type ResearchRobustnessGatePanelProps = {
  analysis: TradeLabRunAnalysis | null
  gate: TradeLabResearchRobustnessGate | null
  isCreating: boolean
  error: string | null
  onCreate: () => void
}

const gateLabels: Record<string, string> = {
  outOfSample: "Out-of-sample",
  feeSlippageStress: "Fee/slippage stress",
  drawdown: "Drawdown",
  tradeCount: "Trade count",
  parameterSensitivity: "Parameter sensitivity",
}

export function ResearchRobustnessGatePanel({ analysis, gate, isCreating, error, onCreate }: ResearchRobustnessGatePanelProps) {
  const canCreate = analysis?.run.status === "completed"

  return (
    <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
      <CardHeader className="space-y-3 border-b border-slate-200 bg-slate-50/80">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="size-4 text-cyan-700" aria-hidden="true" />
            Research robustness
          </CardTitle>
          <Button type="button" size="sm" onClick={onCreate} disabled={!canCreate || isCreating}>
            <ShieldCheck className="mr-2 size-4" aria-hidden="true" />
            Generate robustness evidence
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 p-4 text-sm">
        {!canCreate ? <p className="text-slate-600">Load a completed run to generate robustness evidence.</p> : null}
        {error ? <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-rose-700">{error}</p> : null}
        {gate ? (
          <div className="grid gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{gate.safetyStatus}</Badge>
              <Badge variant={gate.candidateLabel === "not_candidate" ? "destructive" : "secondary"}>{gate.candidateLabel}</Badge>
              <Badge variant="outline">{gate.liveReadinessStatus}</Badge>
            </div>
            <EvidenceRow label="Dataset" value={gate.datasetKey ?? "N/A"} />
            <div className="grid gap-2">
              {Object.entries(gate.gates).map(([key, item]) => (
                <div key={key} className="rounded-md border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-slate-900">{gateLabels[key] ?? key}</span>
                    <Badge variant={item.status === "fail" ? "destructive" : "outline"}>{item.status}</Badge>
                  </div>
                  <p className="mt-2 text-slate-600">{item.summary}</p>
                  <p className="mt-1 font-mono text-xs text-slate-500">{item.reasonCode}</p>
                </div>
              ))}
            </div>
            {gate.warnings.length ? (
              <div className="flex flex-wrap gap-2">
                {gate.warnings.map((warning) => (
                  <Badge key={warning} variant="outline">
                    {warning}
                  </Badge>
                ))}
              </div>
            ) : null}
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
