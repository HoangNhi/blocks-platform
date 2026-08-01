import { AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

import type { OrderFeasibility, ResearchRangeGuidance, ResearchStatusLevel } from "../utils/research-run-readiness"

type RunReadinessPanelProps = {
  orderFeasibility: OrderFeasibility
  rangeGuidance: ResearchRangeGuidance
  runtimeSummary: string
}

function statusLabel(level: ResearchStatusLevel) {
  if (level === "blocked") return "Blocked"
  if (level === "warning") return "Warning"
  return "Ready"
}

function StatusIcon({ level }: { level: ResearchStatusLevel }) {
  if (level === "blocked") return <ShieldAlert className="size-4 text-rose-600" aria-hidden="true" />
  if (level === "warning") return <AlertTriangle className="size-4 text-amber-600" aria-hidden="true" />
  return <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
}

function formatNumber(value: number | null, digits = 6) {
  if (value === null || Number.isNaN(value)) return "Unknown"
  return value.toLocaleString(undefined, { maximumFractionDigits: digits })
}

export function RunReadinessPanel({ orderFeasibility, rangeGuidance, runtimeSummary }: RunReadinessPanelProps) {
  const level = orderFeasibility.level === "blocked"
    ? "blocked"
    : rangeGuidance.level === "warning" || orderFeasibility.level === "warning"
      ? "warning"
      : "ready"
  const messages = [...orderFeasibility.messages, ...rangeGuidance.messages]

  return (
    <section aria-label="Run readiness" className="grid gap-3 rounded-xl border border-platform-border bg-platform-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-platform-muted">Run readiness</p>
          <p className="mt-1 text-xs text-platform-muted">{runtimeSummary}</p>
        </div>
        <Badge variant={level === "blocked" ? "destructive" : "secondary"} className="gap-1">
          <StatusIcon level={level} />
          {statusLabel(level)}
        </Badge>
      </div>

      <div className="grid gap-2 text-sm">
        <div className="flex justify-between gap-3"><span className="text-platform-muted">Max order notional</span><strong>{formatNumber(orderFeasibility.maxOrderNotional, 2)}</strong></div>
        <div className="flex justify-between gap-3"><span className="text-platform-muted">Estimated qty</span><strong>{formatNumber(orderFeasibility.estimatedQuantity)}</strong></div>
        <div className="flex justify-between gap-3"><span className="text-platform-muted">Rounded qty</span><strong>{formatNumber(orderFeasibility.roundedQuantity)}</strong></div>
        <div className="flex justify-between gap-3"><span className="text-platform-muted">Rounded notional</span><strong>{formatNumber(orderFeasibility.roundedNotional, 2)}</strong></div>
      </div>

      <Separator />

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-platform-muted">Research range</span>
        <Badge variant="outline">{rangeGuidance.label}</Badge>
      </div>

      {messages.length > 0 ? (
        <Alert variant={level === "blocked" ? "destructive" : "default"}>
          <StatusIcon level={level} />
          <AlertTitle>{level === "blocked" ? "Fix before running" : "Review before running"}</AlertTitle>
          <AlertDescription className="grid gap-1">
            {messages.map((message) => <span key={message}>{message}</span>)}
          </AlertDescription>
        </Alert>
      ) : null}
    </section>
  )
}
