import { CalendarClock, GitBranch, LoaderCircle, ShieldCheck } from "lucide-react"

import { StatusBadge } from "@/components/platform/status-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

import type { TradeLabStrategyDetail, TradeLabStrategyVersion } from "../types"
import { formatDateTime } from "../utils"

type VersionRunPanelProps = {
  strategy: TradeLabStrategyDetail
  currentVersion: TradeLabStrategyVersion
  runVersion: TradeLabStrategyVersion | null
  actionMessage?: string | null
  runDisabledReason?: string | null
  isDraftDirty?: boolean
  isConfigDirty?: boolean
  onSaveSettings: () => void
  onCreateVersion: () => void
  onRunBacktest: () => void
  isSavingSettings?: boolean
  isSavingVersion?: boolean
  isRunning?: boolean
}

export function VersionRunPanel({
  strategy,
  currentVersion,
  runVersion,
  actionMessage,
  runDisabledReason,
  isDraftDirty = false,
  isConfigDirty = false,
  onSaveSettings,
  onCreateVersion,
  onRunBacktest,
  isSavingSettings = false,
  isSavingVersion = false,
  isRunning = false,
}: VersionRunPanelProps) {
  return (
    <div className="grid gap-3">
      <div className="rounded-xl border border-platform-border bg-platform-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-platform-muted">Version summary</p>
            <h3 className="mt-1 text-base font-semibold text-platform-ink">{strategy.name}</h3>
          </div>
          <StatusBadge tone={strategy.status === "active" ? "success" : "neutral"}>
            {strategy.status}
          </StatusBadge>
        </div>

        <div className="mt-4 grid gap-2 text-sm text-platform-muted">
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2"><GitBranch className="size-4" />Current version</span>
            <strong className="text-platform-ink">v{currentVersion.versionNumber}</strong>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2"><CalendarClock className="size-4" />Created at</span>
            <strong className="text-platform-ink">{formatDateTime(currentVersion.createdAt)}</strong>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2"><ShieldCheck className="size-4" />Validation</span>
            <strong className="text-platform-ink">{currentVersion.validationStatus}</strong>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2"><GitBranch className="size-4" />Run uses version</span>
            <strong className="text-platform-ink">
              {runVersion ? `v${runVersion.versionNumber} (${runVersion.id.slice(0, 8)})` : "N/A"}
            </strong>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {isDraftDirty ? <Badge variant="secondary">Draft has unversioned changes</Badge> : null}
        {isConfigDirty ? <Badge variant="secondary">Config has unsaved changes</Badge> : null}
      </div>

      {actionMessage ? (
        <div className="rounded-lg border border-platform-border bg-platform-surface-muted px-3 py-2 text-xs text-platform-muted">
          {actionMessage}
        </div>
      ) : null}

      {runDisabledReason ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {runDisabledReason}
        </div>
      ) : null}

      <div className="grid gap-2">
        <Button type="button" variant="outline" className="justify-start" onClick={onSaveSettings} disabled={isSavingSettings}>
          <ShieldCheck className="size-4" />
          {isSavingSettings ? "Saving setup..." : "Save setup"}
        </Button>
        <Button type="button" variant="outline" className="justify-start" onClick={onCreateVersion} disabled={isSavingVersion}>
          <GitBranch className="size-4" />
          {isSavingVersion ? "Creating version..." : "Create version"}
        </Button>
        <Button type="button" className="justify-start" onClick={onRunBacktest} disabled={Boolean(runDisabledReason) || isRunning}>
          <LoaderCircle className={isRunning ? "size-4 animate-spin" : "size-4"} />
          {isRunning ? "Running backtest..." : "Review & run backtest"}
        </Button>
      </div>
    </div>
  )
}
