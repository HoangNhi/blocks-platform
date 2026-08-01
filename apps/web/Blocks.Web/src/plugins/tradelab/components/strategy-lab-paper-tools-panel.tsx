import * as React from "react"
import { CircleAlert, CircleCheck, CircleDashed, ShieldCheck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { TRADELAB_EXECUTION_MODE_OPTIONS } from "../execution-modes"
import {
  buildTradeLabPaperReadinessItems,
  getTradeLabPaperReadinessSummary,
  type TradeLabPaperReadinessStatus,
} from "../paper-readiness"
import type {
  TradeLabBotSummary,
  TradeLabCredentialBoundaryChecks,
  TradeLabCredentialBoundaryStatus,
  TradeLabStrategyVersion,
} from "../types"
import { formatDateTime } from "../utils"
import { CredentialBoundaryPanel } from "./credential-boundary-panel"

type StrategyLabPaperToolsProps = {
  currentVersion: TradeLabStrategyVersion
  isDraftDirty?: boolean
  isConfigDirty?: boolean
  paperDraftBot?: TradeLabBotSummary | null
  credentialBoundaryStatus: TradeLabCredentialBoundaryStatus
  credentialBoundaryChecks: TradeLabCredentialBoundaryChecks
  onCredentialBoundaryChecksChange: (checks: TradeLabCredentialBoundaryChecks) => void
  onSavePaperDraft: () => void
  isSavingPaperDraft?: boolean
  paperSessionContent: React.ReactNode
}

function PaperReadinessIcon({ status }: { status: TradeLabPaperReadinessStatus }) {
  if (status === "Ready") return <CircleCheck className="size-4 text-green-600" aria-hidden="true" />
  if (status === "Missing") return <CircleAlert className="size-4 text-amber-600" aria-hidden="true" />
  if (status === "Warning") return <CircleAlert className="size-4 text-sky-600" aria-hidden="true" />
  return <CircleDashed className="size-4 text-platform-muted" aria-hidden="true" />
}

export function StrategyLabPaperToolsPanel({
  currentVersion,
  isDraftDirty = false,
  isConfigDirty = false,
  paperDraftBot = null,
  credentialBoundaryStatus,
  credentialBoundaryChecks,
  onCredentialBoundaryChecksChange,
  onSavePaperDraft,
  isSavingPaperDraft = false,
  paperSessionContent,
}: StrategyLabPaperToolsProps) {
  const paperReadinessItems = buildTradeLabPaperReadinessItems({
    validationStatus: currentVersion.validationStatus,
    isDraftDirty,
    isConfigDirty,
    hasPaperDraft: Boolean(paperDraftBot),
    credentialBoundaryStatus,
  })
  const paperReadinessSummary = getTradeLabPaperReadinessSummary()

  return (
    <div className="grid gap-4">
      <section className="rounded-xl border border-platform-border bg-platform-surface p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-platform-muted">Execution mode</p>
          <Badge variant="secondary">Phase 4 Foundation</Badge>
        </div>
        <div className="mt-3 grid gap-2 text-xs text-platform-muted">
          {TRADELAB_EXECUTION_MODE_OPTIONS.map((option) => (
            <div key={option.mode} className="rounded-lg border border-platform-border bg-platform-surface-muted px-3 py-2">
              <strong className="block text-platform-ink">{option.label}</strong>
              <span>{option.description}</span>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Paper readiness" className="rounded-xl border border-platform-border bg-platform-surface p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-platform-muted">Paper readiness</p>
            <p className="mt-1 text-xs text-platform-muted">
              Paper remains locked; runtime safety contract is defined for future paper execution.
            </p>
            {paperDraftBot ? (
              <p className="mt-1 text-xs text-platform-muted">Draft saved {formatDateTime(paperDraftBot.createdAt)}</p>
            ) : null}
          </div>
          <Badge variant="secondary">{paperReadinessSummary}</Badge>
        </div>

        <div className="mt-3 grid gap-2">
          {paperReadinessItems.map((item) => (
            <div key={item.id} className="grid grid-cols-[auto_1fr_auto] items-start gap-2 rounded-lg border border-platform-border bg-platform-surface-muted px-3 py-2">
              <PaperReadinessIcon status={item.status} />
              <div>
                <p className="text-sm font-medium text-platform-ink">{item.label}</p>
                <p className="mt-0.5 text-xs text-platform-muted">{item.description}</p>
              </div>
              <span className={cn("rounded-full border px-2 py-1 text-[11px] font-semibold", item.status === "Ready" ? "border-green-200 bg-green-50 text-green-700" : "border-amber-200 bg-amber-50 text-amber-700")}>
                {item.status}
              </span>
            </div>
          ))}
        </div>
      </section>

      <CredentialBoundaryPanel checks={credentialBoundaryChecks} onChecksChange={onCredentialBoundaryChecksChange} />

      <Button type="button" variant="outline" className="justify-start" onClick={onSavePaperDraft} disabled={isSavingPaperDraft}>
        <ShieldCheck className="size-4" aria-hidden="true" />
        {isSavingPaperDraft ? "Saving paper draft..." : "Save paper draft"}
      </Button>

      {paperSessionContent}
    </div>
  )
}
