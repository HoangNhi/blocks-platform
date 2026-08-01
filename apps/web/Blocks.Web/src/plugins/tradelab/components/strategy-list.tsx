import { CircleDashed, Layers3 } from "lucide-react"

import { StatusBadge } from "@/components/platform/status-badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import type { TradeLabStrategySummary } from "../types"

type StrategyListProps = {
  strategies: TradeLabStrategySummary[]
  selectedStrategyId: string | null
  onSelectStrategy: (strategyId: string) => void
}

function statusTone(status: TradeLabStrategySummary["status"]) {
  if (status === "active") return "success" as const
  if (status === "paused") return "warning" as const
  if (status === "archived") return "neutral" as const
  return "neutral" as const
}

export function StrategyList({
  strategies,
  selectedStrategyId,
  onSelectStrategy,
}: StrategyListProps) {
  return (
    <div className="grid gap-2">
      {strategies.map((strategy) => {
        const isSelected = strategy.id === selectedStrategyId

        return (
          <Button
            key={strategy.id}
            type="button"
            variant="ghost"
            className={cn(
              "h-auto justify-start border border-transparent bg-platform-surface px-3 py-3 text-left hover:border-platform-border hover:bg-platform-surface-muted",
              isSelected && "border-blue-200 bg-blue-50/70",
            )}
            onClick={() => onSelectStrategy(strategy.id)}
          >
            <div className="flex w-full items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-700">
                <Layers3 className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="truncate text-sm font-semibold text-platform-ink">
                    {strategy.name}
                  </strong>
                  <StatusBadge tone={statusTone(strategy.status)}>{strategy.status}</StatusBadge>
                  <StatusBadge tone="info">{`${strategy.versionCount} versions`}</StatusBadge>
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-platform-muted">
                  {strategy.description || "No description available."}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                  <span>Current version {strategy.currentVersionId ?? "draft"}</span>
                  <span>•</span>
                  <span>Group {strategy.strategyGroupId}</span>
                </div>
                <div className="mt-1 text-[11px] text-slate-500">
                  {strategy.runtimeConfig.exchange} / {strategy.runtimeConfig.symbol} / {strategy.runtimeConfig.timeframe}
                </div>
              </div>
              <CircleDashed
                className={cn(
                  "size-4 shrink-0 text-slate-400",
                  isSelected && "text-blue-600",
                )}
                aria-hidden="true"
              />
            </div>
          </Button>
        )
      })}
    </div>
  )
}
