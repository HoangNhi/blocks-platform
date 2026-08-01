import type { TradeLabStrategyGroupSummary } from "../types"

type WorkbenchFilterOptions = {
  query: string
  showTestGroups: boolean
  showEmptyGroups?: boolean
}

function metadataText(group: TradeLabStrategyGroupSummary, key: string) {
  const value = group.metadata[key]
  return typeof value === "string" ? value.toLowerCase() : ""
}

function rankGroup(group: TradeLabStrategyGroupSummary) {
  if (isBaselineStrategyGroup(group)) return 0
  if (metadataText(group, "visibility") === "workbench") return 1
  if (isTestStrategyGroup(group)) return 3
  return 2
}

export function isTestStrategyGroup(group: TradeLabStrategyGroupSummary) {
  return metadataText(group, "visibility") === "test"
}

export function isBaselineStrategyGroup(group: TradeLabStrategyGroupSummary) {
  return group.metadata.isBaseline === true || metadataText(group, "purpose") === "baseline_smoke"
}

export function isEmptyStrategyGroup(group: TradeLabStrategyGroupSummary) {
  return group.strategyCount === 0 && group.activeStrategyCount === 0
}

export function sortStrategyGroupsForWorkbench(groups: TradeLabStrategyGroupSummary[]) {
  return [...groups].sort((left, right) => {
    const rankDelta = rankGroup(left) - rankGroup(right)
    if (rankDelta !== 0) return rankDelta
    return left.name.localeCompare(right.name)
  })
}

export function filterStrategyGroupsForWorkbench(
  groups: TradeLabStrategyGroupSummary[],
  options: WorkbenchFilterOptions,
) {
  const normalizedQuery = options.query.trim().toLowerCase()
  return sortStrategyGroupsForWorkbench(groups).filter((group) => {
    if (!options.showTestGroups && isTestStrategyGroup(group)) {
      return false
    }
    if (!normalizedQuery && !options.showEmptyGroups && isEmptyStrategyGroup(group) && !isBaselineStrategyGroup(group)) {
      return false
    }
    if (!normalizedQuery) {
      return true
    }
    const searchable = `${group.name} ${group.slug} ${group.description}`.toLowerCase()
    return searchable.includes(normalizedQuery)
  })
}

export function getDefaultWorkbenchGroupId(groups: TradeLabStrategyGroupSummary[]) {
  const sorted = sortStrategyGroupsForWorkbench(groups)
  return sorted.find((group) => !isTestStrategyGroup(group))?.id ?? sorted[0]?.id ?? null
}
