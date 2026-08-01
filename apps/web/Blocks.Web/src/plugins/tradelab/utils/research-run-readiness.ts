import type {
  TradeLabBacktestExecution,
  TradeLabMetricSnapshot,
  TradeLabRunAnalysis,
  TradeLabRunHistoryEntry,
  TradeLabRiskConfig,
  TradeLabRuntimeConfig,
} from "../types"

export type ResearchStatusLevel = "ready" | "warning" | "blocked"

export type ResearchRuntimeLike = TradeLabRuntimeConfig
export type ResearchRiskLike = TradeLabRiskConfig

export type OrderFeasibility = {
  level: ResearchStatusLevel
  maxOrderNotional: number
  estimatedQuantity: number | null
  roundedQuantity: number | null
  roundedNotional: number | null
  messages: string[]
}

export type ResearchRangeGuidance = {
  level: ResearchStatusLevel
  dayCount: number
  label: "1 week smoke" | "1 month research" | "multi-month validation" | "final OOS holdout" | "custom"
  messages: string[]
}

export type ScorecardVerdict = {
  verdict: "Candidate" | "Needs validation" | "Failed"
  reasons: string[]
}

export type ResearchRunHistoryFilterOptions = {
  completedOnly: boolean
  hideFixtures: boolean
  currentConfigOnly: boolean
  currentRunIds: Set<string>
}

function roundDownToStep(value: number, stepSize: number) {
  if (!Number.isFinite(value) || !Number.isFinite(stepSize) || stepSize <= 0) return 0
  const precision = Math.max(0, Math.ceil(Math.abs(Math.log10(stepSize))) + 2)
  return Number((Math.floor(value / stepSize) * stepSize).toFixed(precision))
}

export function calculateOrderFeasibility(
  runtime: ResearchRuntimeLike,
  risk: ResearchRiskLike,
  representativePrice: number | null,
): OrderFeasibility {
  const maxOrderNotional = runtime.initialEquity * (risk.maxOrderPercent / 100)

  if (!representativePrice || representativePrice <= 0) {
    return {
      level: "warning",
      maxOrderNotional,
      estimatedQuantity: null,
      roundedQuantity: null,
      roundedNotional: null,
      messages: ["Representative price is unavailable; order feasibility cannot be fully checked before preflight."],
    }
  }

  const messages: string[] = []
  const estimatedQuantity = maxOrderNotional / representativePrice
  const roundedQuantity = roundDownToStep(estimatedQuantity, risk.stepSize)
  const roundedNotional = roundedQuantity * representativePrice

  if (roundedQuantity <= 0) {
    messages.push("Rounded quantity is zero. Increase max order size, lower step size, or choose a lower-priced symbol.")
  }
  if (roundedNotional > 0 && roundedNotional < risk.minNotional) {
    messages.push("Rounded notional is below minNotional. Increase capital, maxOrderPercent, or choose a lower-priced symbol.")
  }
  if (risk.maxOrderPercent >= 100) {
    messages.push("Max order uses 100% of capital; spot research can overstate fill quality.")
  }
  if (runtime.feeBps === 0 || runtime.slippageBps === 0) {
    messages.push("Fee or slippage is zero; research may overstate returns.")
  }

  const blocked = roundedQuantity <= 0 || roundedNotional < risk.minNotional

  return {
    level: blocked ? "blocked" : messages.length > 0 ? "warning" : "ready",
    maxOrderNotional,
    estimatedQuantity,
    roundedQuantity,
    roundedNotional,
    messages,
  }
}

export function buildResearchRangeGuidance(runtime: ResearchRuntimeLike): ResearchRangeGuidance {
  const start = Date.parse(runtime.startAt)
  const end = Date.parse(runtime.endAt)
  const dayCount = Number.isFinite(start) && Number.isFinite(end)
    ? Math.max(0, Math.round((end - start) / 86_400_000))
    : 0
  const messages: string[] = []
  let label: ResearchRangeGuidance["label"]

  if (dayCount <= 10) {
    label = "1 week smoke"
    messages.push("Range is useful for smoke testing, not monthly profit claims.")
  } else if (dayCount <= 45) {
    label = "1 month research"
    messages.push("Range can support initial research, then needs multi-month validation.")
  } else if (dayCount <= 180) {
    label = "multi-month validation"
    messages.push("Range is better for validating behavior across changing market conditions.")
  } else {
    label = "final OOS holdout"
    messages.push("Keep part of this range untouched for final out-of-sample review.")
  }

  return { level: dayCount < 30 ? "warning" : "ready", dayCount, label, messages }
}

export function getRunConfigFingerprint(input: ResearchRuntimeLike & ResearchRiskLike) {
  return [
    input.exchange,
    input.symbol,
    input.timeframe,
    input.startAt,
    input.endAt,
    input.initialEquity,
    input.feeBps,
    input.slippageBps,
    input.maxOrderPercent,
    input.maxPositionPercent,
    input.maxDrawdownPercent,
    input.minNotional,
    input.stepSize,
    input.tickSize,
  ].join("|")
}

export function isFixtureOrTestRun(run: TradeLabRunHistoryEntry) {
  const metadata = run.snapshot ? JSON.stringify(run.snapshot).toLowerCase() : ""
  const haystack = `${run.id} ${run.symbol} ${run.timeframe} ${run.errorMessage ?? ""} ${metadata}`.toLowerCase()
  return /(^|[^a-z0-9])(fixture|test-run|test_run|smoke)([^a-z0-9]|$)/.test(haystack)
}

export function filterResearchRunHistory(
  runs: TradeLabRunHistoryEntry[],
  options: ResearchRunHistoryFilterOptions,
) {
  return runs.filter((run) => {
    if (options.completedOnly && run.status !== "completed") return false
    if (options.hideFixtures && isFixtureOrTestRun(run)) return false
    if (options.currentConfigOnly && !options.currentRunIds.has(run.id)) return false
    return true
  })
}

function metricNumber(metrics: TradeLabMetricSnapshot | null | undefined, keys: string[]) {
  if (!metrics) return null
  const record = metrics as unknown as Record<string, unknown>
  for (const key of keys) {
    const value = record[key]
    if (typeof value === "number" && Number.isFinite(value)) return value
  }
  return null
}

export function buildResearchScorecard(input: {
  analysis: TradeLabRunAnalysis | null
  execution: TradeLabBacktestExecution | null
  targetMonthlyReturnPct?: number
}): ScorecardVerdict {
  const reasons: string[] = []
  const metrics = input.analysis?.result?.metrics ?? input.execution?.metrics ?? null
  const totalReturn = input.analysis?.result?.totalReturnPct ?? metricNumber(metrics, ["totalReturnPct", "totalReturnPercent", "returnPct"])
  const maxDrawdown = input.analysis?.result?.maxDrawdownPct ?? metricNumber(metrics, ["maxDrawdownPct", "maxDrawdownPercent"])
  const profitFactor = input.analysis?.result?.profitFactor ?? input.analysis?.tradeSummary.profitFactor ?? metricNumber(metrics, ["profitFactor"])
  const tradeCount = input.analysis?.tradeSummary.totalTrades ?? input.execution?.orders.length ?? 0

  if (!metrics && !input.analysis?.result) {
    return { verdict: "Needs validation", reasons: ["No analysis metrics are loaded for this run."] }
  }
  if (tradeCount < 10) reasons.push("Trade count is below 10; evidence is thin.")
  if (maxDrawdown !== null && maxDrawdown > 25) reasons.push("Max drawdown is above the 25% research gate.")
  if (totalReturn !== null && totalReturn <= 0) reasons.push("Total return is not positive.")
  if (profitFactor !== null && profitFactor < 1.2) reasons.push("Profit factor is below 1.2.")

  if (reasons.some((reason) => reason.includes("not positive") || reason.includes("drawdown"))) {
    return { verdict: "Failed", reasons }
  }
  if (reasons.length > 0) return { verdict: "Needs validation", reasons }
  return { verdict: "Candidate", reasons: ["Meets basic return, drawdown, profit factor, and trade count gates. Not live-ready."] }
}
