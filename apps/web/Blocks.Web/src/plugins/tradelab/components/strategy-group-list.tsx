import { useMemo, useState } from "react"
import { ChevronRight, DatabaseZap, Search } from "lucide-react"

import { StatusBadge } from "@/components/platform/status-badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

import type { TradeLabStrategyGroupSummary } from "../types"
import { filterStrategyGroupsForWorkbench, isBaselineStrategyGroup } from "../utils/strategy-group-visibility"

type StrategyGroupListProps = {
  groups: TradeLabStrategyGroupSummary[]
  selectedGroupId: string | null
  onSelectGroup: (groupId: string) => void
}

export function StrategyGroupList({
  groups,
  selectedGroupId,
  onSelectGroup,
}: StrategyGroupListProps) {
  const [query, setQuery] = useState("")
  const [showTestGroups, setShowTestGroups] = useState(false)
  const [showEmptyGroups, setShowEmptyGroups] = useState(false)
  const visibleGroups = useMemo(
    () => filterStrategyGroupsForWorkbench(groups, { query, showTestGroups, showEmptyGroups }),
    [groups, query, showEmptyGroups, showTestGroups],
  )

  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <Input
            type="search"
            role="searchbox"
            aria-label="Search strategy groups"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search groups"
            className="h-9 border-slate-200 bg-white pl-8 text-sm"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-platform-muted">
          <Checkbox
            checked={showTestGroups}
            onCheckedChange={(checked) => setShowTestGroups(checked === true)}
            aria-label="Show test groups"
          />
          <span>Show test groups</span>
        </label>
        <label className="flex items-center gap-2 text-xs text-platform-muted">
          <Checkbox
            checked={showEmptyGroups}
            onCheckedChange={(checked) => setShowEmptyGroups(checked === true)}
            aria-label="Show empty groups"
          />
          <span>Show empty groups</span>
        </label>
        <p className="text-xs text-platform-muted">
          {visibleGroups.length === 1 ? "1 visible group" : `${visibleGroups.length} visible groups`}
        </p>
      </div>

      {visibleGroups.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-600">
          <p className="font-medium text-slate-800">No strategy groups match this view.</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">
            Turn on Show test groups or Show empty groups if you are debugging local fixtures.
          </p>
        </div>
      ) : visibleGroups.map((group) => {
        const isSelected = group.id === selectedGroupId
        const isBaseline = isBaselineStrategyGroup(group)

        return (
          <Button
            key={group.id}
            type="button"
            variant="outline"
            className={cn(
              "h-auto justify-start border-platform-border bg-platform-surface px-3 py-3 text-left shadow-sm hover:bg-slate-50",
              isSelected && "border-blue-200 bg-blue-50/60",
            )}
            onClick={() => onSelectGroup(group.id)}
          >
            <div className="flex w-full items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[linear-gradient(135deg,#dbeafe,#bfdbfe)] text-blue-700">
                <DatabaseZap className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="truncate text-sm font-semibold text-platform-ink">
                    {group.name}
                  </strong>
                  {isBaseline ? <StatusBadge tone="info">Baseline</StatusBadge> : null}
                  <StatusBadge tone={group.activeStrategyCount > 0 ? "success" : "neutral"}>
                    {`${group.activeStrategyCount}/${group.strategyCount} active`}
                  </StatusBadge>
                </div>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-platform-muted">
                  {group.description || "No description available."}
                </p>
              </div>
              <ChevronRight
                className={cn(
                  "size-4 shrink-0 text-slate-400 transition-transform",
                  isSelected && "rotate-90 text-blue-600",
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
