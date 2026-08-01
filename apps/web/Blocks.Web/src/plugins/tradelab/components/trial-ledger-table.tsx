import { useMemo, useState } from "react"
import { ExternalLink } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import type { ResearchDecision, ResearchPhase, ResearchTrial } from "../utils/research-session"
import { filterResearchTrials } from "../utils/research-session"
import { formatDateTime } from "../utils"

export type TrialLedgerTableProps = {
  trials: ResearchTrial[]
  onOpenRun: (runId: string) => void
  onDecision: (trialNumber: number, decision: ResearchDecision) => void
  onPromote: (trialNumber: number, phase: Exclude<ResearchPhase, "in_sample">) => void
  onLockOos: (trialNumber: number) => void
}

const phaseOptions: Array<ResearchPhase | "all"> = ["all", "in_sample", "validation", "oos", "stress"]
const decisionOptions: Array<ResearchDecision | "all"> = ["all", "unreviewed", "keep", "drop", "candidate"]

export function TrialLedgerTable({ trials, onOpenRun, onDecision, onPromote, onLockOos }: TrialLedgerTableProps) {
  const [phaseFilter, setPhaseFilter] = useState<ResearchPhase | "all">("all")
  const [decisionFilter, setDecisionFilter] = useState<ResearchDecision | "all">("all")
  const visibleTrials = useMemo(
    () => filterResearchTrials(trials, { phase: phaseFilter, decision: decisionFilter }),
    [decisionFilter, phaseFilter, trials],
  )

  return (
    <section className="grid gap-3" aria-label="Trial ledger">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Trial ledger</h3>
          <p className="text-xs text-slate-500">Every trial keeps phase, config, run ID, result, and decision.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="grid gap-1 text-xs text-slate-600">
            Phase filter
            <select
              aria-label="Phase filter"
              value={phaseFilter}
              onChange={(event) => setPhaseFilter(event.target.value as ResearchPhase | "all")}
              className="rounded-md border border-slate-200 bg-white px-2 py-1"
            >
              {phaseOptions.map((option) => <option key={option} value={option}>{formatLabel(option)}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-slate-600">
            Decision filter
            <select
              aria-label="Decision filter"
              value={decisionFilter}
              onChange={(event) => setDecisionFilter(event.target.value as ResearchDecision | "all")}
              className="rounded-md border border-slate-200 bg-white px-2 py-1"
            >
              {decisionOptions.map((option) => <option key={option} value={option}>{formatLabel(option)}</option>)}
            </select>
          </label>
        </div>
      </div>

      {visibleTrials.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
          No trials recorded.
        </div>
      ) : (
        <ScrollArea className="w-full rounded-md border border-slate-200">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Trial</TableHead>
                <TableHead>Phase</TableHead>
                <TableHead>Hypothesis</TableHead>
                <TableHead>Market</TableHead>
                <TableHead>Range</TableHead>
                <TableHead>Cost</TableHead>
                <TableHead>Config</TableHead>
                <TableHead>Run</TableHead>
                <TableHead>Metrics</TableHead>
                <TableHead>Decision</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleTrials.map((trial) => (
                <TableRow key={trial.id}>
                  <TableCell className="font-medium text-slate-900">Trial {trial.trialNumber}</TableCell>
                  <TableCell><Badge variant="outline">{formatLabel(trial.phase)}</Badge></TableCell>
                  <TableCell className="min-w-56 whitespace-normal text-slate-600">{trial.hypothesis}</TableCell>
                  <TableCell>{trial.runtime.symbol} / {trial.runtime.timeframe}</TableCell>
                  <TableCell className="text-xs text-slate-600">
                    {formatDateTime(trial.runtime.startAt)} to {formatDateTime(trial.runtime.endAt)}
                  </TableCell>
                  <TableCell className="text-xs text-slate-600">{trial.runtime.feeBps} / {trial.runtime.slippageBps} bps</TableCell>
                  <TableCell className="text-xs text-slate-600">{trial.strategyVersionLabel}<br />{trial.configHash}</TableCell>
                  <TableCell>
                    {trial.runId ? (
                      <Button type="button" variant="ghost" size="sm" aria-label={`Open run ${trial.runId}`} onClick={() => onOpenRun(trial.runId!)}>
                        <ExternalLink className="size-4" aria-hidden="true" />
                        {trial.runId}
                      </Button>
                    ) : "pending"}
                  </TableCell>
                  <TableCell className="text-xs text-slate-600">{formatMetrics(trial)}</TableCell>
                  <TableCell>
                    <div className="grid gap-1">
                      <Badge variant={trial.decision === "drop" ? "destructive" : "secondary"}>{trial.decision}</Badge>
                      {trial.decisionReason ? <span className="max-w-48 whitespace-normal text-xs text-slate-500">{trial.decisionReason}</span> : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Button type="button" variant="outline" size="sm" aria-label={`Keep trial ${trial.trialNumber}`} onClick={() => onDecision(trial.trialNumber, "keep")}>Keep</Button>
                      <Button type="button" variant="outline" size="sm" aria-label={`Drop trial ${trial.trialNumber}`} onClick={() => onDecision(trial.trialNumber, "drop")}>Drop</Button>
                      <Button type="button" variant="outline" size="sm" aria-label={`Promote trial ${trial.trialNumber} to validation`} onClick={() => onPromote(trial.trialNumber, "validation")}>Validate</Button>
                      <Button type="button" variant="outline" size="sm" aria-label={`Lock trial ${trial.trialNumber} for final OOS`} onClick={() => onLockOos(trial.trialNumber)}>OOS</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      )}
    </section>
  )
}

function formatLabel(value: string) {
  return value.replaceAll("_", " ")
}

function formatMetrics(trial: ResearchTrial) {
  if (!trial.result) return "No result"
  return [
    `return ${formatPct(trial.result.totalReturnPct)}`,
    `monthly ${formatPct(trial.result.monthlyReturnPct)}`,
    `dd ${formatPct(trial.result.maxDrawdownPct)}`,
    `pf ${trial.result.profitFactor ?? "N/A"}`,
    `${trial.result.tradeCount} trades`,
    `avg ${formatPct(trial.result.averageTradePct)}`,
  ].join(" | ")
}

function formatPct(value: number | null) {
  return value === null ? "N/A" : `${value}%`
}
