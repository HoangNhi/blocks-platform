import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { createBrowserTokenStore } from "@/features/auth/token-store"
import { ApiError } from "@/lib/api/api-error"
import { createApiClient } from "@/lib/api/client"

import { createTradeLabApi } from "./tradelab-api"
import {
  normalizeBacktestExecution,
  normalizeBenchmarkCheck,
  normalizeBotSummary,
  normalizeDatasetCoverageItem,
  normalizeDatasetFillEnqueueResult,
  normalizeDatasetFillJobVisibility,
  normalizeExecutionJournalEntry,
  normalizeExecutionJournalList,
  normalizeFillSchedulerStatus,
  normalizeManualSignalPackage,
  normalizeLiveOrderCancelResult,
  normalizeLiveOrderConfirmSubmitResult,
  normalizeLiveOrderDetail,
  normalizeLiveOrderList,
  normalizeLiveOrderJournalProjectionResult,
  normalizeLiveOrderPreviewResult,
  normalizeLiveOrderReconcileResult,
  normalizeResearchRobustnessGate,
  normalizePaperSchedulerStatus,
  normalizeDatasetLocalFillAudit,
  normalizeDatasetFillPreview,
  normalizeDatasetLocalFillResult,
  normalizePaperSessionDetail,
  normalizePaperSessionCancelLocal,
  normalizePaperKillSwitchStatus,
  normalizePaperSessionObservability,
  normalizePaperSessionPreview,
  normalizePaperSessionResumeLocal,
  normalizePaperSessionResumeReadiness,
  normalizePaperSessionRetryLocal,
  normalizePaperSessionRunLocal,
  normalizePaperSessionStart,
  normalizeTestnetOrderCancelResult,
  normalizeTestnetOrderConfirmSubmitResult,
  normalizeTestnetOrderDetail,
  normalizeTestnetOrderJournalProjectionResult,
  normalizeTestnetOrderList,
  normalizeTestnetOrderPreviewResult,
  normalizeTestnetOrderReconcileResult,
  normalizeRunAnalysis,
  normalizePreflightResult,
  normalizeRunChart,
  normalizeRunDetail,
  normalizeRunHistoryEntry,
  normalizeRunPipeline,
  normalizeSelectedTradeExecutionDetail,
  normalizeStrategyJobVisibility,
  normalizeStrategyDetail,
  normalizeStrategyGroupSummary,
  normalizeStrategySummary,
  normalizeStrategyValidationCheck,
} from "./tradelab-normalizers"
import {
  DEFAULT_CREDENTIAL_BOUNDARY_CHECKS,
  buildCredentialBoundaryMetadata,
  normalizeCredentialBoundaryFromBot,
} from "../credential-boundary"
import {
  getDefaultWorkbenchGroupId,
  sortStrategyGroupsForWorkbench,
} from "../utils/strategy-group-visibility"
import type {
  TradeLabBacktestExecution,
  TradeLabBenchmarkCheck,
  TradeLabBotSummary,
  TradeLabCompareConfigDiff,
  TradeLabCompareFieldDiff,
  TradeLabCompareMetricDiff,
  TradeLabCompareModeState,
  TradeLabCompareTradeSummaryDiff,
  TradeLabCredentialBoundaryChecks,
  TradeLabDatasetCoverageItem,
  TradeLabDatasetFillPreview,
  TradeLabDatasetFillEnqueueLocalResult,
  TradeLabDatasetFillJobVisibility,
  TradeLabExecutionJournalEntry,
  TradeLabExecutionJournalEntryRequest,
  TradeLabExecutionJournalList,
  TradeLabFillSchedulerStatus,
  TradeLabDatasetLocalFillAudit,
  TradeLabDatasetLocalFillResult,
  TradeLabManualSignalPackage,
  TradeLabLiveOrderDetail,
  TradeLabLiveOrderJournalProjectionResult,
  TradeLabLiveOrderList,
  TradeLabLiveOrderOperationResult,
  TradeLabLiveOrderPreviewResult,
  TradeLabResearchRobustnessGate,
  TradeLabPaperSchedulerStatus,
  TradeLabPaperSessionPreview,
  TradeLabPaperKillSwitchStatus,
  TradeLabPaperSessionObservability,
  TradeLabPaperSessionDetail,
  TradeLabPaperSessionCancelLocalResult,
  TradeLabPaperSessionResumeLocalResult,
  TradeLabPaperSessionResumeReadiness,
  TradeLabPaperSessionRetryLocalResult,
  TradeLabPaperSessionRunLocalResult,
  TradeLabPaperSessionStartResult,
  TradeLabPaperSessionSetupReason,
  TradeLabTestnetOrderDetail,
  TradeLabTestnetOrderJournalProjectionResult,
  TradeLabTestnetOrderList,
  TradeLabTestnetOrderOperationResult,
  TradeLabTestnetOrderPreviewResult,
  TradeLabRunAnalysis,
  TradeLabPreflightResult,
  TradeLabRiskConfig,
  TradeLabRunChart,
  TradeLabRunHistoryEntry,
  TradeLabRunPipeline,
  TradeLabStrategyJobVisibility,
  TradeLabTradeDetail,
  TradeLabSelectedTradeExecutionDetail,
  TradeLabRuntimeConfig,
  TradeLabStrategyDetail,
  TradeLabStrategyGroupSummary,
  TradeLabStrategyValidationCheck,
  TradeLabStrategySummary,
  TradeLabRunStatus,
} from "../types"

const tokenStore = createBrowserTokenStore()
const tradeLabApi = createTradeLabApi(
  createApiClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? "/",
    getAccessToken: tokenStore.getAccessToken,
  }),
)

function createEmptyRuntimeConfig(): TradeLabRuntimeConfig {
  return {
    exchange: "binance",
    symbol: "BTCUSDT",
    timeframe: "1h",
    startAt: "",
    endAt: "",
    initialEquity: 1000,
    feeBps: 0,
    slippageBps: 0,
  }
}

function createEmptyRiskConfig(): TradeLabRiskConfig {
  return {
    maxOrderPercent: 0,
    maxPositionPercent: 0,
    maxDrawdownPercent: 0,
    minNotional: 0,
    stepSize: 0,
    tickSize: 0,
  }
}

function formatDatasetLocalFillError(error: unknown) {
  if (!(error instanceof ApiError)) {
    return "Local dataset fill failed."
  }

  const detail = error.data && typeof error.data === "object" ? (error.data as Record<string, unknown>) : {}
  const reasonCode = typeof detail.reasonCode === "string" ? detail.reasonCode : null
  const providerStatus = typeof detail.providerStatus === "string" ? detail.providerStatus : null
  if (reasonCode && providerStatus) {
    return `${error.message} (${reasonCode}, providerStatus=${providerStatus})`
  }
  if (reasonCode) {
    return `${error.message} (${reasonCode})`
  }
  return error.message
}

function formatDatasetFillEnqueueError(error: unknown) {
  if (!(error instanceof ApiError)) {
    return "Background fill enqueue failed."
  }

  const detail = error.data && typeof error.data === "object" ? (error.data as Record<string, unknown>) : {}
  const reasonCode = typeof detail.reasonCode === "string" ? detail.reasonCode : null
  return reasonCode ? `${error.message} (${reasonCode})` : error.message
}

function formatPaperSessionPreviewError(error: unknown) {
  if (!(error instanceof ApiError)) {
    return "Paper session preview failed."
  }

  const detail = error.data && typeof error.data === "object" ? (error.data as Record<string, unknown>) : {}
  const reasonCode = typeof detail.reasonCode === "string" ? detail.reasonCode : null
  return reasonCode ? `${error.message} (${reasonCode})` : error.message
}

function formatPaperSessionStartError(error: unknown) {
  if (!(error instanceof ApiError)) {
    return "Paper session start failed."
  }

  const detail = error.data && typeof error.data === "object" ? (error.data as Record<string, unknown>) : {}
  const reasonCode = typeof detail.reasonCode === "string" ? detail.reasonCode : null
  return reasonCode ? `${error.message} (${reasonCode})` : error.message
}

function formatTestnetOrderPreviewError(error: unknown) {
  if (!(error instanceof ApiError)) {
    return "Assisted testnet order preview failed."
  }

  const detail = error.data && typeof error.data === "object" ? (error.data as Record<string, unknown>) : {}
  const reasonCode = typeof detail.reasonCode === "string" ? detail.reasonCode : null
  return reasonCode ? `${error.message} (${reasonCode})` : error.message
}

function formatTestnetOrderReadError(error: unknown) {
  if (!(error instanceof ApiError)) {
    return "Unable to load assisted testnet order evidence."
  }

  const detail = error.data && typeof error.data === "object" ? (error.data as Record<string, unknown>) : {}
  const reasonCode = typeof detail.reasonCode === "string" ? detail.reasonCode : null
  return reasonCode ? `${error.message} (${reasonCode})` : error.message
}

function formatLiveOrderPreviewError(error: unknown) {
  if (!(error instanceof ApiError)) {
    return "Assisted live order preview failed."
  }

  const detail = error.data && typeof error.data === "object" ? (error.data as Record<string, unknown>) : {}
  const reasonCode = typeof detail.reasonCode === "string" ? detail.reasonCode : null
  return reasonCode ? `${error.message} (${reasonCode})` : error.message
}

function formatLiveOrderReadError(error: unknown) {
  if (!(error instanceof ApiError)) {
    return "Unable to load assisted live order evidence."
  }

  const detail = error.data && typeof error.data === "object" ? (error.data as Record<string, unknown>) : {}
  const reasonCode = typeof detail.reasonCode === "string" ? detail.reasonCode : null
  return reasonCode ? `${error.message} (${reasonCode})` : error.message
}

function formatPaperSessionDetailError(error: unknown) {
  if (!(error instanceof ApiError)) {
    return "Paper session detail failed."
  }

  const detail = error.data && typeof error.data === "object" ? (error.data as Record<string, unknown>) : {}
  const reasonCode = typeof detail.reasonCode === "string" ? detail.reasonCode : null
  return reasonCode ? `${error.message} (${reasonCode})` : error.message
}

function formatPaperSessionRunLocalError(error: unknown) {
  if (!(error instanceof ApiError)) {
    return "Local paper run failed."
  }

  const detail = error.data && typeof error.data === "object" ? (error.data as Record<string, unknown>) : {}
  const reasonCode = typeof detail.reasonCode === "string" ? detail.reasonCode : null
  return reasonCode ? `${error.message} (${reasonCode})` : error.message
}

function formatPaperSessionCancelLocalError(error: unknown) {
  if (!(error instanceof ApiError)) {
    return "Local paper cancel failed."
  }

  const detail = error.data && typeof error.data === "object" ? (error.data as Record<string, unknown>) : {}
  const reasonCode = typeof detail.reasonCode === "string" ? detail.reasonCode : null
  return reasonCode ? `${error.message} (${reasonCode})` : error.message
}

function formatPaperSessionRetryLocalError(error: unknown) {
  if (!(error instanceof ApiError)) {
    return "Local paper retry failed."
  }

  const detail = error.data && typeof error.data === "object" ? (error.data as Record<string, unknown>) : {}
  const reasonCode = typeof detail.reasonCode === "string" ? detail.reasonCode : null
  return reasonCode ? `${error.message} (${reasonCode})` : error.message
}

function formatPaperSessionResumeReadinessError(error: unknown) {
  if (!(error instanceof ApiError)) {
    return error instanceof Error ? error.message : "Paper session resume readiness failed."
  }

  const detail = error.data && typeof error.data === "object" ? (error.data as Record<string, unknown>) : {}
  const reasonCode = typeof detail.reasonCode === "string" ? detail.reasonCode : null
  return reasonCode ? `${error.message} (${reasonCode})` : error.message
}

function formatPaperSessionResumeLocalError(error: unknown) {
  if (!(error instanceof ApiError)) {
    return "Local paper resume failed."
  }

  const detail = error.data && typeof error.data === "object" ? (error.data as Record<string, unknown>) : {}
  const reasonCode = typeof detail.reasonCode === "string" ? detail.reasonCode : null
  return reasonCode ? error.message + " (" + reasonCode + ")" : error.message
}

function formatPaperSessionResumeLocalDisabledReason(detail: TradeLabPaperSessionDetail) {
  switch (detail.session.status) {
    case "queued":
      return "Queued paper sessions can run locally; they do not need resume."
    case "running":
      return "Running paper sessions cannot be resumed."
    case "cancel_requested":
      return "Cancel is still being requested. Wait for the session to reach cancelled."
    case "completed":
      return "Completed paper sessions cannot be resumed."
    case "failed":
      return "Failed paper sessions should use Retry local, not Resume local."
    case "blocked":
      return "Blocked paper sessions should use Retry local, not Resume local."
    default:
      return "Only cancelled paper sessions can resume locally."
  }
}

function sortStrategies(strategies: TradeLabStrategySummary[]) {
  return [...strategies].sort((left, right) => left.name.localeCompare(right.name))
}

function hasTerminalStatus(status: TradeLabRunStatus | string) {
  return status === "completed" || status === "failed" || status === "cancelled"
}

function formatPaperSessionRunLocalDisabledReason(detail: TradeLabPaperSessionDetail) {
  const reason = detail.session.reasonCode ? ` Reason: ${detail.session.reasonCode}.` : ""
  return `This paper session is ${detail.session.status} and cannot run locally.${reason}`
}

function formatPaperSessionCancelLocalDisabledReason(detail: TradeLabPaperSessionDetail) {
  const reason = detail.session.reasonCode ? ` Reason: ${detail.session.reasonCode}.` : ""
  return `This paper session is ${detail.session.status} and cannot be cancelled locally.${reason}`
}

function isPaperSessionRetryableStatus(status: string | null | undefined) {
  return status === "failed" || status === "blocked" || status === "cancelled"
}

function formatPaperSessionRetryLocalDisabledReason(detail: TradeLabPaperSessionDetail) {
  const reason = detail.session.reasonCode ? ` Reason: ${detail.session.reasonCode}.` : ""
  return `This paper session is ${detail.session.status} and cannot be retried locally.${reason}`
}

function stringifiedValue(value: unknown) {
  if (value === null || value === undefined) {
    return ""
  }
  if (typeof value === "string") {
    return value
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }
  if (Array.isArray(value) || typeof value === "object") {
    return JSON.stringify(value)
  }
  return String(value)
}

function makeFieldDiff(key: string, label: string, baseValue: unknown, compareValue: unknown): TradeLabCompareFieldDiff {
  const base = stringifiedValue(baseValue)
  const compare = stringifiedValue(compareValue)
  return {
    key,
    label,
    baseValue: base,
    compareValue: compare,
    isMatch: base === compare,
  }
}

function makeMetricDiff(
  key: string,
  label: string,
  baseValue: number | null,
  compareValue: number | null,
  format: TradeLabCompareMetricDiff["format"],
): TradeLabCompareMetricDiff {
  const delta =
    baseValue !== null && compareValue !== null ? compareValue - baseValue : null
  return {
    key,
    label,
    baseValue,
    compareValue,
    delta,
    format,
  }
}

function makeTradeSummaryDiff(
  key: string,
  label: string,
  baseValue: number | null,
  compareValue: number | null,
  format: TradeLabCompareTradeSummaryDiff["format"],
): TradeLabCompareTradeSummaryDiff {
  const delta =
    baseValue !== null && compareValue !== null ? compareValue - baseValue : null
  return {
    key,
    label,
    baseValue,
    compareValue,
    delta,
    format,
  }
}

function buildCompareMetricDiffs(baseAnalysis: TradeLabRunAnalysis, compareAnalysis: TradeLabRunAnalysis) {
  const baseMetrics = baseAnalysis.result?.metrics
  const compareMetrics = compareAnalysis.result?.metrics
  return [
    makeMetricDiff("initialEquity", "Initial equity", baseMetrics?.initialEquity ?? null, compareMetrics?.initialEquity ?? null, "currency"),
    makeMetricDiff("finalEquity", "Final equity", baseMetrics?.finalEquity ?? null, compareMetrics?.finalEquity ?? null, "currency"),
    makeMetricDiff("totalReturnPct", "Total return", baseMetrics?.totalReturnPct ?? null, compareMetrics?.totalReturnPct ?? null, "percent"),
    makeMetricDiff("maxDrawdownPct", "Max drawdown", baseMetrics?.maxDrawdownPct ?? null, compareMetrics?.maxDrawdownPct ?? null, "percent"),
    makeMetricDiff("profitFactor", "Profit factor", baseMetrics?.profitFactor ?? null, compareMetrics?.profitFactor ?? null, "number"),
    makeMetricDiff("winRatePct", "Win rate", baseMetrics?.winRatePct ?? null, compareMetrics?.winRatePct ?? null, "percent"),
    makeMetricDiff("totalTrades", "Total trades", baseMetrics?.totalTrades ?? null, compareMetrics?.totalTrades ?? null, "number"),
    makeMetricDiff("closedTrades", "Closed trades", baseMetrics?.closedTrades ?? null, compareMetrics?.closedTrades ?? null, "number"),
  ]
}

function buildCompareTradeSummaryDiffs(baseAnalysis: TradeLabRunAnalysis, compareAnalysis: TradeLabRunAnalysis) {
  const baseSummary = baseAnalysis.tradeSummary
  const compareSummary = compareAnalysis.tradeSummary
  return [
    makeTradeSummaryDiff("totalTrades", "Total trades", baseSummary.totalTrades, compareSummary.totalTrades, "number"),
    makeTradeSummaryDiff("closedTrades", "Closed trades", baseSummary.closedTrades, compareSummary.closedTrades, "number"),
    makeTradeSummaryDiff("openTrades", "Open trades", baseSummary.openTrades, compareSummary.openTrades, "number"),
    makeTradeSummaryDiff("winningTrades", "Winning trades", baseSummary.winningTrades, compareSummary.winningTrades, "number"),
    makeTradeSummaryDiff("losingTrades", "Losing trades", baseSummary.losingTrades, compareSummary.losingTrades, "number"),
    makeTradeSummaryDiff("breakEvenTrades", "Break-even trades", baseSummary.breakEvenTrades, compareSummary.breakEvenTrades, "number"),
    makeTradeSummaryDiff("realizedPnl", "Realized PnL", baseSummary.realizedPnl, compareSummary.realizedPnl, "currency"),
    makeTradeSummaryDiff("averagePnl", "Average PnL", baseSummary.averagePnl, compareSummary.averagePnl, "currency"),
    makeTradeSummaryDiff("averagePnlPct", "Average PnL %", baseSummary.averagePnlPct, compareSummary.averagePnlPct, "percent"),
    makeTradeSummaryDiff("averageDurationSeconds", "Average duration", baseSummary.averageDurationSeconds, compareSummary.averageDurationSeconds, "number"),
    makeTradeSummaryDiff("winRatePct", "Win rate", baseSummary.winRatePct, compareSummary.winRatePct, "percent"),
    makeTradeSummaryDiff("profitFactor", "Profit factor", baseSummary.profitFactor, compareSummary.profitFactor, "number"),
  ]
}

function buildCompareConfigDiff(baseAnalysis: TradeLabRunAnalysis, compareAnalysis: TradeLabRunAnalysis): TradeLabCompareConfigDiff {
  const baseDataset = baseAnalysis.datasetContext
  const compareDataset = compareAnalysis.datasetContext
  const baseRuntime = baseAnalysis.runtimeConfig
  const compareRuntime = compareAnalysis.runtimeConfig
  const baseRisk = baseAnalysis.riskConfig
  const compareRisk = compareAnalysis.riskConfig
  const baseSnapshot = baseAnalysis.snapshot.sourceSnapshot as Record<string, unknown>
  const compareSnapshot = compareAnalysis.snapshot.sourceSnapshot as Record<string, unknown>

  return {
    sourceHash: makeFieldDiff("sourceHash", "Source hash", baseDataset.sourceHash ?? "", compareDataset.sourceHash ?? ""),
    strategyVersion: makeFieldDiff(
      "strategyVersionId",
      "Strategy version",
      baseDataset.strategyVersionId ?? "",
      compareDataset.strategyVersionId ?? "",
    ),
    runtimeConfigDiffs: [
      makeFieldDiff("exchange", "Exchange", baseRuntime.exchange, compareRuntime.exchange),
      makeFieldDiff("symbol", "Symbol", baseRuntime.symbol, compareRuntime.symbol),
      makeFieldDiff("timeframe", "Timeframe", baseRuntime.timeframe, compareRuntime.timeframe),
      makeFieldDiff("startAt", "Start at", baseRuntime.startAt, compareRuntime.startAt),
      makeFieldDiff("endAt", "End at", baseRuntime.endAt, compareRuntime.endAt),
      makeFieldDiff("initialEquity", "Initial equity", baseRuntime.initialEquity, compareRuntime.initialEquity),
      makeFieldDiff("feeBps", "Fee bps", baseRuntime.feeBps, compareRuntime.feeBps),
      makeFieldDiff("slippageBps", "Slippage bps", baseRuntime.slippageBps, compareRuntime.slippageBps),
    ],
    riskConfigDiffs: [
      makeFieldDiff("maxOrderPercent", "Max order %", baseRisk.maxOrderPercent, compareRisk.maxOrderPercent),
      makeFieldDiff("maxPositionPercent", "Max position %", baseRisk.maxPositionPercent, compareRisk.maxPositionPercent),
      makeFieldDiff("maxDrawdownPercent", "Max drawdown %", baseRisk.maxDrawdownPercent, compareRisk.maxDrawdownPercent),
      makeFieldDiff("minNotional", "Min notional", baseRisk.minNotional, compareRisk.minNotional),
      makeFieldDiff("stepSize", "Step size", baseRisk.stepSize, compareRisk.stepSize),
      makeFieldDiff("tickSize", "Tick size", baseRisk.tickSize, compareRisk.tickSize),
    ],
    datasetContextDiffs: [
      makeFieldDiff("datasetKey", "Dataset key", baseDataset.datasetKey, compareDataset.datasetKey),
      makeFieldDiff("exchange", "Exchange", baseDataset.exchange, compareDataset.exchange),
      makeFieldDiff("symbol", "Symbol", baseDataset.symbol, compareDataset.symbol),
      makeFieldDiff("timeframe", "Timeframe", baseDataset.timeframe, compareDataset.timeframe),
      makeFieldDiff("requestedStartAt", "Requested start", baseDataset.requestedStartAt ?? "", compareDataset.requestedStartAt ?? ""),
      makeFieldDiff("requestedEndAt", "Requested end", baseDataset.requestedEndAt ?? "", compareDataset.requestedEndAt ?? ""),
      makeFieldDiff("strategyVersionId", "Strategy version", baseDataset.strategyVersionId ?? "", compareDataset.strategyVersionId ?? ""),
    ],
    baseSourceCode: stringifiedValue(baseSnapshot.sourceCode),
    compareSourceCode: stringifiedValue(compareSnapshot.sourceCode),
  }
}

function buildDatasetMismatchWarning(baseAnalysis: TradeLabRunAnalysis, compareAnalysis: TradeLabRunAnalysis) {
  const base = baseAnalysis.datasetContext
  const compare = compareAnalysis.datasetContext
  const different =
    base.symbol !== compare.symbol ||
    base.timeframe !== compare.timeframe ||
    base.requestedStartAt !== compare.requestedStartAt ||
    base.requestedEndAt !== compare.requestedEndAt
  if (!different) {
    return null
  }
  return "Dataset mismatch: symbol, timeframe, or date range differs between the two runs."
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(",")}}`
  }
  return JSON.stringify(value)
}

function evaluatePaperSessionPreviewSetup(
  paperDraftBot: TradeLabBotSummary | null,
  runtimeConfig: TradeLabRuntimeConfig,
): TradeLabPaperSessionSetupReason | null {
  if (!paperDraftBot) {
    return {
      code: "paper_draft_required",
      message: "Save a paper draft before previewing paper session readiness.",
    }
  }
  if (!runtimeConfig.symbol.trim()) {
    return {
      code: "paper_symbol_required",
      message: "Choose symbol, timeframe, start, and end before previewing paper session readiness.",
    }
  }
  if (!runtimeConfig.timeframe.trim()) {
    return {
      code: "paper_timeframe_required",
      message: "Choose symbol, timeframe, start, and end before previewing paper session readiness.",
    }
  }
  if (!runtimeConfig.startAt.trim() || !runtimeConfig.endAt.trim()) {
    return {
      code: "paper_range_required",
      message: "Choose symbol, timeframe, start, and end before previewing paper session readiness.",
    }
  }

  const start = Date.parse(runtimeConfig.startAt)
  const end = Date.parse(runtimeConfig.endAt)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return {
      code: "paper_range_invalid",
      message: "Paper session range must end after it starts.",
    }
  }

  return null
}

export function useTradeLabWorkspace() {
  const [groups, setGroups] = useState<TradeLabStrategyGroupSummary[]>([])
  const [strategies, setStrategies] = useState<TradeLabStrategySummary[]>([])
  const [bots, setBots] = useState<TradeLabBotSummary[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [selectedStrategyId, setSelectedStrategyId] = useState<string | null>(null)
  const [selectedStrategy, setSelectedStrategy] = useState<TradeLabStrategyDetail | null>(null)
  const [viewedStrategyVersionId, setViewedStrategyVersionId] = useState<string | null>(null)
  const [execution, setExecution] = useState<TradeLabBacktestExecution | null>(null)
  const [chartData, setChartData] = useState<TradeLabRunChart | null>(null)
  const [selectedTrade, setSelectedTrade] = useState<TradeLabTradeDetail | null>(null)
  const [runAnalysis, setRunAnalysis] = useState<TradeLabRunAnalysis | null>(null)
  const [benchmarkCheck, setBenchmarkCheck] = useState<TradeLabBenchmarkCheck | null>(null)
  const [manualSignalPackage, setManualSignalPackage] = useState<TradeLabManualSignalPackage | null>(null)
  const [manualSignalPackageError, setManualSignalPackageError] = useState<string | null>(null)
  const [isCreatingManualSignalPackage, setIsCreatingManualSignalPackage] = useState(false)
  const [researchRobustnessGate, setResearchRobustnessGate] = useState<TradeLabResearchRobustnessGate | null>(null)
  const [researchRobustnessGateError, setResearchRobustnessGateError] = useState<string | null>(null)
  const [isCreatingResearchRobustnessGate, setIsCreatingResearchRobustnessGate] = useState(false)
  const [executionJournal, setExecutionJournal] = useState<TradeLabExecutionJournalList | null>(null)
  const [executionJournalError, setExecutionJournalError] = useState<string | null>(null)
  const [isExecutionJournalLoading, setIsExecutionJournalLoading] = useState(false)
  const [isSavingExecutionJournalEntry, setIsSavingExecutionJournalEntry] = useState(false)
  const [selectedAnalyzedTradeId, setSelectedAnalyzedTradeId] = useState<string | null>(null)
  const [selectedTradeExecutionDetail, setSelectedTradeExecutionDetail] = useState<TradeLabSelectedTradeExecutionDetail | null>(null)
  const [runHistory, setRunHistory] = useState<TradeLabRunHistoryEntry[]>([])
  const [latestCurrentRunId, setLatestCurrentRunId] = useState<string | null>(null)
  const [activePipeline, setActivePipeline] = useState<TradeLabRunPipeline | null>(null)
  const [jobVisibility, setJobVisibility] = useState<TradeLabStrategyJobVisibility | null>(null)
  const [jobVisibilityError, setJobVisibilityError] = useState<string | null>(null)
  const [datasetCoverage, setDatasetCoverage] = useState<TradeLabDatasetCoverageItem[]>([])
  const [datasetCoverageError, setDatasetCoverageError] = useState<string | null>(null)
  const [isDatasetCoverageLoading, setIsDatasetCoverageLoading] = useState(false)
  const [datasetFillPreview, setDatasetFillPreview] = useState<TradeLabDatasetFillPreview | null>(null)
  const [datasetFillPreviewError, setDatasetFillPreviewError] = useState<string | null>(null)
  const [paperSessionPreview, setPaperSessionPreview] = useState<TradeLabPaperSessionPreview | null>(null)
  const [paperSessionPreviewError, setPaperSessionPreviewError] = useState<string | null>(null)
  const [isPaperSessionPreviewLoading, setIsPaperSessionPreviewLoading] = useState(false)
  const [paperSessionDetailInput, setPaperSessionDetailInputState] = useState("")
  const [loadedPaperSessionDetailInput, setLoadedPaperSessionDetailInput] = useState<string | null>(null)
  const [paperSessionDetail, setPaperSessionDetail] = useState<TradeLabPaperSessionDetail | null>(null)
  const [paperSessionDetailError, setPaperSessionDetailError] = useState<string | null>(null)
  const [isPaperSessionDetailLoading, setIsPaperSessionDetailLoading] = useState(false)
  const [paperSessionObservability, setPaperSessionObservability] = useState<TradeLabPaperSessionObservability | null>(null)
  const [paperSessionObservabilityError, setPaperSessionObservabilityError] = useState<string | null>(null)
  const [isPaperSessionObservabilityLoading, setIsPaperSessionObservabilityLoading] = useState(false)
  const [paperKillSwitchStatus, setPaperKillSwitchStatus] = useState<TradeLabPaperKillSwitchStatus | null>(null)
  const [paperKillSwitchStatusError, setPaperKillSwitchStatusError] = useState<string | null>(null)
  const [isPaperKillSwitchStatusLoading, setIsPaperKillSwitchStatusLoading] = useState(false)
  const [paperSessionStartResult, setPaperSessionStartResult] = useState<TradeLabPaperSessionStartResult | null>(null)
  const [paperSessionStartError, setPaperSessionStartError] = useState<string | null>(null)
  const [isStartingPaperSession, setIsStartingPaperSession] = useState(false)
  const [latestPaperSessionId, setLatestPaperSessionId] = useState<string | null>(null)
  const [paperSessionRunLocalResult, setPaperSessionRunLocalResult] = useState<TradeLabPaperSessionRunLocalResult | null>(null)
  const [paperSessionRunLocalError, setPaperSessionRunLocalError] = useState<string | null>(null)
  const [isRunningPaperSessionLocal, setIsRunningPaperSessionLocal] = useState(false)
  const [paperSessionCancelLocalResult, setPaperSessionCancelLocalResult] =
    useState<TradeLabPaperSessionCancelLocalResult | null>(null)
  const [paperSessionCancelLocalError, setPaperSessionCancelLocalError] = useState<string | null>(null)
  const [isCancellingPaperSessionLocal, setIsCancellingPaperSessionLocal] = useState(false)
  const [paperSessionRetryLocalResult, setPaperSessionRetryLocalResult] =
    useState<TradeLabPaperSessionRetryLocalResult | null>(null)
  const [paperSessionRetryLocalError, setPaperSessionRetryLocalError] = useState<string | null>(null)
  const [isRetryingPaperSessionLocal, setIsRetryingPaperSessionLocal] = useState(false)
  const [paperSessionResumeReadiness, setPaperSessionResumeReadiness] =
    useState<TradeLabPaperSessionResumeReadiness | null>(null)
  const [paperSessionResumeReadinessError, setPaperSessionResumeReadinessError] = useState<string | null>(null)
  const [isPaperSessionResumeReadinessLoading, setIsPaperSessionResumeReadinessLoading] = useState(false)
  const [paperSessionResumeLocalResult, setPaperSessionResumeLocalResult] =
    useState<TradeLabPaperSessionResumeLocalResult | null>(null)
  const [paperSessionResumeLocalError, setPaperSessionResumeLocalError] = useState<string | null>(null)
  const [isResumingPaperSessionLocal, setIsResumingPaperSessionLocal] = useState(false)
  const [testnetOrderSide, setTestnetOrderSide] = useState<"buy" | "sell">("buy")
  const [testnetOrderSizeMode, setTestnetOrderSizeMode] = useState<"base" | "quote">("quote")
  const [testnetOrderAmount, setTestnetOrderAmount] = useState("")
  const [testnetCredentialRefId, setTestnetCredentialRefId] = useState("")
  const [testnetOrderPreview, setTestnetOrderPreview] = useState<TradeLabTestnetOrderPreviewResult | null>(null)
  const [testnetOrderPreviewError, setTestnetOrderPreviewError] = useState<string | null>(null)
  const [isTestnetOrderPreviewLoading, setIsTestnetOrderPreviewLoading] = useState(false)
  const [testnetOrderDetail, setTestnetOrderDetail] = useState<TradeLabTestnetOrderDetail | null>(null)
  const [testnetOrderDetailError, setTestnetOrderDetailError] = useState<string | null>(null)
  const [isTestnetOrderDetailLoading, setIsTestnetOrderDetailLoading] = useState(false)
  const [testnetOrderList, setTestnetOrderList] = useState<TradeLabTestnetOrderList | null>(null)
  const [testnetOrderListError, setTestnetOrderListError] = useState<string | null>(null)
  const [isTestnetOrderListLoading, setIsTestnetOrderListLoading] = useState(false)
  const [testnetOrderSubmitResult, setTestnetOrderSubmitResult] =
    useState<TradeLabTestnetOrderOperationResult | null>(null)
  const [testnetOrderSubmitError, setTestnetOrderSubmitError] = useState<string | null>(null)
  const [isSubmittingTestnetOrder, setIsSubmittingTestnetOrder] = useState(false)
  const [testnetOrderCancelResult, setTestnetOrderCancelResult] =
    useState<TradeLabTestnetOrderOperationResult | null>(null)
  const [testnetOrderCancelError, setTestnetOrderCancelError] = useState<string | null>(null)
  const [isCancellingTestnetOrder, setIsCancellingTestnetOrder] = useState(false)
  const [testnetOrderReconcileResult, setTestnetOrderReconcileResult] =
    useState<TradeLabTestnetOrderOperationResult | null>(null)
  const [testnetOrderReconcileError, setTestnetOrderReconcileError] = useState<string | null>(null)
  const [isReconcilingTestnetOrder, setIsReconcilingTestnetOrder] = useState(false)
  const [testnetOrderJournalProjectionResult, setTestnetOrderJournalProjectionResult] =
    useState<TradeLabTestnetOrderJournalProjectionResult | null>(null)
  const [testnetOrderJournalProjectionError, setTestnetOrderJournalProjectionError] = useState<string | null>(null)
  const [isProjectingTestnetOrderToJournal, setIsProjectingTestnetOrderToJournal] = useState(false)
  const [liveOrderSide, setLiveOrderSide] = useState<"buy" | "sell">("buy")
  const [liveOrderSizeMode, setLiveOrderSizeMode] = useState<"base" | "quote">("quote")
  const [liveOrderAmount, setLiveOrderAmount] = useState("")
  const [liveOrderCredentialRefId, setLiveOrderCredentialRefId] = useState("")
  const [liveOrderPreview, setLiveOrderPreview] = useState<TradeLabLiveOrderPreviewResult | null>(null)
  const [liveOrderPreviewError, setLiveOrderPreviewError] = useState<string | null>(null)
  const [isLiveOrderPreviewLoading, setIsLiveOrderPreviewLoading] = useState(false)
  const [liveOrderDetail, setLiveOrderDetail] = useState<TradeLabLiveOrderDetail | null>(null)
  const [liveOrderDetailError, setLiveOrderDetailError] = useState<string | null>(null)
  const [isLiveOrderDetailLoading, setIsLiveOrderDetailLoading] = useState(false)
  const [liveOrderList, setLiveOrderList] = useState<TradeLabLiveOrderList | null>(null)
  const [liveOrderListError, setLiveOrderListError] = useState<string | null>(null)
  const [isLiveOrderListLoading, setIsLiveOrderListLoading] = useState(false)
  const [liveOrderSubmitResult, setLiveOrderSubmitResult] =
    useState<TradeLabLiveOrderOperationResult | null>(null)
  const [liveOrderSubmitError, setLiveOrderSubmitError] = useState<string | null>(null)
  const [isSubmittingLiveOrder, setIsSubmittingLiveOrder] = useState(false)
  const [liveOrderCancelResult, setLiveOrderCancelResult] =
    useState<TradeLabLiveOrderOperationResult | null>(null)
  const [liveOrderCancelError, setLiveOrderCancelError] = useState<string | null>(null)
  const [isCancellingLiveOrder, setIsCancellingLiveOrder] = useState(false)
  const [liveOrderReconcileResult, setLiveOrderReconcileResult] =
    useState<TradeLabLiveOrderOperationResult | null>(null)
  const [liveOrderReconcileError, setLiveOrderReconcileError] = useState<string | null>(null)
  const [isReconcilingLiveOrder, setIsReconcilingLiveOrder] = useState(false)
  const [liveOrderJournalProjectionResult, setLiveOrderJournalProjectionResult] =
    useState<TradeLabLiveOrderJournalProjectionResult | null>(null)
  const [liveOrderJournalProjectionError, setLiveOrderJournalProjectionError] = useState<string | null>(null)
  const [isProjectingLiveOrderToJournal, setIsProjectingLiveOrderToJournal] = useState(false)
  const [loadedPaperSessionContextKey, setLoadedPaperSessionContextKey] = useState<string | null>(null)
  const [datasetLocalFillResult, setDatasetLocalFillResult] = useState<TradeLabDatasetLocalFillResult | null>(null)
  const [datasetLocalFillError, setDatasetLocalFillError] = useState<string | null>(null)
  const [datasetFillEnqueueResult, setDatasetFillEnqueueResult] = useState<TradeLabDatasetFillEnqueueLocalResult | null>(null)
  const [datasetFillEnqueueError, setDatasetFillEnqueueError] = useState<string | null>(null)
  const [localFillAudit, setLocalFillAudit] = useState<TradeLabDatasetLocalFillAudit | null>(null)
  const [localFillAuditError, setLocalFillAuditError] = useState<string | null>(null)
  const [fillJobVisibility, setFillJobVisibility] = useState<TradeLabDatasetFillJobVisibility | null>(null)
  const [fillJobVisibilityError, setFillJobVisibilityError] = useState<string | null>(null)
  const [fillSchedulerStatus, setFillSchedulerStatus] = useState<TradeLabFillSchedulerStatus | null>(null)
  const [fillSchedulerStatusError, setFillSchedulerStatusError] = useState<string | null>(null)
  const [paperSchedulerStatus, setPaperSchedulerStatus] = useState<TradeLabPaperSchedulerStatus | null>(null)
  const [paperSchedulerStatusError, setPaperSchedulerStatusError] = useState<string | null>(null)
  const [isLocalFillAuditLoading, setIsLocalFillAuditLoading] = useState(false)
  const [isFillJobVisibilityLoading, setIsFillJobVisibilityLoading] = useState(false)
  const [isFillSchedulerStatusLoading, setIsFillSchedulerStatusLoading] = useState(false)
  const [isPaperSchedulerStatusLoading, setIsPaperSchedulerStatusLoading] = useState(false)
  const [isEnqueueingDatasetFill, setIsEnqueueingDatasetFill] = useState(false)
  const [preflightResult, setPreflightResult] = useState<TradeLabPreflightResult | null>(null)
  const [isPreflightOpen, setIsPreflightOpen] = useState(false)
  const [isComparePickerOpen, setIsComparePickerOpen] = useState(false)
  const [compareBaseRunId, setCompareBaseRunId] = useState<string | null>(null)
  const [compareRunId, setCompareRunId] = useState<string | null>(null)
  const [compareAnalysis, setCompareAnalysis] = useState<TradeLabRunAnalysis | null>(null)
  const [pendingBacktestRequest, setPendingBacktestRequest] = useState<{
    exchange: string
    symbol: string
    timeframe: string
    start_at: string
    end_at: string
    initial_equity: number
    fee_bps: number
    slippage_bps: number
    max_order_percent?: number
    max_position_percent?: number
    min_notional?: number
    max_drawdown_percent?: number
  } | null>(null)
  const [draftRuntimeConfig, setDraftRuntimeConfig] = useState<TradeLabRuntimeConfig>(createEmptyRuntimeConfig)
  const [draftRiskConfig, setDraftRiskConfig] = useState<TradeLabRiskConfig>(createEmptyRiskConfig)
  const [draftCredentialBoundaryChecksOverride, setDraftCredentialBoundaryChecksOverride] =
    useState<TradeLabCredentialBoundaryChecks | null>(null)
  const [draftSource, setDraftSource] = useState("")
  const [validationCheck, setValidationCheck] = useState<TradeLabStrategyValidationCheck | null>(null)
  const [validationCheckSource, setValidationCheckSource] = useState<string | null>(null)
  const [actionMessage, setActionMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const [isSavingVersion, setIsSavingVersion] = useState(false)
  const [isSavingPaperDraft, setIsSavingPaperDraft] = useState(false)
  const [isCheckingSyntax, setIsCheckingSyntax] = useState(false)
  const [isRunningBacktest, setIsRunningBacktest] = useState(false)
  const [isStartingBenchmarkRepeat, setIsStartingBenchmarkRepeat] = useState(false)
  const [isPollingPipeline, setIsPollingPipeline] = useState(false)
  const [isJobVisibilityLoading, setIsJobVisibilityLoading] = useState(false)
  const [isPreviewingDatasetFill, setIsPreviewingDatasetFill] = useState(false)
  const [isFillingDatasetLocal, setIsFillingDatasetLocal] = useState(false)
  const [isDatasetLocalFillConfirmed, setIsDatasetLocalFillConfirmed] = useState(false)

  const resetPaperSessionDetail = useCallback(() => {
    setPaperSessionDetailInputState("")
    setLoadedPaperSessionDetailInput(null)
    setLoadedPaperSessionContextKey(null)
    setPaperSessionDetail(null)
    setPaperSessionDetailError(null)
    setPaperSessionRunLocalResult(null)
    setPaperSessionRunLocalError(null)
    setIsRunningPaperSessionLocal(false)
    setPaperSessionCancelLocalResult(null)
    setPaperSessionCancelLocalError(null)
    setIsCancellingPaperSessionLocal(false)
    setPaperSessionRetryLocalResult(null)
    setPaperSessionRetryLocalError(null)
    setIsRetryingPaperSessionLocal(false)
    setPaperSessionResumeReadiness(null)
    setPaperSessionResumeReadinessError(null)
    setIsPaperSessionResumeReadinessLoading(false)
    setPaperSessionResumeLocalResult(null)
    setPaperSessionResumeLocalError(null)
    setIsResumingPaperSessionLocal(false)
    setIsPaperSessionDetailLoading(false)
  }, [])

  const loadedGroupIdRef = useRef<string | null>(null)
  const loadedStrategyIdRef = useRef<string | null>(null)
  const activeRunIdRef = useRef<string | null>(null)
  const paperSessionStartCounterRef = useRef(0)
  const paperSessionRetryCounterRef = useRef(0)
  const paperSessionResumeCounterRef = useRef(0)
  const testnetOrderPreviewCounterRef = useRef(0)
  const testnetOrderSubmitCounterRef = useRef(0)
  const testnetOrderCancelCounterRef = useRef(0)
  const liveOrderPreviewCounterRef = useRef(0)
  const liveOrderSubmitCounterRef = useRef(0)
  const liveOrderCancelCounterRef = useRef(0)

  const activeStrategyVersion =
    selectedStrategy?.versions.find((item) => item.id === selectedStrategy.currentVersionId) ??
    selectedStrategy?.versions[0] ??
    null
  const currentVersion =
    selectedStrategy?.versions.find((item) => item.id === viewedStrategyVersionId) ??
    activeStrategyVersion
  const runVersion = activeStrategyVersion
  const isDraftDirty = Boolean(runVersion && draftSource !== runVersion.sourceCode)
  const isConfigDirty = Boolean(
    selectedStrategy &&
      (stableStringify(draftRuntimeConfig) !== stableStringify(selectedStrategy.runtimeConfig) ||
        stableStringify(draftRiskConfig) !== stableStringify(selectedStrategy.riskConfig)),
  )
  const activeValidationCheck = validationCheckSource === draftSource ? validationCheck : null
  const runDisabledReason = (() => {
    if (!selectedStrategy) return "No strategy selected."
    if (!runVersion) return "Strategy has no version to run."
    if (runVersion.validationStatus !== "valid") return "Current version is not valid."
    if (isDraftDirty) return "Draft has changed. Create a new version before running backtest."
    if (isSavingSettings || isSavingVersion) return "Saving changes."
    if (isRunningBacktest) return "Backtest is running."
    return null
  })()
  const paperDraftBot = useMemo(() => {
    if (!selectedStrategy || !runVersion) {
      return null
    }
    const matchingBots = bots.filter(
      (bot) =>
        bot.mode === "paper" &&
        bot.status === "draft" &&
        bot.strategyId === selectedStrategy.id &&
        bot.strategyVersionId === runVersion.id &&
        bot.symbol === draftRuntimeConfig.symbol &&
        bot.timeframe === draftRuntimeConfig.timeframe,
    )
    return matchingBots.sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null
  }, [bots, draftRuntimeConfig.symbol, draftRuntimeConfig.timeframe, runVersion, selectedStrategy])
  const currentPaperSessionContextKey = useMemo(
    () =>
      stableStringify({
        strategyId: selectedStrategy?.id ?? null,
        versionId: runVersion?.id ?? null,
        exchange: draftRuntimeConfig.exchange,
        symbol: draftRuntimeConfig.symbol,
        timeframe: draftRuntimeConfig.timeframe,
        startAt: draftRuntimeConfig.startAt,
        endAt: draftRuntimeConfig.endAt,
        initialEquity: draftRuntimeConfig.initialEquity,
      }),
    [draftRuntimeConfig, runVersion?.id, selectedStrategy?.id],
  )
  const credentialBoundary = useMemo(
    () => normalizeCredentialBoundaryFromBot(paperDraftBot),
    [paperDraftBot],
  )
  const draftCredentialBoundaryChecks =
    draftCredentialBoundaryChecksOverride ??
    (credentialBoundary.status === "missing"
      ? DEFAULT_CREDENTIAL_BOUNDARY_CHECKS
      : credentialBoundary.checks)
  const paperSessionPreviewSetupReason = useMemo(
    () => evaluatePaperSessionPreviewSetup(paperDraftBot, draftRuntimeConfig),
    [draftRuntimeConfig, paperDraftBot],
  )
  const paperKillSwitchDisabledReason = useMemo(() => {
    if (paperKillSwitchStatus?.enabled === true) {
      return `Paper kill switch is enabled. Reason: ${paperKillSwitchStatus.reasonCode}.`
    }
    return null
  }, [paperKillSwitchStatus])
  const paperSessionStartDisabledReason = useMemo(() => {
    if (paperKillSwitchDisabledReason) return paperKillSwitchDisabledReason
    if (paperSessionPreviewSetupReason) return paperSessionPreviewSetupReason.message
    if (!paperSessionPreview) return "Refresh paper session readiness before starting."
    if (!paperSessionPreview.allowed) return paperSessionPreview.reasonCode || "Paper session preview is blocked."
    if (isStartingPaperSession) return "Paper session start is already in progress."
    return null
  }, [isStartingPaperSession, paperKillSwitchDisabledReason, paperSessionPreview, paperSessionPreviewSetupReason])
  const canStartPaperSession = paperSessionStartDisabledReason === null
  const paperSessionRunLocalDisabledReason = useMemo(() => {
    if (paperSessionDetailError && !paperSessionDetail) return "Resolve paper session detail error before running locally."
    if (!paperSessionDetail) return "Load a queued paper session before running locally."
    if (paperKillSwitchDisabledReason) return paperKillSwitchDisabledReason
    if (loadedPaperSessionContextKey !== null && loadedPaperSessionContextKey !== currentPaperSessionContextKey) {
      return "Paper session context changed. Refresh readiness or load a current recent session."
    }
    if (paperSessionDetail.session.status !== "queued") {
      return formatPaperSessionRunLocalDisabledReason(paperSessionDetail)
    }
    if (isStartingPaperSession) return "Paper session start is already in progress."
    if (isPaperSessionDetailLoading) return "Paper session detail is loading."
    if (isRunningPaperSessionLocal) return "Local paper run is already in progress."
    return null
  }, [
    currentPaperSessionContextKey,
    isPaperSessionDetailLoading,
    isRunningPaperSessionLocal,
    isStartingPaperSession,
    loadedPaperSessionContextKey,
    paperSessionDetail,
    paperSessionDetailError,
    paperKillSwitchDisabledReason,
  ])
  const canRunPaperSessionLocal = paperSessionRunLocalDisabledReason === null
  const paperSessionCancelLocalDisabledReason = useMemo(() => {
    if (paperSessionDetailError && !paperSessionDetail) return "Resolve paper session detail error before cancelling locally."
    if (!paperSessionDetail) return "Load a queued or running paper session before cancelling locally."
    if (loadedPaperSessionContextKey !== null && loadedPaperSessionContextKey !== currentPaperSessionContextKey) {
      return "Paper session context changed. Refresh readiness or load a current recent session."
    }
    if (paperSessionDetail.session.status !== "queued" && paperSessionDetail.session.status !== "running") {
      return formatPaperSessionCancelLocalDisabledReason(paperSessionDetail)
    }
    if (isStartingPaperSession) return "Paper session start is already in progress."
    if (isPaperSessionDetailLoading) return "Paper session detail is loading."
    if (isCancellingPaperSessionLocal) return "Local paper cancel is already in progress."
    return null
  }, [
    currentPaperSessionContextKey,
    isCancellingPaperSessionLocal,
    isPaperSessionDetailLoading,
    isStartingPaperSession,
    loadedPaperSessionContextKey,
    paperSessionDetail,
    paperSessionDetailError,
  ])
  const canCancelPaperSessionLocal = paperSessionCancelLocalDisabledReason === null
  const paperSessionRetryLocalDisabledReason = useMemo(() => {
    if (paperSessionDetailError && !paperSessionDetail) return "Resolve paper session detail error before retrying locally."
    if (!paperSessionDetail) return "Load a failed, blocked, or cancelled paper session before retrying locally."
    if (paperKillSwitchDisabledReason) return paperKillSwitchDisabledReason
    if (loadedPaperSessionContextKey !== null && loadedPaperSessionContextKey !== currentPaperSessionContextKey) {
      return "Paper session context changed. Refresh readiness or load a current recent session."
    }
    if (!isPaperSessionRetryableStatus(paperSessionDetail.session.status)) {
      return formatPaperSessionRetryLocalDisabledReason(paperSessionDetail)
    }
    if (isStartingPaperSession) return "Paper session start is already in progress."
    if (isPaperSessionDetailLoading) return "Paper session detail is loading."
    if (isRetryingPaperSessionLocal) return "Local paper retry is already in progress."
    return null
  }, [
    currentPaperSessionContextKey,
    isPaperSessionDetailLoading,
    isRetryingPaperSessionLocal,
    isStartingPaperSession,
    loadedPaperSessionContextKey,
    paperKillSwitchDisabledReason,
    paperSessionDetail,
    paperSessionDetailError,
  ])
  const canRetryPaperSessionLocal = paperSessionRetryLocalDisabledReason === null
  const paperSessionResumeLocalDisabledReason = useMemo(() => {
    if (paperSessionDetailError && !paperSessionDetail) return "Resolve paper session detail error before resuming locally."
    if (!paperSessionDetail) return "Load a cancelled paper session before resuming locally."
    if (paperKillSwitchDisabledReason) return paperKillSwitchDisabledReason
    if (loadedPaperSessionContextKey !== null && loadedPaperSessionContextKey !== currentPaperSessionContextKey) {
      return "Paper session context changed. Refresh readiness or load a current recent session."
    }
    if (paperSessionDetail.session.status !== "cancelled") {
      return formatPaperSessionResumeLocalDisabledReason(paperSessionDetail)
    }
    if (isPaperSessionResumeReadinessLoading) return "Paper resume readiness is loading."
    if (paperSessionResumeReadinessError && !paperSessionResumeReadiness) return paperSessionResumeReadinessError
    if (!paperSessionResumeReadiness) return "Load resume readiness before resuming locally."
    if (!paperSessionResumeReadiness.allowed) {
      return paperSessionResumeReadiness.blockingReasons[0] || paperSessionResumeReadiness.reasonCode || "Paper resume readiness is blocked."
    }
    if (isStartingPaperSession) return "Paper session start is already in progress."
    if (isPaperSessionDetailLoading) return "Paper session detail is loading."
    if (isRunningPaperSessionLocal) return "Local paper run is already in progress."
    if (isCancellingPaperSessionLocal) return "Local paper cancel is already in progress."
    if (isRetryingPaperSessionLocal) return "Local paper retry is already in progress."
    if (isResumingPaperSessionLocal) return "Local paper resume is already in progress."
    return null
  }, [
    currentPaperSessionContextKey,
    isCancellingPaperSessionLocal,
    isPaperSessionDetailLoading,
    isPaperSessionResumeReadinessLoading,
    isResumingPaperSessionLocal,
    isRetryingPaperSessionLocal,
    isRunningPaperSessionLocal,
    isStartingPaperSession,
    loadedPaperSessionContextKey,
    paperKillSwitchDisabledReason,
    paperSessionDetail,
    paperSessionDetailError,
    paperSessionResumeReadiness,
    paperSessionResumeReadinessError,
  ])
  const canResumePaperSessionLocal = paperSessionResumeLocalDisabledReason === null
  const setDraftCredentialBoundaryChecks = useCallback((checks: TradeLabCredentialBoundaryChecks) => {
    setDraftCredentialBoundaryChecksOverride(checks)
  }, [])

  const refreshLocalFillAudit = useCallback(
    async (context?: { exchange?: string; symbol?: string; timeframe?: string }) => {
      const exchange = context?.exchange ?? draftRuntimeConfig.exchange
      const symbol = context?.symbol ?? draftRuntimeConfig.symbol
      const timeframe = context?.timeframe ?? draftRuntimeConfig.timeframe
      if (!selectedStrategy || !exchange || !symbol || !timeframe) {
        setLocalFillAudit(null)
        setLocalFillAuditError(null)
        return null
      }
      setIsLocalFillAuditLoading(true)
      setLocalFillAuditError(null)
      try {
        const payload = normalizeDatasetLocalFillAudit(
          await tradeLabApi.getDatasetLocalFillAudit({
            exchange,
            symbol,
            timeframe,
            limit: 5,
          }),
        )
        setLocalFillAudit(payload)
        return payload
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : "Unable to load local fill audit."
        setLocalFillAuditError(message)
        return null
      } finally {
        setIsLocalFillAuditLoading(false)
      }
    },
    [draftRuntimeConfig.exchange, draftRuntimeConfig.symbol, draftRuntimeConfig.timeframe, selectedStrategy],
  )

  const refreshFillJobVisibility = useCallback(
    async (context?: { datasetKey?: string; exchange?: string; symbol?: string; timeframe?: string }) => {
      const datasetKey = context?.datasetKey
      const exchange = context?.exchange ?? draftRuntimeConfig.exchange
      const symbol = context?.symbol ?? draftRuntimeConfig.symbol
      const timeframe = context?.timeframe ?? draftRuntimeConfig.timeframe
      if (!selectedStrategy || (!datasetKey && (!exchange || !symbol || !timeframe))) {
        setFillJobVisibility(null)
        setFillJobVisibilityError(null)
        return null
      }
      setIsFillJobVisibilityLoading(true)
      setFillJobVisibilityError(null)
      try {
        const payload = normalizeDatasetFillJobVisibility(
          await tradeLabApi.getDatasetFillJobVisibility(
            datasetKey
              ? { datasetKey, limit: 5 }
              : { exchange, symbol, timeframe, limit: 5 },
          ),
        )
        setFillJobVisibility(payload)
        return payload
      } catch (loadError) {
        const message = loadError instanceof Error ? loadError.message : "Unable to load background fill jobs."
        setFillJobVisibilityError(message)
        return null
      } finally {
        setIsFillJobVisibilityLoading(false)
      }
    },
    [draftRuntimeConfig.exchange, draftRuntimeConfig.symbol, draftRuntimeConfig.timeframe, selectedStrategy],
  )

  const refreshFillSchedulerStatus = useCallback(async () => {
    setIsFillSchedulerStatusLoading(true)
    setFillSchedulerStatusError(null)
    try {
      const payload = normalizeFillSchedulerStatus(await tradeLabApi.getFillSchedulerStatus())
      setFillSchedulerStatus(payload)
      return payload
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Unable to load scheduler status."
      setFillSchedulerStatusError(message)
      return null
    } finally {
      setIsFillSchedulerStatusLoading(false)
    }
  }, [])

  const refreshPaperSchedulerStatus = useCallback(async () => {
    setIsPaperSchedulerStatusLoading(true)
    setPaperSchedulerStatusError(null)
    try {
      const payload = normalizePaperSchedulerStatus(await tradeLabApi.getPaperSchedulerStatus())
      setPaperSchedulerStatus(payload)
      return payload
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Unable to load paper scheduler status."
      setPaperSchedulerStatusError(message)
      return null
    } finally {
      setIsPaperSchedulerStatusLoading(false)
    }
  }, [])

  const refreshPaperKillSwitchStatus = useCallback(async () => {
    setIsPaperKillSwitchStatusLoading(true)
    setPaperKillSwitchStatusError(null)
    try {
      const payload = normalizePaperKillSwitchStatus(await tradeLabApi.getPaperKillSwitchStatus())
      setPaperKillSwitchStatus(payload)
      return payload
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Unable to load paper kill switch status."
      setPaperKillSwitchStatusError(message)
      return null
    } finally {
      setIsPaperKillSwitchStatusLoading(false)
    }
  }, [])

  const refreshDatasetCoverage = useCallback(async () => {
    setIsDatasetCoverageLoading(true)
    setDatasetCoverageError(null)
    try {
      const payload = await tradeLabApi.listDatasetCoverage()
      const items = (payload.items ?? []).map(normalizeDatasetCoverageItem)
      setDatasetCoverage(items)
      return items
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Unable to load dataset coverage."
      setDatasetCoverageError(message)
      setDatasetCoverage([])
      return []
    } finally {
      setIsDatasetCoverageLoading(false)
    }
  }, [])

  const refreshRunHistory = useCallback(async (strategyId?: string) => {
    if (!strategyId) {
      setRunHistory([])
      return
    }
    const payload = await tradeLabApi.listBotRuns({ strategyId, limit: 25 })
    setRunHistory((payload.items ?? []).map(normalizeRunHistoryEntry))
  }, [])

  const refreshJobVisibility = useCallback(async (strategyId?: string) => {
    if (!strategyId) {
      setJobVisibility(null)
      setJobVisibilityError(null)
      return null
    }
    setIsJobVisibilityLoading(true)
    setJobVisibilityError(null)
    try {
      const payload = normalizeStrategyJobVisibility(await tradeLabApi.getStrategyJobVisibility(strategyId, { limit: 5 }))
      setJobVisibility(payload)
      return payload
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Unable to load job visibility."
      setJobVisibilityError(message)
      return null
    } finally {
      setIsJobVisibilityLoading(false)
    }
  }, [])

  const previewDatasetFillPlan = useCallback(async () => {
    if (!selectedStrategy) {
      const message = "Select a strategy before previewing dataset fill."
      setDatasetFillPreviewError(message)
      setActionMessage(message)
      return null
    }
    setIsPreviewingDatasetFill(true)
    setDatasetFillPreview(null)
    setDatasetFillPreviewError(null)
    setDatasetLocalFillResult(null)
    setDatasetLocalFillError(null)
    setDatasetFillEnqueueResult(null)
    setDatasetFillEnqueueError(null)
    setIsDatasetLocalFillConfirmed(false)
    setActionMessage(null)
    try {
      const payload = normalizeDatasetFillPreview(
        await tradeLabApi.previewDatasetFill({
          strategy_id: selectedStrategy.id,
          exchange: draftRuntimeConfig.exchange,
          symbol: draftRuntimeConfig.symbol,
          timeframe: draftRuntimeConfig.timeframe,
          requested_start_at: draftRuntimeConfig.startAt,
          requested_end_at: draftRuntimeConfig.endAt,
          source: "strategy_lab",
        }),
      )
      setDatasetFillPreview(payload)
      setActionMessage("Dataset fill preview generated. No data was changed.")
      return payload
    } catch (previewError) {
      const message = previewError instanceof ApiError ? previewError.message : "Dataset fill preview failed."
      setDatasetFillPreviewError(message)
      setActionMessage(message)
      return null
    } finally {
      setIsPreviewingDatasetFill(false)
    }
  }, [draftRuntimeConfig, selectedStrategy])

  const refreshPaperSessionPreview = useCallback(async () => {
    const setupReason = evaluatePaperSessionPreviewSetup(paperDraftBot, draftRuntimeConfig)
    if (setupReason || !paperDraftBot) {
      setPaperSessionPreview(null)
      setPaperSessionPreviewError(null)
      return null
    }

    setIsPaperSessionPreviewLoading(true)
    setPaperSessionPreview(null)
    setPaperSessionPreviewError(null)
    setPaperSessionStartResult(null)
    setPaperSessionStartError(null)
    setPaperSessionRunLocalResult(null)
    setPaperSessionRunLocalError(null)
    setLatestPaperSessionId(null)
    setActionMessage(null)
    try {
      const payload = normalizePaperSessionPreview(
        await tradeLabApi.previewPaperSession({
          bot_id: paperDraftBot.id,
          exchange: draftRuntimeConfig.exchange,
          symbol: draftRuntimeConfig.symbol,
          timeframe: draftRuntimeConfig.timeframe,
          start_at: draftRuntimeConfig.startAt,
          end_at: draftRuntimeConfig.endAt,
          risk_policy_override: {
            startingCash: draftRuntimeConfig.initialEquity,
            maxOrderPercent: draftRiskConfig.maxOrderPercent,
            maxPositionPercent: draftRiskConfig.maxPositionPercent,
            maxDrawdownPercent: draftRiskConfig.maxDrawdownPercent,
            minNotional: draftRiskConfig.minNotional,
          },
          source: "strategy_lab",
        }),
      )
      setPaperSessionPreview(payload)
      setPaperSessionStartResult(null)
      setPaperSessionStartError(null)
      setPaperSessionRunLocalResult(null)
      setPaperSessionRunLocalError(null)
      setLatestPaperSessionId(null)
      setActionMessage("Paper session readiness refreshed.")
      return payload
    } catch (previewError) {
      const message = formatPaperSessionPreviewError(previewError)
      setPaperSessionPreviewError(message)
      setActionMessage(message)
      return null
    } finally {
      setIsPaperSessionPreviewLoading(false)
    }
  }, [draftRiskConfig, draftRuntimeConfig, paperDraftBot])

  const refreshTestnetOrders = useCallback(async () => {
    setIsTestnetOrderListLoading(true)
    setTestnetOrderListError(null)
    try {
      const payload = normalizeTestnetOrderList(
        await tradeLabApi.listTestnetOrders({
          strategyId: selectedStrategy?.id,
          strategyVersionId: runVersion?.id,
          symbol: draftRuntimeConfig.symbol || undefined,
          credentialRefId: testnetCredentialRefId.trim() || undefined,
          limit: 10,
        }),
      )
      setTestnetOrderList(payload)
      return payload
    } catch (loadError) {
      const message = formatTestnetOrderReadError(loadError)
      setTestnetOrderListError(message)
      return null
    } finally {
      setIsTestnetOrderListLoading(false)
    }
  }, [draftRuntimeConfig, runVersion, selectedStrategy, testnetCredentialRefId])

  const loadTestnetOrderDetail = useCallback(async (orderId: string) => {
    const trimmedOrderId = orderId.trim()
    if (!trimmedOrderId) {
      setTestnetOrderDetail(null)
      setTestnetOrderDetailError("Select an assisted testnet order preview to inspect evidence.")
      return null
    }

    setIsTestnetOrderDetailLoading(true)
    setTestnetOrderDetailError(null)
    try {
      const detail = normalizeTestnetOrderDetail(await tradeLabApi.getTestnetOrderDetail(trimmedOrderId))
      setTestnetOrderDetail(detail)
      return detail
    } catch (loadError) {
      const message = formatTestnetOrderReadError(loadError)
      setTestnetOrderDetailError(message)
      return null
    } finally {
      setIsTestnetOrderDetailLoading(false)
    }
  }, [])

  const refreshLiveOrders = useCallback(async () => {
    if (!selectedStrategy || !runVersion) {
      setLiveOrderList(null)
      return null
    }

    setIsLiveOrderListLoading(true)
    setLiveOrderListError(null)
    try {
      const payload = normalizeLiveOrderList(
        await tradeLabApi.listLiveOrders({
          strategyId: selectedStrategy.id,
          strategyVersionId: runVersion.id,
          sourceRunId: activePipeline?.run.id ?? execution?.runId ?? undefined,
          credentialRefId: liveOrderCredentialRefId.trim() || undefined,
          limit: 10,
        }),
      )
      setLiveOrderList(payload)
      return payload
    } catch (loadError) {
      const message = formatLiveOrderReadError(loadError)
      setLiveOrderListError(message)
      return null
    } finally {
      setIsLiveOrderListLoading(false)
    }
  }, [activePipeline, execution, liveOrderCredentialRefId, runVersion, selectedStrategy])

  const loadLiveOrderDetail = useCallback(async (orderId: string) => {
    const trimmedOrderId = orderId.trim()
    if (!trimmedOrderId) {
      setLiveOrderDetail(null)
      setLiveOrderDetailError("Select an assisted live order preview to inspect evidence.")
      return null
    }

    setIsLiveOrderDetailLoading(true)
    setLiveOrderDetailError(null)
    try {
      const detail = normalizeLiveOrderDetail(await tradeLabApi.getLiveOrderDetail(trimmedOrderId))
      setLiveOrderDetail(detail)
      return detail
    } catch (loadError) {
      const message = formatLiveOrderReadError(loadError)
      setLiveOrderDetailError(message)
      return null
    } finally {
      setIsLiveOrderDetailLoading(false)
    }
  }, [])

  const hasCompletedTestnetSource = runAnalysis?.run.status === "completed"
  const selectedTestnetIntent = testnetOrderDetail?.intent ?? null
  const testnetOrderPreviewDisabledReason = !hasCompletedTestnetSource
    ? "Load a completed run before previewing an assisted testnet order."
    : !testnetCredentialRefId.trim()
      ? "Enter a testnet credential reference ID before previewing."
      : !testnetOrderAmount.trim()
        ? "Enter an order amount before previewing."
        : null
  const canPreviewTestnetOrder = testnetOrderPreviewDisabledReason === null && !isTestnetOrderPreviewLoading
  const canConfirmSubmitTestnetOrder = Boolean(
    hasCompletedTestnetSource && testnetOrderPreview?.allowed && testnetOrderPreview.previewId && !isSubmittingTestnetOrder,
  )
  const canCancelTestnetOrder = Boolean(
    selectedTestnetIntent &&
      ["submitted", "partially_filled", "unknown", "reconciliation_required"].includes(selectedTestnetIntent.status) &&
      !isCancellingTestnetOrder,
  )
  const canReconcileTestnetOrder = Boolean(
    selectedTestnetIntent &&
      [
        "unknown",
        "reconciliation_required",
        "cancel_requested",
        "submitted",
        "partially_filled",
        "filled",
        "cancelled",
        "rejected",
      ].includes(selectedTestnetIntent.status) &&
      !isReconcilingTestnetOrder,
  )
  const canProjectTestnetOrderToJournal = Boolean(
    hasCompletedTestnetSource &&
      selectedTestnetIntent &&
      ["filled", "cancelled", "rejected", "reconciled"].includes(selectedTestnetIntent.status) &&
      !isProjectingTestnetOrderToJournal,
  )

  const hasCompletedLiveSource = runAnalysis?.run.status === "completed"
  const selectedLiveIntent = liveOrderDetail?.intent ?? null
  const liveOrderPreviewDisabledReason = !hasCompletedLiveSource
    ? "Load a completed run before previewing an assisted live order."
    : !liveOrderCredentialRefId.trim()
      ? "Enter a live credential reference ID before previewing."
      : !liveOrderAmount.trim()
        ? "Enter an order amount before previewing."
        : null
  const canPreviewLiveOrder = liveOrderPreviewDisabledReason === null && !isLiveOrderPreviewLoading
  const canConfirmSubmitLiveOrder = Boolean(
    hasCompletedLiveSource && liveOrderPreview?.allowed && liveOrderPreview.previewId && !isSubmittingLiveOrder,
  )
  const canCancelLiveOrder = Boolean(
    selectedLiveIntent &&
      ["submitted", "partially_filled", "unknown", "reconciliation_required"].includes(selectedLiveIntent.status) &&
      !isCancellingLiveOrder,
  )
  const canReconcileLiveOrder = Boolean(
    selectedLiveIntent &&
      [
        "unknown",
        "reconciliation_required",
        "cancel_requested",
        "submitted",
        "partially_filled",
        "filled",
        "cancelled",
        "rejected",
      ].includes(selectedLiveIntent.status) &&
      !isReconcilingLiveOrder,
  )
  const canProjectLiveOrderToJournal = Boolean(
    hasCompletedLiveSource &&
      selectedLiveIntent &&
      ["filled", "cancelled", "rejected", "reconciled"].includes(selectedLiveIntent.status) &&
      !isProjectingLiveOrderToJournal,
  )

  const previewTestnetOrder = useCallback(async () => {
    if (!selectedStrategy || !runVersion) {
      const message = "Select a versioned strategy before previewing a testnet order."
      setTestnetOrderPreviewError(message)
      setActionMessage(message)
      return null
    }
    if (!hasCompletedTestnetSource) {
      const message = "Load a completed run before previewing an assisted testnet order."
      setTestnetOrderPreviewError(message)
      setActionMessage(message)
      return null
    }
    const credentialRefId = testnetCredentialRefId.trim()
    if (!credentialRefId) {
      const message = "Enter a testnet credential reference ID before previewing."
      setTestnetOrderPreviewError(message)
      setActionMessage(message)
      return null
    }
    const amount = testnetOrderAmount.trim()
    if (!amount) {
      const message = "Enter an order amount before previewing."
      setTestnetOrderPreviewError(message)
      setActionMessage(message)
      return null
    }

    testnetOrderPreviewCounterRef.current += 1
    const sourceRunId = activePipeline?.run.id ?? execution?.runId ?? null
    const idempotencyKey = `strategy-lab-testnet-preview:${selectedStrategy.id}:${runVersion.id}:${testnetOrderPreviewCounterRef.current}`

    setIsTestnetOrderPreviewLoading(true)
    setTestnetOrderPreviewError(null)
    setTestnetOrderDetailError(null)
    setTestnetOrderSubmitResult(null)
    setTestnetOrderSubmitError(null)
    setTestnetOrderCancelResult(null)
    setTestnetOrderCancelError(null)
    setTestnetOrderReconcileResult(null)
    setTestnetOrderReconcileError(null)
    setActionMessage(null)
    try {
      const payload = normalizeTestnetOrderPreviewResult(
        await tradeLabApi.previewTestnetOrder({
          confirmPreviewOnly: true,
          idempotencyKey,
          clientActionId: idempotencyKey,
          source: "strategy_lab",
          actor: "local-user",
          strategyId: selectedStrategy.id,
          strategyVersionId: runVersion.id,
          sourceRunId,
          credentialRefId,
          environment: "binance_testnet",
          exchange: "binance",
          marketType: "spot",
          symbol: draftRuntimeConfig.symbol,
          side: testnetOrderSide,
          orderType: "market",
          quantity: testnetOrderSizeMode === "base" ? amount : null,
          quoteQuantity: testnetOrderSizeMode === "quote" ? amount : null,
        }),
      )
      setTestnetOrderPreview(payload)
      if (payload.intentId) {
        await loadTestnetOrderDetail(payload.intentId)
      }
      await refreshTestnetOrders()
      setActionMessage(payload.allowed ? "Assisted testnet preview generated. No order was submitted." : payload.reasonCode)
      return payload
    } catch (previewError) {
      const message = formatTestnetOrderPreviewError(previewError)
      setTestnetOrderPreviewError(message)
      setActionMessage(message)
      return null
    } finally {
      setIsTestnetOrderPreviewLoading(false)
    }
  }, [
    activePipeline?.run.id,
    draftRuntimeConfig.symbol,
    execution?.runId,
    hasCompletedTestnetSource,
    loadTestnetOrderDetail,
    refreshTestnetOrders,
    runVersion,
    selectedStrategy,
    testnetCredentialRefId,
    testnetOrderAmount,
    testnetOrderSide,
    testnetOrderSizeMode,
  ])

  const previewLiveOrder = useCallback(async () => {
    if (!selectedStrategy || !runVersion) {
      const message = "Select a versioned strategy before previewing a live order."
      setLiveOrderPreviewError(message)
      setActionMessage(message)
      return null
    }
    if (!hasCompletedLiveSource) {
      const message = "Load a completed run before previewing an assisted live order."
      setLiveOrderPreviewError(message)
      setActionMessage(message)
      return null
    }
    const credentialRefId = liveOrderCredentialRefId.trim()
    if (!credentialRefId) {
      const message = "Enter a live credential reference ID before previewing."
      setLiveOrderPreviewError(message)
      setActionMessage(message)
      return null
    }
    const amount = liveOrderAmount.trim()
    if (!amount) {
      const message = "Enter an order amount before previewing."
      setLiveOrderPreviewError(message)
      setActionMessage(message)
      return null
    }

    liveOrderPreviewCounterRef.current += 1
    const sourceRunId = activePipeline?.run.id ?? execution?.runId ?? null
    const idempotencyKey = `strategy-lab-live-preview:${selectedStrategy.id}:${runVersion.id}:${liveOrderPreviewCounterRef.current}`

    setIsLiveOrderPreviewLoading(true)
    setLiveOrderPreviewError(null)
    setLiveOrderDetailError(null)
    setLiveOrderSubmitResult(null)
    setLiveOrderSubmitError(null)
    setLiveOrderCancelResult(null)
    setLiveOrderCancelError(null)
    setLiveOrderReconcileResult(null)
    setLiveOrderReconcileError(null)
    setLiveOrderJournalProjectionResult(null)
    setLiveOrderJournalProjectionError(null)
    setActionMessage(null)
    try {
      const payload = normalizeLiveOrderPreviewResult(
        await tradeLabApi.previewLiveOrder({
          confirmPreviewOnly: true,
          idempotencyKey,
          clientActionId: idempotencyKey,
          source: "strategy_lab",
          actor: "local-user",
          strategyId: selectedStrategy.id,
          strategyVersionId: runVersion.id,
          sourceRunId,
          credentialRefId,
          environment: "binance_live",
          exchange: "binance",
          marketType: "spot",
          symbol: draftRuntimeConfig.symbol,
          side: liveOrderSide,
          orderType: "market",
          quantity: liveOrderSizeMode === "base" ? amount : null,
          quoteQuantity: liveOrderSizeMode === "quote" ? amount : null,
        }),
      )
      setLiveOrderPreview(payload)
      if (payload.intentId) {
        await loadLiveOrderDetail(payload.intentId)
      }
      await refreshLiveOrders()
      setActionMessage(payload.allowed ? "Assisted live preview generated. No live order was submitted." : payload.reasonCode)
      return payload
    } catch (previewError) {
      const message = formatLiveOrderPreviewError(previewError)
      setLiveOrderPreviewError(message)
      setActionMessage(message)
      return null
    } finally {
      setIsLiveOrderPreviewLoading(false)
    }
  }, [
    activePipeline?.run.id,
    draftRuntimeConfig.symbol,
    execution?.runId,
    hasCompletedLiveSource,
    liveOrderAmount,
    liveOrderCredentialRefId,
    liveOrderSide,
    liveOrderSizeMode,
    loadLiveOrderDetail,
    refreshLiveOrders,
    runVersion,
    selectedStrategy,
  ])

  const confirmSubmitLiveOrder = useCallback(async () => {
    if (!liveOrderPreview?.previewId || !canConfirmSubmitLiveOrder) {
      const message = "Generate an allowed completed-run-backed preview before submitting."
      setLiveOrderSubmitError(message)
      setActionMessage(message)
      return null
    }

    liveOrderSubmitCounterRef.current += 1
    const idempotencyKey = `strategy-lab-live-submit:${liveOrderPreview.previewId}:${liveOrderSubmitCounterRef.current}`
    setIsSubmittingLiveOrder(true)
    setLiveOrderSubmitError(null)
    setActionMessage(null)
    try {
      const payload = normalizeLiveOrderConfirmSubmitResult(
        await tradeLabApi.confirmSubmitLiveOrder(liveOrderPreview.previewId, {
          confirmLiveOrder: true,
          idempotencyKey,
          actor: "local-user",
        }),
      )
      setLiveOrderSubmitResult(payload)
      if (payload.intentId) {
        await loadLiveOrderDetail(payload.intentId)
      }
      await refreshLiveOrders()
      setActionMessage(`Assisted live submit ${payload.status}: ${payload.reasonCode}.`)
      return payload
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Assisted live submit failed."
      setLiveOrderSubmitError(message)
      setActionMessage(message)
      return null
    } finally {
      setIsSubmittingLiveOrder(false)
    }
  }, [canConfirmSubmitLiveOrder, loadLiveOrderDetail, liveOrderPreview, refreshLiveOrders])

  const cancelLiveOrder = useCallback(async () => {
    if (!selectedLiveIntent || !canCancelLiveOrder) {
      const message = "Load a submitted, partially filled, unknown, or reconciliation-required live order before cancelling."
      setLiveOrderCancelError(message)
      setActionMessage(message)
      return null
    }

    liveOrderCancelCounterRef.current += 1
    const idempotencyKey = `strategy-lab-live-cancel:${selectedLiveIntent.intentId}:${liveOrderCancelCounterRef.current}`
    setIsCancellingLiveOrder(true)
    setLiveOrderCancelError(null)
    setActionMessage(null)
    try {
      const payload = normalizeLiveOrderCancelResult(
        await tradeLabApi.cancelLiveOrder(selectedLiveIntent.intentId, {
          confirmLiveCancel: true,
          idempotencyKey,
          reason: "user_requested",
          actor: "local-user",
        }),
      )
      setLiveOrderCancelResult(payload)
      if (payload.intentId) {
        await loadLiveOrderDetail(payload.intentId)
      }
      await refreshLiveOrders()
      setActionMessage(`Assisted live cancel ${payload.status}: ${payload.reasonCode}.`)
      return payload
    } catch (cancelError) {
      const message = cancelError instanceof Error ? cancelError.message : "Assisted live cancel failed."
      setLiveOrderCancelError(message)
      setActionMessage(message)
      return null
    } finally {
      setIsCancellingLiveOrder(false)
    }
  }, [canCancelLiveOrder, loadLiveOrderDetail, refreshLiveOrders, selectedLiveIntent])

  const reconcileLiveOrder = useCallback(async () => {
    if (!selectedLiveIntent || !canReconcileLiveOrder) {
      const message = "Load a reconcile-eligible live order before reconciling."
      setLiveOrderReconcileError(message)
      setActionMessage(message)
      return null
    }

    setIsReconcilingLiveOrder(true)
    setLiveOrderReconcileError(null)
    setActionMessage(null)
    try {
      const payload = normalizeLiveOrderReconcileResult(
        await tradeLabApi.reconcileLiveOrder(selectedLiveIntent.intentId, {
          confirmLiveReconcile: true,
          trigger: "manual",
          actor: "local-user",
        }),
      )
      setLiveOrderReconcileResult(payload)
      if (payload.intentId) {
        await loadLiveOrderDetail(payload.intentId)
      }
      await refreshLiveOrders()
      setActionMessage(`Assisted live reconcile ${payload.status}: ${payload.reasonCode}.`)
      return payload
    } catch (reconcileError) {
      const message = reconcileError instanceof Error ? reconcileError.message : "Assisted live reconcile failed."
      setLiveOrderReconcileError(message)
      setActionMessage(message)
      return null
    } finally {
      setIsReconcilingLiveOrder(false)
    }
  }, [canReconcileLiveOrder, loadLiveOrderDetail, refreshLiveOrders, selectedLiveIntent])

  const projectLiveOrderToJournal = useCallback(async () => {
    if (!selectedLiveIntent || !canProjectLiveOrderToJournal) {
      const message = "Load a terminal live order before projecting to the journal."
      setLiveOrderJournalProjectionError(message)
      setActionMessage(message)
      return null
    }

    setIsProjectingLiveOrderToJournal(true)
    setLiveOrderJournalProjectionError(null)
    setActionMessage(null)
    try {
      const payload = normalizeLiveOrderJournalProjectionResult(
        await tradeLabApi.projectLiveOrderToJournal(selectedLiveIntent.intentId, {
          confirmLiveJournalProjection: true,
          source: "strategy_lab",
          actor: "local-user",
        }),
      )
      setLiveOrderJournalProjectionResult(payload)
      if (payload.intentId) {
        await loadLiveOrderDetail(payload.intentId)
      }
      await refreshLiveOrders()
      setActionMessage(`Live journal projection ${payload.status}: ${payload.reasonCode}.`)
      return payload
    } catch (projectionError) {
      const message = projectionError instanceof Error ? projectionError.message : "Live journal projection failed."
      setLiveOrderJournalProjectionError(message)
      setActionMessage(message)
      return null
    } finally {
      setIsProjectingLiveOrderToJournal(false)
    }
  }, [canProjectLiveOrderToJournal, loadLiveOrderDetail, refreshLiveOrders, selectedLiveIntent])

  const confirmSubmitTestnetOrder = useCallback(async () => {
    if (!testnetOrderPreview?.previewId || !canConfirmSubmitTestnetOrder) {
      const message = "Generate an allowed completed-run-backed preview before submitting."
      setTestnetOrderSubmitError(message)
      setActionMessage(message)
      return null
    }

    testnetOrderSubmitCounterRef.current += 1
    const idempotencyKey = `strategy-lab-testnet-submit:${testnetOrderPreview.previewId}:${testnetOrderSubmitCounterRef.current}`
    setIsSubmittingTestnetOrder(true)
    setTestnetOrderSubmitError(null)
    setActionMessage(null)
    try {
      const payload = normalizeTestnetOrderConfirmSubmitResult(
        await tradeLabApi.confirmSubmitTestnetOrder(testnetOrderPreview.previewId, {
          confirmTestnetOrder: true,
          idempotencyKey,
          actor: "local-user",
        }),
      )
      setTestnetOrderSubmitResult(payload)
      if (payload.intentId) {
        await loadTestnetOrderDetail(payload.intentId)
      }
      await refreshTestnetOrders()
      setActionMessage(`Assisted testnet submit ${payload.status}: ${payload.reasonCode}.`)
      return payload
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "Assisted testnet submit failed."
      setTestnetOrderSubmitError(message)
      setActionMessage(message)
      return null
    } finally {
      setIsSubmittingTestnetOrder(false)
    }
  }, [canConfirmSubmitTestnetOrder, loadTestnetOrderDetail, refreshTestnetOrders, testnetOrderPreview])

  const cancelTestnetOrder = useCallback(async () => {
    if (!selectedTestnetIntent || !canCancelTestnetOrder) {
      const message = "Load a submitted, partially filled, unknown, or reconciliation-required testnet order before cancelling."
      setTestnetOrderCancelError(message)
      setActionMessage(message)
      return null
    }

    testnetOrderCancelCounterRef.current += 1
    const idempotencyKey = `strategy-lab-testnet-cancel:${selectedTestnetIntent.intentId}:${testnetOrderCancelCounterRef.current}`
    setIsCancellingTestnetOrder(true)
    setTestnetOrderCancelError(null)
    setActionMessage(null)
    try {
      const payload = normalizeTestnetOrderCancelResult(
        await tradeLabApi.cancelTestnetOrder(selectedTestnetIntent.intentId, {
          confirmTestnetCancel: true,
          idempotencyKey,
          reason: "user_requested",
          actor: "local-user",
        }),
      )
      setTestnetOrderCancelResult(payload)
      if (payload.intentId) {
        await loadTestnetOrderDetail(payload.intentId)
      }
      await refreshTestnetOrders()
      setActionMessage(`Assisted testnet cancel ${payload.status}: ${payload.reasonCode}.`)
      return payload
    } catch (cancelError) {
      const message = cancelError instanceof Error ? cancelError.message : "Assisted testnet cancel failed."
      setTestnetOrderCancelError(message)
      setActionMessage(message)
      return null
    } finally {
      setIsCancellingTestnetOrder(false)
    }
  }, [canCancelTestnetOrder, loadTestnetOrderDetail, refreshTestnetOrders, selectedTestnetIntent])

  const reconcileTestnetOrder = useCallback(async () => {
    if (!selectedTestnetIntent || !canReconcileTestnetOrder) {
      const message = "Load a reconcile-eligible testnet order before reconciling."
      setTestnetOrderReconcileError(message)
      setActionMessage(message)
      return null
    }

    setIsReconcilingTestnetOrder(true)
    setTestnetOrderReconcileError(null)
    setActionMessage(null)
    try {
      const payload = normalizeTestnetOrderReconcileResult(
        await tradeLabApi.reconcileTestnetOrder({
          orderId: selectedTestnetIntent.intentId,
          confirmTestnetReconcile: true,
          trigger: "manual",
          actor: "local-user",
        }),
      )
      setTestnetOrderReconcileResult(payload)
      if (payload.intentId) {
        await loadTestnetOrderDetail(payload.intentId)
      }
      await refreshTestnetOrders()
      setActionMessage(`Assisted testnet reconcile ${payload.status}: ${payload.reasonCode}.`)
      return payload
    } catch (reconcileError) {
      const message = reconcileError instanceof Error ? reconcileError.message : "Assisted testnet reconcile failed."
      setTestnetOrderReconcileError(message)
      setActionMessage(message)
      return null
    } finally {
      setIsReconcilingTestnetOrder(false)
    }
  }, [canReconcileTestnetOrder, loadTestnetOrderDetail, refreshTestnetOrders, selectedTestnetIntent])

  const setPaperSessionDetailInput = useCallback(
    (value: string) => {
      const trimmed = value.trim()
      setPaperSessionDetailInputState(value)
      setPaperSessionDetailError(null)
      if (loadedPaperSessionDetailInput !== null && loadedPaperSessionDetailInput !== trimmed) {
        setPaperSessionDetail(null)
        setLoadedPaperSessionDetailInput(null)
        setLoadedPaperSessionContextKey(null)
        setPaperSessionRunLocalResult(null)
        setPaperSessionRunLocalError(null)
        setPaperSessionResumeReadiness(null)
        setPaperSessionResumeReadinessError(null)
        setPaperSessionResumeLocalResult(null)
        setPaperSessionResumeLocalError(null)
      }
    },
    [loadedPaperSessionDetailInput],
  )

  const loadPaperSessionResumeReadinessById = useCallback(async (sessionId: string) => {
    const trimmedSessionId = sessionId.trim()
    if (!trimmedSessionId) {
      setPaperSessionResumeReadiness(null)
      setPaperSessionResumeReadinessError(null)
      return null
    }
    setIsPaperSessionResumeReadinessLoading(true)
    setPaperSessionResumeReadinessError(null)
    try {
      const readiness = normalizePaperSessionResumeReadiness(
        await tradeLabApi.getPaperSessionResumeReadiness(trimmedSessionId),
      )
      setPaperSessionResumeReadiness(readiness)
      return readiness
    } catch (readinessError) {
      const message = formatPaperSessionResumeReadinessError(readinessError)
      setPaperSessionResumeReadiness(null)
      setPaperSessionResumeReadinessError(message)
      return null
    } finally {
      setIsPaperSessionResumeReadinessLoading(false)
    }
  }, [])

  const loadPaperSessionDetail = useCallback(async () => {
    const sessionId = paperSessionDetailInput.trim()
    if (!sessionId) {
      const message = "Paste a paper session ID to inspect runtime artifacts."
      setPaperSessionDetailError(message)
      setPaperSessionDetail(null)
      setLoadedPaperSessionDetailInput(null)
      return null
    }

    setIsPaperSessionDetailLoading(true)
    setPaperSessionDetailError(null)
    try {
      const detail = normalizePaperSessionDetail(await tradeLabApi.getPaperSessionDetail(sessionId))
      setPaperSessionDetail(detail)
      setLoadedPaperSessionDetailInput(sessionId)
      setLoadedPaperSessionContextKey(currentPaperSessionContextKey)
      await loadPaperSessionResumeReadinessById(detail.session.sessionId)
      return detail
    } catch (detailError) {
      const message = formatPaperSessionDetailError(detailError)
      setPaperSessionDetailError(message)
      setPaperSessionDetail(null)
      setLoadedPaperSessionDetailInput(null)
      setLoadedPaperSessionContextKey(null)
      setPaperSessionResumeReadiness(null)
      return null
    } finally {
      setIsPaperSessionDetailLoading(false)
    }
  }, [currentPaperSessionContextKey, loadPaperSessionResumeReadinessById, paperSessionDetailInput])

  const loadPaperSessionDetailById = useCallback(async (
    sessionId: string,
    options: { preserveExistingDetailOnError?: boolean } = {},
  ) => {
    setPaperSessionDetailInputState(sessionId)
    setIsPaperSessionDetailLoading(true)
    setPaperSessionDetailError(null)
    try {
      const detail = normalizePaperSessionDetail(await tradeLabApi.getPaperSessionDetail(sessionId))
      setPaperSessionDetail(detail)
      setLoadedPaperSessionDetailInput(sessionId)
      setLoadedPaperSessionContextKey(currentPaperSessionContextKey)
      await loadPaperSessionResumeReadinessById(detail.session.sessionId)
      return detail
    } catch (detailError) {
      const message = formatPaperSessionDetailError(detailError)
      setPaperSessionDetailError(message)
      if (!options.preserveExistingDetailOnError) {
        setPaperSessionDetail(null)
        setLoadedPaperSessionDetailInput(null)
        setLoadedPaperSessionContextKey(null)
        setPaperSessionResumeReadiness(null)
      }
      return null
    } finally {
      setIsPaperSessionDetailLoading(false)
    }
  }, [currentPaperSessionContextKey, loadPaperSessionResumeReadinessById])

  const refreshPaperSessionObservability = useCallback(async () => {
    if (!selectedStrategy) {
      setPaperSessionObservability(null)
      setPaperSessionObservabilityError(null)
      return null
    }
    setIsPaperSessionObservabilityLoading(true)
    setPaperSessionObservabilityError(null)
    try {
      const datasetKey =
        draftRuntimeConfig.exchange && draftRuntimeConfig.symbol && draftRuntimeConfig.timeframe
          ? `${draftRuntimeConfig.exchange}:${draftRuntimeConfig.symbol}:${draftRuntimeConfig.timeframe}`
          : undefined
      const payload = normalizePaperSessionObservability(
        await tradeLabApi.listPaperSessions({
          strategyId: selectedStrategy.id,
          strategyVersionId: runVersion?.id,
          datasetKey,
          limit: 5,
        }),
      )
      setPaperSessionObservability(payload)
      return payload
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Unable to load recent paper sessions."
      setPaperSessionObservabilityError(message)
      return null
    } finally {
      setIsPaperSessionObservabilityLoading(false)
    }
  }, [
    draftRuntimeConfig.exchange,
    draftRuntimeConfig.symbol,
    draftRuntimeConfig.timeframe,
    runVersion,
    selectedStrategy,
  ])

  const loadPaperSessionDetailFromSummary = useCallback(async (sessionId: string) => {
    setPaperSessionRunLocalResult(null)
    setPaperSessionRunLocalError(null)
    return loadPaperSessionDetailById(sessionId)
  }, [loadPaperSessionDetailById])

  const refreshPaperSessionDetailAfterLocalRun = useCallback(async (sessionId: string) => {
    let latestDetail: TradeLabPaperSessionDetail | null = null
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const detail = await loadPaperSessionDetailById(sessionId, { preserveExistingDetailOnError: true })
      if (!detail) {
        break
      }
      latestDetail = detail
      const hasArtifacts =
        detail.artifacts.orders.length > 0 ||
        detail.artifacts.fills.length > 0 ||
        detail.artifacts.positions.length > 0 ||
        detail.artifacts.portfolioSnapshots.length > 0
      if (hasTerminalStatus(detail.session.status) && (hasArtifacts || detail.session.status !== "completed")) {
        break
      }
    }
    return latestDetail
  }, [loadPaperSessionDetailById])

  const runPaperSessionLocal = useCallback(async () => {
    if (paperSessionRunLocalDisabledReason || !paperSessionDetail) {
      const message = paperSessionRunLocalDisabledReason ?? "Load a queued paper session before running locally."
      setPaperSessionRunLocalError(message)
      setActionMessage(message)
      return null
    }

    const sessionId = paperSessionDetail.session.sessionId
    setIsRunningPaperSessionLocal(true)
    setPaperSessionRunLocalError(null)
    setPaperSessionRunLocalResult(null)
    setActionMessage(null)
    try {
      const result = normalizePaperSessionRunLocal(
        await tradeLabApi.runPaperSessionLocal(sessionId, {
          confirm_local_paper_run: true,
          max_candles_per_tick: 10000,
          worker_id: "strategy-lab-local-paper-run",
        }),
      )
      setPaperSessionRunLocalResult(result)
      setActionMessage(
        result.status === "completed"
          ? "Local paper run completed. Detail is refreshing."
          : `Local paper run ${result.status}: ${result.reasonCode || "unknown"}.`,
      )
      await refreshPaperSessionDetailAfterLocalRun(sessionId)
      await refreshPaperSessionObservability()
      return result
    } catch (runError) {
      const message = formatPaperSessionRunLocalError(runError)
      setPaperSessionRunLocalError(message)
      setActionMessage(message)
      return null
    } finally {
      setIsRunningPaperSessionLocal(false)
    }
  }, [
    paperSessionDetail,
    paperSessionRunLocalDisabledReason,
    refreshPaperSessionDetailAfterLocalRun,
    refreshPaperSessionObservability,
  ])

  const cancelPaperSessionLocal = useCallback(async () => {
    if (paperSessionCancelLocalDisabledReason || !paperSessionDetail) {
      const message = paperSessionCancelLocalDisabledReason ?? "Load a queued or running paper session before cancelling locally."
      setPaperSessionCancelLocalError(message)
      setActionMessage(message)
      return null
    }

    const sessionId = paperSessionDetail.session.sessionId
    setIsCancellingPaperSessionLocal(true)
    setPaperSessionCancelLocalError(null)
    setPaperSessionCancelLocalResult(null)
    setActionMessage(null)
    try {
      const result = normalizePaperSessionCancelLocal(
        await tradeLabApi.cancelPaperSessionLocal(sessionId, {
          confirm_local_paper_cancel: true,
          reason: "user_requested",
          actor: "strategy-lab-local-paper-cancel",
        }),
      )
      setPaperSessionCancelLocalResult(result)
      setActionMessage(`Local paper cancel ${result.status}: ${result.reasonCode || "unknown"}.`)
      await loadPaperSessionDetailById(sessionId)
      await refreshPaperSessionObservability()
      return result
    } catch (cancelError) {
      const message = formatPaperSessionCancelLocalError(cancelError)
      setPaperSessionCancelLocalError(message)
      setActionMessage(message)
      return null
    } finally {
      setIsCancellingPaperSessionLocal(false)
    }
  }, [
    loadPaperSessionDetailById,
    paperSessionCancelLocalDisabledReason,
    paperSessionDetail,
    refreshPaperSessionObservability,
  ])

  const retryPaperSessionLocal = useCallback(async () => {
    if (paperSessionRetryLocalDisabledReason || !paperSessionDetail) {
      const message = paperSessionRetryLocalDisabledReason ?? "Load a failed, blocked, or cancelled paper session before retrying locally."
      setPaperSessionRetryLocalError(message)
      setActionMessage(message)
      return null
    }

    const sourceSessionId = paperSessionDetail.session.sessionId
    paperSessionRetryCounterRef.current += 1
    const idempotencyKey = `strategy-lab-retry:${sourceSessionId}:${paperSessionRetryCounterRef.current}`
    setIsRetryingPaperSessionLocal(true)
    setPaperSessionRetryLocalError(null)
    setPaperSessionRetryLocalResult(null)
    setActionMessage(null)
    try {
      const result = normalizePaperSessionRetryLocal(
        await tradeLabApi.retryPaperSessionLocal(sourceSessionId, {
          confirm_local_paper_retry: true,
          idempotency_key: idempotencyKey,
          reason: "user_requested",
          actor: "strategy-lab-local-paper-retry",
        }),
      )
      setPaperSessionRetryLocalResult(result)
      setActionMessage(`Local paper retry ${result.status}: ${result.reasonCode || "unknown"}.`)
      if (result.retrySessionId) {
        await loadPaperSessionDetailById(result.retrySessionId)
      }
      await refreshPaperSessionObservability()
      return result
    } catch (retryError) {
      const message = formatPaperSessionRetryLocalError(retryError)
      setPaperSessionRetryLocalError(message)
      setActionMessage(message)
      return null
    } finally {
      setIsRetryingPaperSessionLocal(false)
    }
  }, [
    loadPaperSessionDetailById,
    paperSessionDetail,
    paperSessionRetryLocalDisabledReason,
    refreshPaperSessionObservability,
  ])

  const resumePaperSessionLocal = useCallback(async () => {
    if (paperSessionResumeLocalDisabledReason || !paperSessionDetail) {
      const message = paperSessionResumeLocalDisabledReason ?? "Load a cancelled paper session before resuming locally."
      setPaperSessionResumeLocalError(message)
      setActionMessage(message)
      return null
    }

    const sourceSessionId = paperSessionDetail.session.sessionId
    paperSessionResumeCounterRef.current += 1
    const idempotencyKey = `strategy-lab-resume:${sourceSessionId}:${paperSessionResumeCounterRef.current}`
    setIsResumingPaperSessionLocal(true)
    setPaperSessionResumeLocalError(null)
    setPaperSessionResumeLocalResult(null)
    setActionMessage(null)
    try {
      const result = normalizePaperSessionResumeLocal(
        await tradeLabApi.resumePaperSessionLocal(sourceSessionId, {
          confirm_local_paper_resume: true,
          idempotency_key: idempotencyKey,
          reason: "user_requested",
          actor: "strategy-lab-local-paper-resume",
        }),
      )
      setPaperSessionResumeLocalResult(result)
      setActionMessage(`Local paper resume ${result.status}: ${result.reasonCode || "unknown"}.`)
      await loadPaperSessionDetailById(result.resumeSessionId ?? sourceSessionId)
      await refreshPaperSessionObservability()
      return result
    } catch (resumeError) {
      const message = formatPaperSessionResumeLocalError(resumeError)
      setPaperSessionResumeLocalError(message)
      setActionMessage(message)
      return null
    } finally {
      setIsResumingPaperSessionLocal(false)
    }
  }, [
    loadPaperSessionDetailById,
    paperSessionDetail,
    paperSessionResumeLocalDisabledReason,
    refreshPaperSessionObservability,
  ])

  const startPaperSessionFromPreview = useCallback(async () => {
    if (paperSessionStartDisabledReason || !paperDraftBot || !paperSessionPreview) {
      const message = paperSessionStartDisabledReason ?? "Refresh paper session readiness before starting."
      setPaperSessionStartError(message)
      setActionMessage(message)
      return null
    }

    setIsStartingPaperSession(true)
    setPaperSessionStartError(null)
    setPaperSessionStartResult(null)
    setPaperSessionRunLocalResult(null)
    setPaperSessionRunLocalError(null)
    setPaperSessionCancelLocalResult(null)
    setPaperSessionCancelLocalError(null)
    setPaperSessionRetryLocalResult(null)
    setPaperSessionRetryLocalError(null)
    setActionMessage(null)
    try {
      paperSessionStartCounterRef.current += 1
      const idempotencyKey = [
        "strategy-lab",
        paperDraftBot.id,
        paperSessionPreview.datasetContext.datasetKey,
        paperSessionPreview.datasetContext.startAt,
        paperSessionPreview.datasetContext.endAt,
        paperSessionStartCounterRef.current,
      ].join(":")
      const result = normalizePaperSessionStart(
        await tradeLabApi.startPaperSession({
          bot_id: paperDraftBot.id,
          exchange: draftRuntimeConfig.exchange,
          symbol: draftRuntimeConfig.symbol,
          timeframe: draftRuntimeConfig.timeframe,
          start_at: draftRuntimeConfig.startAt,
          end_at: draftRuntimeConfig.endAt,
          starting_cash: draftRuntimeConfig.initialEquity,
          idempotency_key: idempotencyKey,
          confirm_start: true,
          risk_policy_override: {
            startingCash: draftRuntimeConfig.initialEquity,
            maxOrderPercent: draftRiskConfig.maxOrderPercent,
            maxPositionPercent: draftRiskConfig.maxPositionPercent,
            maxDrawdownPercent: draftRiskConfig.maxDrawdownPercent,
            minNotional: draftRiskConfig.minNotional,
          },
          source: "strategy_lab",
          actor: "local-user",
        }),
      )

      setPaperSessionStartResult(result)
      if (result.sessionId) {
        setLatestPaperSessionId(result.sessionId)
        await loadPaperSessionDetailById(result.sessionId)
        await refreshPaperSessionObservability()
      }
      setActionMessage(
        result.sessionId
          ? `Paper session queued: ${result.sessionId}. Engine execution remains locked.`
          : result.reasonCode || "Paper session start was blocked.",
      )
      return result
    } catch (startError) {
      const message = formatPaperSessionStartError(startError)
      setPaperSessionStartError(message)
      setActionMessage(message)
      return null
    } finally {
      setIsStartingPaperSession(false)
    }
  }, [
    draftRiskConfig,
    draftRuntimeConfig,
    loadPaperSessionDetailById,
    paperDraftBot,
    paperSessionPreview,
    paperSessionStartDisabledReason,
    refreshPaperSessionObservability,
  ])

  const loadTradeExecutionDetail = useCallback(async (runId: string, tradeId: string) => {
    const detail = normalizeSelectedTradeExecutionDetail(await tradeLabApi.getBotRunTradeDetail(runId, tradeId))
    setSelectedTradeExecutionDetail(detail)
    return detail
  }, [])

  const selectAnalyzedTrade = useCallback(
    async (tradeId: string | null, runId: string | null = activeRunIdRef.current) => {
      setSelectedAnalyzedTradeId(tradeId)
      if (!tradeId || !runId) {
        setSelectedTradeExecutionDetail(null)
        setSelectedTrade(null)
        return null
      }
      const detail = await loadTradeExecutionDetail(runId, tradeId)
      const marker = chartData?.markers.find((item) => item.tradeOrderId === tradeId) ?? null
      setSelectedTrade(
        marker
          ? {
              marker,
              order: null,
              signal: marker.signal ?? null,
              logs: [],
            }
          : null,
      )
      return detail
    },
    [chartData, loadTradeExecutionDetail],
  )

  const loadInitialWorkspace = useCallback(async () => {
    setIsLoading(true)
    setError(null)

    try {
      const [groupPayload, strategyPayload, botPayload] = await Promise.all([
        tradeLabApi.listStrategyGroups(),
        tradeLabApi.listStrategies(),
        tradeLabApi.listBots(),
      ])
      const strategyRows = (strategyPayload.items ?? []).map(normalizeStrategySummary)
      const nextGroups = sortStrategyGroupsForWorkbench(
        (groupPayload.items ?? []).map((row) =>
          normalizeStrategyGroupSummary(row, strategyRows),
        ),
      )
      const nextBots = (botPayload.items ?? []).map(normalizeBotSummary)
      const initialGroupId = getDefaultWorkbenchGroupId(nextGroups)
      const initialStrategies = initialGroupId
        ? sortStrategies(strategyRows.filter((strategy) => strategy.strategyGroupId === initialGroupId))
        : []
      const initialStrategyId = initialStrategies[0]?.id ?? null

      setGroups(nextGroups)
      setStrategies(initialStrategies)
      setBots(nextBots)
      setSelectedGroupId(initialGroupId)
      setSelectedStrategyId(initialStrategyId)
      loadedGroupIdRef.current = initialGroupId
      loadedStrategyIdRef.current = null

      await refreshDatasetCoverage()

      if (initialStrategyId) {
        await refreshRunHistory(initialStrategyId)
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "TradeLab failed to load.")
      setGroups([])
      setStrategies([])
      setBots([])
      setSelectedGroupId(null)
      setSelectedStrategyId(null)
      setSelectedStrategy(null)
      setExecution(null)
      setChartData(null)
      setSelectedTrade(null)
      setRunAnalysis(null)
      setSelectedAnalyzedTradeId(null)
      setSelectedTradeExecutionDetail(null)
      setRunHistory([])
      setActivePipeline(null)
      setJobVisibility(null)
      setJobVisibilityError(null)
      setDatasetCoverage([])
      setDatasetCoverageError(null)
      setDatasetFillPreview(null)
      setDatasetFillPreviewError(null)
      setPaperSessionPreview(null)
      setPaperSessionPreviewError(null)
      setPaperSessionObservability(null)
      setPaperSessionObservabilityError(null)
      setPaperKillSwitchStatus(null)
      setPaperKillSwitchStatusError(null)
      resetPaperSessionDetail()
      resetPaperSessionDetail()
      setLocalFillAudit(null)
      setLocalFillAuditError(null)
      setFillJobVisibility(null)
      setFillJobVisibilityError(null)
      setDraftSource("")
      setValidationCheck(null)
      setValidationCheckSource(null)
      setCompareBaseRunId(null)
      setCompareRunId(null)
      setCompareAnalysis(null)
      setIsComparePickerOpen(false)
    } finally {
      setIsLoading(false)
    }
  }, [refreshDatasetCoverage, refreshRunHistory, resetPaperSessionDetail])

  const loadStrategiesForGroup = useCallback(async (groupId: string) => {
    setError(null)
    const payload = await tradeLabApi.listStrategies(groupId)
    const nextStrategies = sortStrategies((payload.items ?? []).map(normalizeStrategySummary))

    setStrategies(nextStrategies)
    loadedGroupIdRef.current = groupId
    setSelectedStrategyId((current) =>
      current && nextStrategies.some((strategy) => strategy.id === current)
        ? current
        : nextStrategies[0]?.id ?? null,
    )
  }, [])

  const loadStrategyDetail = useCallback(
    async (strategyId: string) => {
      setError(null)
      const detail = normalizeStrategyDetail(await tradeLabApi.getStrategy(strategyId))
      setSelectedStrategy(detail)
      setExecution(null)
      setActivePipeline(null)
      setJobVisibility(null)
      setJobVisibilityError(null)
      setDatasetFillPreview(null)
      setDatasetFillPreviewError(null)
      setPaperSessionPreview(null)
      setPaperSessionPreviewError(null)
      setLiveOrderPreview(null)
      setLiveOrderPreviewError(null)
      setLiveOrderDetail(null)
      setLiveOrderDetailError(null)
      setLiveOrderList(null)
      setLiveOrderListError(null)
      setLiveOrderSubmitResult(null)
      setLiveOrderSubmitError(null)
      setIsSubmittingLiveOrder(false)
      setLiveOrderCancelResult(null)
      setLiveOrderCancelError(null)
      setIsCancellingLiveOrder(false)
      setLiveOrderReconcileResult(null)
      setLiveOrderReconcileError(null)
      setIsReconcilingLiveOrder(false)
      setLiveOrderJournalProjectionResult(null)
      setLiveOrderJournalProjectionError(null)
      setIsProjectingLiveOrderToJournal(false)
      setIsLiveOrderPreviewLoading(false)
      setIsLiveOrderDetailLoading(false)
      setIsLiveOrderListLoading(false)
      resetPaperSessionDetail()
      setLocalFillAudit(null)
      setLocalFillAuditError(null)
      setFillJobVisibility(null)
      setFillJobVisibilityError(null)
      setChartData(null)
      setSelectedTrade(null)
      setRunAnalysis(null)
      setSelectedAnalyzedTradeId(null)
      setSelectedTradeExecutionDetail(null)
      setPreflightResult(null)
      setIsPreflightOpen(false)
      setPendingBacktestRequest(null)
      setCompareBaseRunId(null)
      setCompareRunId(null)
      setCompareAnalysis(null)
      setIsComparePickerOpen(false)
      setDraftRuntimeConfig(detail.runtimeConfig)
      setDraftRiskConfig(detail.riskConfig)
      setDraftSource(
        detail.versions.find((item) => item.id === detail.currentVersionId)?.sourceCode ??
          detail.versions[0]?.sourceCode ??
          "",
      )
      setValidationCheck(null)
      setValidationCheckSource(null)
      setViewedStrategyVersionId(detail.currentVersionId ?? detail.versions[0]?.id ?? null)
      loadedStrategyIdRef.current = strategyId
      await refreshRunHistory(strategyId)
      await refreshJobVisibility(strategyId)
    },
    [refreshJobVisibility, refreshRunHistory, resetPaperSessionDetail],
  )

  useEffect(() => {
    if (!selectedStrategy) {
      return
    }
    const timer = window.setTimeout(() => {
      void refreshLocalFillAudit()
    }, 0)
    return () => {
      window.clearTimeout(timer)
    }
  }, [refreshLocalFillAudit, selectedStrategy])

  useEffect(() => {
    if (!selectedStrategy) {
      return
    }
    const timer = window.setTimeout(() => {
      void refreshFillJobVisibility()
    }, 0)
    return () => {
      window.clearTimeout(timer)
    }
  }, [refreshFillJobVisibility, selectedStrategy])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshFillSchedulerStatus()
      void refreshPaperSchedulerStatus()
    }, 0)
    return () => {
      window.clearTimeout(timer)
    }
  }, [refreshFillSchedulerStatus, refreshPaperSchedulerStatus])

  const loadRunState = useCallback(async (runId: string) => {
    const [runDetailPayload, pipelinePayload, chartPayload, logsPayload, ordersPayload, resultPayload, analysisPayload, benchmarkPayload] = await Promise.all([
      tradeLabApi.getBotRun(runId),
      tradeLabApi.getBotRunPipeline(runId),
      tradeLabApi.getBotRunChart(runId, selectedTrade?.marker.tradeOrderId ?? null),
      tradeLabApi.getBotRunLogs(runId),
      tradeLabApi.getBotRunOrders(runId),
      tradeLabApi.getBotRunResult(runId),
      tradeLabApi.getBotRunAnalysis(runId),
      tradeLabApi.getBenchmarkChecks(runId),
    ])

    const normalizedRun = normalizeRunDetail(runDetailPayload)
    const normalizedPipeline = normalizeRunPipeline(pipelinePayload)
    const normalizedChart = normalizeRunChart(chartPayload)
    const normalizedAnalysis = normalizeRunAnalysis(analysisPayload)
    const normalizedBenchmarkCheck = benchmarkPayload.latest ? normalizeBenchmarkCheck(benchmarkPayload.latest) : null
    const normalizedExecution = normalizeBacktestExecution({
      bot_run: runDetailPayload,
      logs: logsPayload.items ?? [],
      trade_orders: ordersPayload.items ?? [],
      result: resultPayload,
      status: normalizedRun.status,
    })

    setManualSignalPackage(null)
    setManualSignalPackageError(null)
    setResearchRobustnessGate(null)
    setResearchRobustnessGateError(null)
    setExecutionJournal(null)
    setExecutionJournalError(null)
    setExecution(normalizedExecution)
    setActivePipeline(normalizedPipeline ?? normalizedRun.pipeline ?? null)
    setChartData(normalizedChart)
    setSelectedTrade(normalizedChart.selectedTrade)
    setRunAnalysis(normalizedAnalysis)
    setBenchmarkCheck(normalizedBenchmarkCheck)
    if (normalizedRun.snapshot?.sourceSnapshot && typeof normalizedRun.snapshot.sourceSnapshot.sourceCode === "string") {
      setDraftSource(String(normalizedRun.snapshot.sourceSnapshot.sourceCode))
      setValidationCheck(null)
      setValidationCheckSource(null)
    }
    if (normalizedRun.snapshot?.datasetContext) {
      const runtime = normalizedRun.snapshot.datasetContext as Record<string, unknown>
      setDraftRuntimeConfig((current) => ({
        ...current,
        exchange: typeof runtime.exchange === "string" ? runtime.exchange : current.exchange,
        symbol: typeof runtime.symbol === "string" ? runtime.symbol : current.symbol,
        timeframe: typeof runtime.timeframe === "string" ? runtime.timeframe : current.timeframe,
        startAt: typeof runtime.requestedStartAt === "string" ? runtime.requestedStartAt : current.startAt,
        endAt: typeof runtime.requestedEndAt === "string" ? runtime.requestedEndAt : current.endAt,
      }))
    }
    activeRunIdRef.current = runId
    setActionMessage(normalizedRun.errorMessage ?? normalizedPipeline?.message ?? null)
    setCompareBaseRunId(null)
    setCompareRunId(null)
    setCompareAnalysis(null)
    setIsComparePickerOpen(false)
    let detailForRun = selectedStrategy
    if (selectedStrategyId !== normalizedRun.strategyId) {
      setSelectedStrategyId(normalizedRun.strategyId)
      const detail = normalizeStrategyDetail(await tradeLabApi.getStrategy(normalizedRun.strategyId))
      setSelectedStrategy(detail)
      detailForRun = detail
    }
    setViewedStrategyVersionId(
      detailForRun?.versions.some((item) => item.id === normalizedRun.strategyVersionId)
        ? normalizedRun.strategyVersionId
        : detailForRun?.currentVersionId ?? detailForRun?.versions[0]?.id ?? null,
    )
    const nextSelectedTradeId =
      selectedAnalyzedTradeId && normalizedAnalysis?.trades.some((trade) => trade.id === selectedAnalyzedTradeId)
        ? selectedAnalyzedTradeId
        : normalizedAnalysis?.trades[0]?.id ?? null
    await selectAnalyzedTrade(nextSelectedTradeId, runId)
    await refreshRunHistory(normalizedRun.strategyId)
  }, [
    refreshRunHistory,
    selectedStrategy,
    selectedStrategyId,
    selectedTrade?.marker.tradeOrderId,
    selectedAnalyzedTradeId,
    selectAnalyzedTrade,
  ])

  const startBenchmarkRepeat = useCallback(async () => {
    const baseRunId = runAnalysis?.run.id
    if (!baseRunId) {
      return
    }
    setIsStartingBenchmarkRepeat(true)
    setError(null)
    try {
      const check = normalizeBenchmarkCheck(await tradeLabApi.startBenchmarkRepeat(baseRunId))
      setBenchmarkCheck(check)
      setActionMessage("Benchmark repeat queued.")
      await refreshRunHistory(selectedStrategyId ?? undefined)
    } catch (caught) {
      const message = caught instanceof ApiError ? caught.message : "Unable to start benchmark repeat."
      setError(message)
    } finally {
      setIsStartingBenchmarkRepeat(false)
    }
  }, [refreshRunHistory, runAnalysis?.run.id, selectedStrategyId])

  const createManualSignalPackage = useCallback(async () => {
    if (runAnalysis?.run.status !== "completed") {
      setManualSignalPackageError("Load a completed run before generating a signal package.")
      return
    }
    setIsCreatingManualSignalPackage(true)
    setManualSignalPackageError(null)
    try {
      const payload = await tradeLabApi.createManualSignalPackage(runAnalysis.run.id)
      setManualSignalPackage(normalizeManualSignalPackage(payload))
    } catch (error) {
      setManualSignalPackageError(error instanceof Error ? error.message : "Unable to generate manual signal package.")
    } finally {
      setIsCreatingManualSignalPackage(false)
    }
  }, [runAnalysis])

  const createResearchRobustnessGate = useCallback(async () => {
    if (runAnalysis?.run.status !== "completed") {
      setResearchRobustnessGateError("Load a completed run before generating robustness evidence.")
      return
    }
    setIsCreatingResearchRobustnessGate(true)
    setResearchRobustnessGateError(null)
    try {
      const payload = await tradeLabApi.createResearchRobustnessGate(runAnalysis.run.id)
      setResearchRobustnessGate(normalizeResearchRobustnessGate(payload))
    } catch (error) {
      setResearchRobustnessGateError(error instanceof Error ? error.message : "Unable to generate robustness evidence.")
    } finally {
      setIsCreatingResearchRobustnessGate(false)
    }
  }, [runAnalysis])

  const loadExecutionJournalEntries = useCallback(async (runId: string) => {
    setIsExecutionJournalLoading(true)
    setExecutionJournalError(null)
    try {
      const list = normalizeExecutionJournalList(await tradeLabApi.listExecutionJournalEntries(runId))
      setExecutionJournal(list)
      return list
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load execution journal."
      setExecutionJournal(null)
      setExecutionJournalError(message)
      return null
    } finally {
      setIsExecutionJournalLoading(false)
    }
  }, [])

  const createExecutionJournalEntry = useCallback(async (
    runId: string,
    request: TradeLabExecutionJournalEntryRequest,
  ) => {
    setIsSavingExecutionJournalEntry(true)
    setExecutionJournalError(null)
    try {
      const entry = normalizeExecutionJournalEntry(await tradeLabApi.createExecutionJournalEntry(runId, request))
      await loadExecutionJournalEntries(runId)
      return entry
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save execution journal entry."
      setExecutionJournalError(message)
      return null
    } finally {
      setIsSavingExecutionJournalEntry(false)
    }
  }, [loadExecutionJournalEntries])

  const updateExecutionJournalEntry = useCallback(async (
    entryId: string,
    request: TradeLabExecutionJournalEntryRequest,
  ) => {
    setIsSavingExecutionJournalEntry(true)
    setExecutionJournalError(null)
    try {
      const entry = normalizeExecutionJournalEntry(await tradeLabApi.updateExecutionJournalEntry(entryId, request))
      await loadExecutionJournalEntries(entry.sourceRunId)
      return entry
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update execution journal entry."
      setExecutionJournalError(message)
      return null
    } finally {
      setIsSavingExecutionJournalEntry(false)
    }
  }, [loadExecutionJournalEntries])

  const deleteExecutionJournalEntry = useCallback(async (entry: TradeLabExecutionJournalEntry) => {
    setIsSavingExecutionJournalEntry(true)
    setExecutionJournalError(null)
    try {
      await tradeLabApi.deleteExecutionJournalEntry(entry.entryId)
      await loadExecutionJournalEntries(entry.sourceRunId)
      return true
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to delete execution journal entry."
      setExecutionJournalError(message)
      return false
    } finally {
      setIsSavingExecutionJournalEntry(false)
    }
  }, [loadExecutionJournalEntries])

  const projectTestnetOrderToJournal = useCallback(async () => {
    if (!selectedTestnetIntent || !canProjectTestnetOrderToJournal) {
      const message = "Load a terminal completed-run-backed testnet order before projecting to journal."
      setTestnetOrderJournalProjectionError(message)
      setActionMessage(message)
      return null
    }
    setIsProjectingTestnetOrderToJournal(true)
    setTestnetOrderJournalProjectionError(null)
    setActionMessage(null)
    try {
      const payload = normalizeTestnetOrderJournalProjectionResult(
        await tradeLabApi.projectTestnetOrderToJournal(selectedTestnetIntent.intentId, {
          confirmTestnetJournalProjection: true,
          source: "strategy_lab",
          actor: "local-user",
        }),
      )
      setTestnetOrderJournalProjectionResult(payload)
      await loadTestnetOrderDetail(selectedTestnetIntent.intentId)
      if (runAnalysis?.run.id) {
        await loadExecutionJournalEntries(runAnalysis.run.id)
      }
      setActionMessage(`Projected assisted testnet order to journal: ${payload.reasonCode}.`)
      return payload
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to project assisted testnet order to journal."
      setTestnetOrderJournalProjectionError(message)
      setActionMessage(message)
      return null
    } finally {
      setIsProjectingTestnetOrderToJournal(false)
    }
  }, [canProjectTestnetOrderToJournal, loadExecutionJournalEntries, loadTestnetOrderDetail, runAnalysis, selectedTestnetIntent])

  useEffect(() => {
    const runId = runAnalysis?.run.status === "completed" ? runAnalysis.run.id : null
    if (!runId) {
      return
    }
    const timer = window.setTimeout(() => {
      void loadExecutionJournalEntries(runId)
    }, 0)
    return () => {
      window.clearTimeout(timer)
    }
  }, [loadExecutionJournalEntries, runAnalysis?.run.id, runAnalysis?.run.status])

  const updateDraftSource = useCallback((sourceCode: string) => {
    setDraftSource(sourceCode)
  }, [])

  const checkSyntax = useCallback(async () => {
    setIsCheckingSyntax(true)
    setActionMessage(null)
    try {
      const check = normalizeStrategyValidationCheck(await tradeLabApi.validateStrategySource(draftSource))
      setValidationCheck(check)
      setValidationCheckSource(draftSource)
    } catch (checkError) {
      setValidationCheck({
        validationStatus: "invalid",
        validationMessage: checkError instanceof Error ? checkError.message : "TradeLab syntax check failed.",
        line: null,
        column: null,
      })
      setValidationCheckSource(draftSource)
    } finally {
      setIsCheckingSyntax(false)
    }
  }, [draftSource])

  const saveStrategySettings = useCallback(
    async (runtimeConfig: TradeLabRuntimeConfig, riskConfig: TradeLabRiskConfig) => {
      if (!selectedStrategy) return
      setIsSavingSettings(true)
      setActionMessage(null)
      try {
        await tradeLabApi.updateStrategy(selectedStrategy.id, {
          runtime_config: runtimeConfig,
          risk_config: riskConfig,
        })
        const refreshed = normalizeStrategyDetail(await tradeLabApi.getStrategy(selectedStrategy.id))
        setSelectedStrategy(refreshed)
        setDraftRuntimeConfig(refreshed.runtimeConfig)
        setDraftRiskConfig(refreshed.riskConfig)
        setDraftSource(
          refreshed.versions.find((item) => item.id === refreshed.currentVersionId)?.sourceCode ??
            refreshed.versions[0]?.sourceCode ??
            "",
        )
        setValidationCheck(null)
        setValidationCheckSource(null)
        setViewedStrategyVersionId(refreshed.currentVersionId ?? refreshed.versions[0]?.id ?? null)
        setActionMessage("Strategy settings saved to TradeLab.")
      } catch (saveError) {
        setActionMessage(saveError instanceof Error ? saveError.message : "Could not save strategy settings.")
      } finally {
        setIsSavingSettings(false)
      }
    },
    [selectedStrategy],
  )

  const createVersion = useCallback(async () => {
    if (!selectedStrategy) return
    setIsSavingVersion(true)
    setActionMessage(null)
    try {
      await tradeLabApi.createStrategyVersion(selectedStrategy.id, draftSource)
      const refreshed = normalizeStrategyDetail(await tradeLabApi.getStrategy(selectedStrategy.id))
      setSelectedStrategy(refreshed)
      setDraftRuntimeConfig(refreshed.runtimeConfig)
      setDraftRiskConfig(refreshed.riskConfig)
      setDraftSource(
        refreshed.versions.find((item) => item.id === refreshed.currentVersionId)?.sourceCode ??
          refreshed.versions[0]?.sourceCode ??
          "",
      )
      setValidationCheck(null)
      setValidationCheckSource(null)
      setViewedStrategyVersionId(refreshed.currentVersionId ?? refreshed.versions[0]?.id ?? null)
      setActionMessage("Strategy version created from backend validation.")
      await refreshRunHistory(refreshed.id)
    } catch (versionError) {
      setActionMessage(versionError instanceof Error ? versionError.message : "Could not create strategy version.")
    } finally {
      setIsSavingVersion(false)
    }
  }, [draftSource, refreshRunHistory, selectedStrategy])

  const savePaperDraft = useCallback(async () => {
    if (!selectedStrategy || !runVersion) {
      return
    }
    setIsSavingPaperDraft(true)
    setActionMessage(null)
    try {
      const createdBot = normalizeBotSummary(
        await tradeLabApi.createBot({
          strategy_id: selectedStrategy.id,
          strategy_version_id: runVersion.id,
          name: `${selectedStrategy.name} paper draft`,
          mode: "paper",
          status: "draft",
          symbol: draftRuntimeConfig.symbol,
          timeframe: draftRuntimeConfig.timeframe,
          runtime_config: {
            exchange: draftRuntimeConfig.exchange,
            symbol: draftRuntimeConfig.symbol,
            timeframe: draftRuntimeConfig.timeframe,
            start_at: draftRuntimeConfig.startAt,
            end_at: draftRuntimeConfig.endAt,
            initial_equity: draftRuntimeConfig.initialEquity,
            fee_bps: draftRuntimeConfig.feeBps,
            slippage_bps: draftRuntimeConfig.slippageBps,
          },
          risk_config: {
            max_order_percent: draftRiskConfig.maxOrderPercent,
            max_position_percent: draftRiskConfig.maxPositionPercent,
            min_notional: draftRiskConfig.minNotional,
            max_drawdown_percent: draftRiskConfig.maxDrawdownPercent,
          },
          metadata: buildCredentialBoundaryMetadata(draftCredentialBoundaryChecks),
        }),
      )
      setBots((current) => [...current, createdBot])
      setActionMessage("Paper draft saved. Paper execution remains locked.")
    } catch (saveError) {
      setActionMessage(saveError instanceof ApiError ? saveError.message : "Could not save paper draft.")
    } finally {
      setIsSavingPaperDraft(false)
    }
  }, [draftCredentialBoundaryChecks, draftRiskConfig, draftRuntimeConfig, runVersion, selectedStrategy])

  const ensureBacktestBot = useCallback(async () => {
    if (!selectedStrategy || !activeStrategyVersion) {
      return null
    }

    const draftMarketType = draftRuntimeConfig.marketType ?? "SPOT"
    const draftDefaultLeverage =
      draftMarketType === "USD_M_FUTURES" ? Math.max(1, Number(draftRuntimeConfig.defaultLeverage ?? 1)) : 1

    const existingBot = bots.find(
      (bot) =>
        bot.strategyId === selectedStrategy.id &&
        bot.strategyVersionId === activeStrategyVersion.id &&
        bot.mode === "backtest" &&
        bot.symbol === draftRuntimeConfig.symbol &&
        bot.timeframe === draftRuntimeConfig.timeframe &&
        (bot.runtimeConfig.marketType ?? "SPOT") === draftMarketType &&
        ((bot.runtimeConfig.marketType ?? "SPOT") !== "USD_M_FUTURES" ||
          Math.max(1, Number(bot.runtimeConfig.defaultLeverage ?? 1)) === draftDefaultLeverage),
    )
    if (existingBot) {
      return existingBot
    }

    const createdBot = normalizeBotSummary(
      await tradeLabApi.createBot({
        strategy_id: selectedStrategy.id,
        strategy_version_id: activeStrategyVersion.id,
        name: `${selectedStrategy.name} backtest bot`,
        symbol: draftRuntimeConfig.symbol,
        timeframe: draftRuntimeConfig.timeframe,
        runtime_config: {
          exchange: draftRuntimeConfig.exchange,
          symbol: draftRuntimeConfig.symbol,
          timeframe: draftRuntimeConfig.timeframe,
          marketType: draftMarketType,
          ...(draftMarketType === "USD_M_FUTURES" ? { defaultLeverage: draftDefaultLeverage } : {}),
        },
        risk_config: {
          max_order_percent: draftRiskConfig.maxOrderPercent,
          max_position_percent: draftRiskConfig.maxPositionPercent,
          min_notional: draftRiskConfig.minNotional,
          max_drawdown_percent: draftRiskConfig.maxDrawdownPercent,
        },
      }),
    )
    setBots((current) => [...current, createdBot])
    return createdBot
  }, [activeStrategyVersion, bots, draftRiskConfig, draftRuntimeConfig, selectedStrategy])

  const buildBacktestRequest = useCallback(() => {
    return {
      exchange: draftRuntimeConfig.exchange,
      symbol: draftRuntimeConfig.symbol,
      timeframe: draftRuntimeConfig.timeframe,
      start_at: draftRuntimeConfig.startAt,
      end_at: draftRuntimeConfig.endAt,
      initial_equity: draftRuntimeConfig.initialEquity,
      fee_bps: draftRuntimeConfig.feeBps,
      slippage_bps: draftRuntimeConfig.slippageBps,
      max_order_percent: draftRiskConfig.maxOrderPercent,
      max_position_percent: draftRiskConfig.maxPositionPercent,
      min_notional: draftRiskConfig.minNotional,
      max_drawdown_percent: draftRiskConfig.maxDrawdownPercent,
    }
  }, [draftRiskConfig, draftRuntimeConfig])

  const refreshDatasetPreflight = useCallback(async () => {
    const bot = await ensureBacktestBot()
    if (!bot) {
      return null
    }
    const request = buildBacktestRequest()
    const preflight = normalizePreflightResult(await tradeLabApi.preflightBotBacktest(bot.id, request))
    setPreflightResult(preflight)
    setPendingBacktestRequest(request)
    return preflight
  }, [buildBacktestRequest, ensureBacktestBot])

  const confirmDatasetLocalFill = useCallback(async () => {
    if (!selectedStrategy) {
      const message = "Select a strategy before confirming local dataset fill."
      setDatasetLocalFillError(message)
      setActionMessage(message)
      return null
    }
    if (!datasetFillPreview) {
      const message = "Preview dataset fill before confirming local fill."
      setDatasetLocalFillError(message)
      setActionMessage(message)
      return null
    }
    if (!isDatasetLocalFillConfirmed) {
      const message = "Confirm local/dev dataset write before submitting."
      setDatasetLocalFillError(message)
      setActionMessage(message)
      return null
    }
    setIsFillingDatasetLocal(true)
    setDatasetLocalFillError(null)
    setDatasetLocalFillResult(null)
    setActionMessage(null)
    try {
      const result = normalizeDatasetLocalFillResult(
        await tradeLabApi.fillDatasetLocal({
          strategy_id: selectedStrategy.id,
          exchange: datasetFillPreview.exchange,
          symbol: datasetFillPreview.symbol,
          timeframe: datasetFillPreview.timeframe,
          requested_start_at: datasetFillPreview.requestedRange.startAt,
          requested_end_at: datasetFillPreview.requestedRange.endAt,
          preview_id: datasetFillPreview.previewId,
          request_fingerprint: datasetFillPreview.requestFingerprint,
          confirm_local_fill: true,
          source: "strategy_lab",
        }),
      )
      setDatasetLocalFillResult(result)
      setIsDatasetLocalFillConfirmed(false)
      setActionMessage(`Local dataset fill completed: ${result.rowsInserted} rows inserted.`)
      await previewDatasetFillPlan()
      setDatasetLocalFillResult(result)
      await refreshDatasetPreflight()
      await refreshJobVisibility(selectedStrategy.id)
      await refreshLocalFillAudit({
        exchange: result.datasetKey.split(":")[0] || datasetFillPreview.exchange,
        symbol: datasetFillPreview.symbol,
        timeframe: datasetFillPreview.timeframe,
      })
      await refreshFillJobVisibility({ datasetKey: result.datasetKey })
      return result
    } catch (fillError) {
      const message = formatDatasetLocalFillError(fillError)
      setDatasetLocalFillError(message)
      setIsDatasetLocalFillConfirmed(false)
      setActionMessage(message)
      await refreshLocalFillAudit({
        exchange: datasetFillPreview.exchange,
        symbol: datasetFillPreview.symbol,
        timeframe: datasetFillPreview.timeframe,
      })
      await refreshFillJobVisibility({
        exchange: datasetFillPreview.exchange,
        symbol: datasetFillPreview.symbol,
        timeframe: datasetFillPreview.timeframe,
      })
      return null
    } finally {
      setIsFillingDatasetLocal(false)
    }
  }, [
    datasetFillPreview,
    isDatasetLocalFillConfirmed,
    previewDatasetFillPlan,
    refreshDatasetPreflight,
    refreshFillJobVisibility,
    refreshJobVisibility,
    refreshLocalFillAudit,
    selectedStrategy,
  ])

  const queueDatasetFillLocal = useCallback(async () => {
    if (!selectedStrategy) {
      const message = "Select a strategy before queueing background fill."
      setDatasetFillEnqueueError(message)
      setActionMessage(message)
      return null
    }
    if (!datasetFillPreview) {
      const message = "Preview dataset fill before queueing background fill."
      setDatasetFillEnqueueError(message)
      setActionMessage(message)
      return null
    }
    if (!isDatasetLocalFillConfirmed) {
      const message = "Confirm local/dev dataset fill before queueing."
      setDatasetFillEnqueueError(message)
      setActionMessage(message)
      return null
    }
    setIsEnqueueingDatasetFill(true)
    setDatasetFillEnqueueResult(null)
    setDatasetFillEnqueueError(null)
    setActionMessage(null)
    try {
      const result = normalizeDatasetFillEnqueueResult(
        await tradeLabApi.enqueueDatasetFillLocal({
          strategy_id: selectedStrategy.id,
          exchange: datasetFillPreview.exchange,
          symbol: datasetFillPreview.symbol,
          timeframe: datasetFillPreview.timeframe,
          requested_start_at: datasetFillPreview.requestedRange.startAt,
          requested_end_at: datasetFillPreview.requestedRange.endAt,
          preview_id: datasetFillPreview.previewId,
          request_fingerprint: datasetFillPreview.requestFingerprint,
          missing_ranges: datasetFillPreview.missingRanges.map((range) => ({
            start_at: range.startAt,
            end_at: range.endAt,
            kind: range.kind,
          })),
          confirm_local_fill: true,
          source: "strategy_lab",
        }),
      )
      setDatasetFillEnqueueResult(result)
      setIsDatasetLocalFillConfirmed(false)
      setActionMessage(`Background fill queued: ${result.jobId.slice(0, 8)}.`)
      await refreshFillJobVisibility({ datasetKey: result.datasetKey })
      return result
    } catch (enqueueError) {
      const message = formatDatasetFillEnqueueError(enqueueError)
      setDatasetFillEnqueueError(message)
      setActionMessage(message)
      await refreshFillJobVisibility({
        exchange: datasetFillPreview.exchange,
        symbol: datasetFillPreview.symbol,
        timeframe: datasetFillPreview.timeframe,
      })
      return null
    } finally {
      setIsEnqueueingDatasetFill(false)
    }
  }, [
    datasetFillPreview,
    isDatasetLocalFillConfirmed,
    refreshFillJobVisibility,
    selectedStrategy,
  ])

  const runBacktest = useCallback(async () => {
    if (runDisabledReason) {
      setActionMessage(runDisabledReason)
      return
    }
    if (!selectedStrategy || !runVersion) return
    setIsRunningBacktest(true)
    setActionMessage(null)
    setCompareBaseRunId(null)
    setCompareRunId(null)
    setCompareAnalysis(null)
    setIsComparePickerOpen(false)

    try {
      const bot = await ensureBacktestBot()
      if (!bot) {
        return
      }
      const request = buildBacktestRequest()
      const preflight = normalizePreflightResult(await tradeLabApi.preflightBotBacktest(bot.id, request))
      setPreflightResult(preflight)
      setPendingBacktestRequest(request)
      setIsPreflightOpen(true)
      setActionMessage(preflight?.outcome === "ready" ? "Preflight complete." : "Preflight requires action.")
    } catch (runError) {
      setActionMessage(runError instanceof ApiError ? runError.message : "TradeLab preflight failed.")
    } finally {
      setIsRunningBacktest(false)
    }
  }, [buildBacktestRequest, ensureBacktestBot, runDisabledReason, runVersion, selectedStrategy])

  const confirmBacktest = useCallback(async () => {
    if (!selectedStrategy || !activeStrategyVersion || !pendingBacktestRequest) {
      return
    }
    setIsRunningBacktest(true)
    setActionMessage(null)
    setCompareBaseRunId(null)
    setCompareRunId(null)
    setCompareAnalysis(null)
    setIsComparePickerOpen(false)

    try {
      const bot = await ensureBacktestBot()
      if (!bot) {
        return
      }
      const pipeline = normalizeRunPipeline(await tradeLabApi.startBotBacktest(bot.id, pendingBacktestRequest))
      setActivePipeline(pipeline)
      activeRunIdRef.current = pipeline?.run.id ?? null
      setLatestCurrentRunId(pipeline?.run.id ?? null)
      setPreflightResult(pipeline?.preflight ?? preflightResult)
      setIsPreflightOpen(false)
      setPendingBacktestRequest(null)
      setActionMessage(pipeline?.message ?? "Backtest queued.")
      if (pipeline?.run?.strategyId) {
        await refreshRunHistory(pipeline.run.strategyId)
        await refreshJobVisibility(pipeline.run.strategyId)
      }
      if (pipeline?.run?.id && hasTerminalStatus(pipeline.status)) {
        await loadRunState(pipeline.run.id)
      }
    } catch (runError) {
      setActionMessage(runError instanceof ApiError ? runError.message : "TradeLab backtest failed.")
    } finally {
      setIsRunningBacktest(false)
    }
  }, [activeStrategyVersion, ensureBacktestBot, pendingBacktestRequest, preflightResult, refreshJobVisibility, refreshRunHistory, loadRunState, selectedStrategy])

  const cancelPreflight = useCallback(() => {
    setIsPreflightOpen(false)
    setPendingBacktestRequest(null)
  }, [])

  const selectGroup = useCallback((groupId: string) => {
    setSelectedGroupId((current) => {
      if (current === groupId) {
        return current
      }
      setError(null)
      setSelectedStrategyId(null)
      setSelectedStrategy(null)
      setViewedStrategyVersionId(null)
      setExecution(null)
      setActivePipeline(null)
      setJobVisibility(null)
      setJobVisibilityError(null)
      setFillJobVisibility(null)
      setFillJobVisibilityError(null)
      setDatasetFillPreview(null)
      setDatasetFillPreviewError(null)
      setPaperSessionPreview(null)
      setPaperSessionPreviewError(null)
      setPaperSessionStartResult(null)
      setPaperSessionStartError(null)
      setLatestPaperSessionId(null)
      setLiveOrderPreview(null)
      setLiveOrderPreviewError(null)
      setLiveOrderDetail(null)
      setLiveOrderDetailError(null)
      setLiveOrderList(null)
      setLiveOrderListError(null)
      setLiveOrderSubmitResult(null)
      setLiveOrderSubmitError(null)
      setIsSubmittingLiveOrder(false)
      setLiveOrderCancelResult(null)
      setLiveOrderCancelError(null)
      setIsCancellingLiveOrder(false)
      setLiveOrderReconcileResult(null)
      setLiveOrderReconcileError(null)
      setIsReconcilingLiveOrder(false)
      setLiveOrderJournalProjectionResult(null)
      setLiveOrderJournalProjectionError(null)
      setIsProjectingLiveOrderToJournal(false)
      setIsLiveOrderPreviewLoading(false)
      setIsLiveOrderDetailLoading(false)
      setIsLiveOrderListLoading(false)
      resetPaperSessionDetail()
      setDatasetLocalFillResult(null)
      setDatasetLocalFillError(null)
      setIsDatasetLocalFillConfirmed(false)
      setChartData(null)
      setSelectedTrade(null)
      setRunAnalysis(null)
      setSelectedAnalyzedTradeId(null)
      setSelectedTradeExecutionDetail(null)
      setPreflightResult(null)
      setIsPreflightOpen(false)
      setPendingBacktestRequest(null)
      setActionMessage(null)
      setDraftSource("")
      setValidationCheck(null)
      setValidationCheckSource(null)
      setCompareBaseRunId(null)
      setCompareRunId(null)
      setCompareAnalysis(null)
      setIsComparePickerOpen(false)
      return groupId
    })
  }, [resetPaperSessionDetail])

  const selectStrategy = useCallback((strategyId: string) => {
    setSelectedStrategyId((current) => {
      if (current === strategyId && selectedStrategy !== null) {
        return current
      }
      setError(null)
      setSelectedStrategy(null)
      setViewedStrategyVersionId(null)
      setExecution(null)
      setActivePipeline(null)
      setJobVisibility(null)
      setJobVisibilityError(null)
      setFillJobVisibility(null)
      setFillJobVisibilityError(null)
      setDatasetFillPreview(null)
      setDatasetFillPreviewError(null)
      setPaperSessionPreview(null)
      setPaperSessionPreviewError(null)
      setPaperSessionStartResult(null)
      setPaperSessionStartError(null)
      setLatestPaperSessionId(null)
      setLiveOrderPreview(null)
      setLiveOrderPreviewError(null)
      setLiveOrderDetail(null)
      setLiveOrderDetailError(null)
      setLiveOrderList(null)
      setLiveOrderListError(null)
      setLiveOrderSubmitResult(null)
      setLiveOrderSubmitError(null)
      setIsSubmittingLiveOrder(false)
      setLiveOrderCancelResult(null)
      setLiveOrderCancelError(null)
      setIsCancellingLiveOrder(false)
      setLiveOrderReconcileResult(null)
      setLiveOrderReconcileError(null)
      setIsReconcilingLiveOrder(false)
      setLiveOrderJournalProjectionResult(null)
      setLiveOrderJournalProjectionError(null)
      setIsProjectingLiveOrderToJournal(false)
      setIsLiveOrderPreviewLoading(false)
      setIsLiveOrderDetailLoading(false)
      setIsLiveOrderListLoading(false)
      resetPaperSessionDetail()
      setDatasetLocalFillResult(null)
      setDatasetLocalFillError(null)
      setIsDatasetLocalFillConfirmed(false)
      setChartData(null)
      setSelectedTrade(null)
      setRunAnalysis(null)
      setSelectedAnalyzedTradeId(null)
      setSelectedTradeExecutionDetail(null)
      setPreflightResult(null)
      setIsPreflightOpen(false)
      setPendingBacktestRequest(null)
      setActionMessage(null)
      setDraftSource("")
      setValidationCheck(null)
      setValidationCheckSource(null)
      setCompareBaseRunId(null)
      setCompareRunId(null)
      setCompareAnalysis(null)
      setIsComparePickerOpen(false)
      return strategyId
    })
  }, [resetPaperSessionDetail, selectedStrategy])

  const reopenRun = useCallback(
    async (runId: string) => {
      setError(null)
      try {
        await loadRunState(runId)
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Unable to reopen run.")
      }
    },
    [loadRunState],
  )

  const selectTrade = useCallback(
    (trade: TradeLabTradeDetail | null) => {
      setSelectedTrade(trade)
      if (!trade?.marker.tradeOrderId) {
        setSelectedAnalyzedTradeId(null)
        setSelectedTradeExecutionDetail(null)
        return
      }
      const matchedTradeId =
        runAnalysis?.trades.find(
          (item) => item.entryOrderId === trade.marker.tradeOrderId || item.exitOrderId === trade.marker.tradeOrderId,
        )?.id ?? null
      void selectAnalyzedTrade(matchedTradeId, activeRunIdRef.current)
    },
    [runAnalysis, selectAnalyzedTrade],
  )

  const openComparePicker = useCallback((runId: string | null) => {
    if (!runId) {
      return
    }
    setCompareBaseRunId(runId)
    setCompareRunId(null)
    setCompareAnalysis(null)
    setIsComparePickerOpen(true)
  }, [])

  const closeComparePicker = useCallback(() => {
    setIsComparePickerOpen(false)
  }, [])

  const exitCompareMode = useCallback(() => {
    setCompareBaseRunId(null)
    setCompareRunId(null)
    setCompareAnalysis(null)
    setIsComparePickerOpen(false)
  }, [])

  const chooseCompareRun = useCallback(
    async (runId: string) => {
      if (!compareBaseRunId || !runAnalysis) {
        return
      }
      if (runAnalysis.run.id !== compareBaseRunId) {
        setActionMessage("Compare mode is out of sync with the active run.")
        return
      }

      const payload = normalizeRunAnalysis(await tradeLabApi.getBotRunAnalysis(runId))
      if (!payload || payload.run.strategyId !== runAnalysis.run.strategyId) {
        setActionMessage("Compare mode only supports completed runs from the same strategy.")
        return
      }

      setCompareRunId(runId)
      setCompareAnalysis(payload)
      setIsComparePickerOpen(false)
      setActionMessage(`Comparing ${runAnalysis.run.id} with ${runId}.`)
    },
    [compareBaseRunId, runAnalysis],
  )

  const refreshPipeline = useCallback(async (runId: string) => {
    setIsPollingPipeline(true)
    try {
      const pipeline = normalizeRunPipeline(await tradeLabApi.getBotRunPipeline(runId))
      setActivePipeline(pipeline)
      if (pipeline && hasTerminalStatus(pipeline.status)) {
        await loadRunState(runId)
      }
      return pipeline
    } finally {
      setIsPollingPipeline(false)
    }
  }, [loadRunState])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadInitialWorkspace()
    }, 0)

    return () => {
      window.clearTimeout(timer)
    }
  }, [loadInitialWorkspace])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refreshPaperKillSwitchStatus()
    }, 0)

    return () => {
      window.clearTimeout(timer)
    }
  }, [refreshPaperKillSwitchStatus])

  useEffect(() => {
    if (!selectedGroupId || loadedGroupIdRef.current === selectedGroupId) {
      return
    }

    let active = true
    void loadStrategiesForGroup(selectedGroupId).catch((loadError: unknown) => {
      if (!active) return
      setError(loadError instanceof Error ? loadError.message : "TradeLab strategies failed to load.")
    })

    return () => {
      active = false
    }
  }, [loadStrategiesForGroup, selectedGroupId])

  useEffect(() => {
    if (!selectedStrategyId || (loadedStrategyIdRef.current === selectedStrategyId && selectedStrategy !== null)) {
      return
    }

    let active = true
    void loadStrategyDetail(selectedStrategyId).catch((loadError: unknown) => {
      if (!active) return
      setError(loadError instanceof Error ? loadError.message : "TradeLab strategy failed to load.")
      setSelectedStrategy(null)
      setExecution(null)
      setActivePipeline(null)
      setJobVisibility(null)
      setJobVisibilityError(null)
      setDatasetFillPreview(null)
      setDatasetFillPreviewError(null)
      setPaperSessionPreview(null)
      setPaperSessionPreviewError(null)
      setLiveOrderPreview(null)
      setLiveOrderPreviewError(null)
      setLiveOrderDetail(null)
      setLiveOrderDetailError(null)
      setLiveOrderList(null)
      setLiveOrderListError(null)
      setLiveOrderSubmitResult(null)
      setLiveOrderSubmitError(null)
      setLiveOrderCancelResult(null)
      setLiveOrderCancelError(null)
      setLiveOrderReconcileResult(null)
      setLiveOrderReconcileError(null)
      setLiveOrderJournalProjectionResult(null)
      setLiveOrderJournalProjectionError(null)
      setDatasetLocalFillResult(null)
      setDatasetLocalFillError(null)
      setIsDatasetLocalFillConfirmed(false)
      setChartData(null)
      setSelectedTrade(null)
      setRunAnalysis(null)
      setSelectedAnalyzedTradeId(null)
      setSelectedTradeExecutionDetail(null)
      setDraftSource("")
      setValidationCheck(null)
      setValidationCheckSource(null)
      setCompareBaseRunId(null)
      setCompareRunId(null)
      setCompareAnalysis(null)
      setIsComparePickerOpen(false)
    })

    return () => {
      active = false
    }
  }, [loadStrategyDetail, resetPaperSessionDetail, selectedStrategyId, selectedStrategy])

  useEffect(() => {
    if (!paperSessionPreviewSetupReason) {
      return
    }
    const timer = window.setTimeout(() => {
      setPaperSessionPreview(null)
      setPaperSessionPreviewError(null)
      setPaperSessionStartResult(null)
      setPaperSessionStartError(null)
      setLatestPaperSessionId(null)
    }, 0)
    return () => {
      window.clearTimeout(timer)
    }
  }, [paperSessionPreviewSetupReason])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      resetPaperSessionDetail()
    }, 0)
    return () => {
      window.clearTimeout(timer)
    }
  }, [resetPaperSessionDetail, selectedStrategyId])

  useEffect(() => {
    if (!activePipeline || hasTerminalStatus(activePipeline.status) || !activePipeline.run.id) {
      return
    }

    const timer = window.setInterval(() => {
      void refreshPipeline(activePipeline.run.id)
    }, 1500)

    return () => {
      window.clearInterval(timer)
    }
  }, [activePipeline, refreshPipeline])

  useEffect(() => {
    if (!selectedStrategyId || !jobVisibility?.active.length) {
      return
    }

    const timer = window.setInterval(() => {
      void refreshJobVisibility(selectedStrategyId)
    }, 1500)

    return () => {
      window.clearInterval(timer)
    }
  }, [jobVisibility?.active.length, refreshJobVisibility, selectedStrategyId])

  const selectedAnalyzedTrade = useMemo(
    () => runAnalysis?.trades.find((trade) => trade.id === selectedAnalyzedTradeId) ?? null,
    [runAnalysis, selectedAnalyzedTradeId],
  )

  const compareCandidates = useMemo(() => {
    const activeRunId = activePipeline?.run.id ?? execution?.runId ?? null
    const baseRunId = compareBaseRunId ?? activeRunId
    if (!selectedStrategy) {
      return []
    }
    return runHistory.filter(
      (run) => run.strategyId === selectedStrategy.id && run.status === "completed" && run.id !== baseRunId,
    )
  }, [activePipeline?.run.id, compareBaseRunId, execution?.runId, runHistory, selectedStrategy])

  const compareMode = useMemo<TradeLabCompareModeState | null>(() => {
    if (!compareBaseRunId || !compareRunId || !runAnalysis || !compareAnalysis) {
      return null
    }
    if (runAnalysis.run.id !== compareBaseRunId) {
      return null
    }
    if (runAnalysis.run.strategyId !== compareAnalysis.run.strategyId) {
      return null
    }

    return {
      isOpen: true,
      baseRunId: compareBaseRunId,
      compareRunId,
      baseAnalysis: runAnalysis,
      compareAnalysis,
      metricDiffs: buildCompareMetricDiffs(runAnalysis, compareAnalysis),
      configDiff: buildCompareConfigDiff(runAnalysis, compareAnalysis),
      tradeSummaryDiffs: buildCompareTradeSummaryDiffs(runAnalysis, compareAnalysis),
      datasetMismatchWarning: buildDatasetMismatchWarning(runAnalysis, compareAnalysis),
    }
  }, [compareAnalysis, compareBaseRunId, compareRunId, runAnalysis])

  const visibleExecutionJournal = runAnalysis?.run.status === "completed" ? executionJournal : null
  const visibleExecutionJournalError = runAnalysis?.run.status === "completed" ? executionJournalError : null

  return {
    groups,
    strategies,
    bots,
    selectedGroupId,
    selectedStrategyId,
    selectedStrategy,
    currentVersion,
    execution,
    chartData,
    selectedTrade,
    runAnalysis,
    selectedAnalyzedTrade,
    selectedTradeExecutionDetail,
    runHistory,
    latestCurrentRunId,
    compareCandidates,
    compareMode,
    benchmarkCheck,
    manualSignalPackage,
    manualSignalPackageError,
    isCreatingManualSignalPackage,
    researchRobustnessGate,
    researchRobustnessGateError,
    isCreatingResearchRobustnessGate,
    executionJournal: visibleExecutionJournal,
    executionJournalError: visibleExecutionJournalError,
    isExecutionJournalLoading,
    isSavingExecutionJournalEntry,
    isComparePickerOpen,
    activePipeline,
    jobVisibility,
    jobVisibilityError,
    fillJobVisibility,
    fillJobVisibilityError,
    fillSchedulerStatus,
    fillSchedulerStatusError,
    paperSchedulerStatus,
    paperSchedulerStatusError,
    paperKillSwitchStatus,
    paperKillSwitchStatusError,
    datasetCoverage,
    datasetCoverageError,
    datasetFillPreview,
    datasetFillPreviewError,
    paperSessionPreview,
    paperSessionPreviewError,
    paperSessionPreviewSetupReason,
    paperSessionDetailInput,
    paperSessionDetail,
    paperSessionDetailError,
    paperSessionObservability,
    paperSessionObservabilityError,
    paperSessionStartResult,
    paperSessionStartError,
    paperSessionRunLocalResult,
    paperSessionRunLocalError,
    paperSessionCancelLocalResult,
    paperSessionCancelLocalError,
    paperSessionRetryLocalResult,
    paperSessionRetryLocalError,
    paperSessionResumeReadiness,
    paperSessionResumeReadinessError,
    paperSessionResumeLocalResult,
    paperSessionResumeLocalError,
    latestPaperSessionId,
    liveOrderSide,
    liveOrderSizeMode,
    liveOrderAmount,
    liveOrderCredentialRefId,
    liveOrderPreview,
    liveOrderPreviewError,
    liveOrderDetail,
    liveOrderDetailError,
    liveOrderList,
    liveOrderListError,
    liveOrderSubmitResult,
    liveOrderSubmitError,
    liveOrderCancelResult,
    liveOrderCancelError,
    liveOrderReconcileResult,
    liveOrderReconcileError,
    liveOrderJournalProjectionResult,
    liveOrderJournalProjectionError,
    testnetOrderSide,
    testnetOrderSizeMode,
    testnetOrderAmount,
    testnetCredentialRefId,
    testnetOrderPreview,
    testnetOrderPreviewError,
    testnetOrderDetail,
    testnetOrderDetailError,
    testnetOrderList,
    testnetOrderListError,
    testnetOrderSubmitResult,
    testnetOrderSubmitError,
    testnetOrderCancelResult,
    testnetOrderCancelError,
    testnetOrderReconcileResult,
    testnetOrderReconcileError,
    testnetOrderJournalProjectionResult,
    testnetOrderJournalProjectionError,
    datasetLocalFillResult,
    datasetLocalFillError,
    datasetFillEnqueueResult,
    datasetFillEnqueueError,
    localFillAudit,
    localFillAuditError,
    preflightResult,
    isPreflightOpen,
    pendingBacktestRequest,
    draftRuntimeConfig,
    draftRiskConfig,
    draftSource,
    validationCheck: activeValidationCheck,
    actionMessage,
    error,
    isLoading,
    isSavingSettings,
    isSavingVersion,
    isSavingPaperDraft,
    isCheckingSyntax,
    isRunningBacktest,
    isStartingBenchmarkRepeat,
    isPollingPipeline,
    isJobVisibilityLoading,
    isFillJobVisibilityLoading,
    isFillSchedulerStatusLoading,
    isPaperSchedulerStatusLoading,
    isDatasetCoverageLoading,
    isPreviewingDatasetFill,
    isPaperSessionPreviewLoading,
    isPaperSessionDetailLoading,
    isPaperSessionObservabilityLoading,
    isPaperKillSwitchStatusLoading,
    isStartingPaperSession,
    isRunningPaperSessionLocal,
    isCancellingPaperSessionLocal,
    isRetryingPaperSessionLocal,
    isPaperSessionResumeReadinessLoading,
    isResumingPaperSessionLocal,
    isLiveOrderPreviewLoading,
    isLiveOrderDetailLoading,
    isLiveOrderListLoading,
    isSubmittingLiveOrder,
    isCancellingLiveOrder,
    isReconcilingLiveOrder,
    isProjectingLiveOrderToJournal,
    isTestnetOrderPreviewLoading,
    isTestnetOrderDetailLoading,
    isTestnetOrderListLoading,
    isSubmittingTestnetOrder,
    isCancellingTestnetOrder,
    isReconcilingTestnetOrder,
    isProjectingTestnetOrderToJournal,
    canPreviewLiveOrder,
    liveOrderPreviewDisabledReason,
    canConfirmSubmitLiveOrder,
    canCancelLiveOrder,
    canReconcileLiveOrder,
    canProjectLiveOrderToJournal,
    canPreviewTestnetOrder,
    testnetOrderPreviewDisabledReason,
    canConfirmSubmitTestnetOrder,
    canCancelTestnetOrder,
    canReconcileTestnetOrder,
    canProjectTestnetOrderToJournal,
    canStartPaperSession,
    paperSessionStartDisabledReason,
    paperKillSwitchDisabledReason,
    canRunPaperSessionLocal,
    paperSessionRunLocalDisabledReason,
    canCancelPaperSessionLocal,
    paperSessionCancelLocalDisabledReason,
    canRetryPaperSessionLocal,
    paperSessionRetryLocalDisabledReason,
    canResumePaperSessionLocal,
    paperSessionResumeLocalDisabledReason,
    isFillingDatasetLocal,
    isEnqueueingDatasetFill,
    isLocalFillAuditLoading,
    isDatasetLocalFillConfirmed,
    isDraftDirty,
    isConfigDirty,
    runDisabledReason,
    runVersion,
    paperDraftBot,
    credentialBoundary,
    draftCredentialBoundaryChecks,
    setDraftRuntimeConfig,
    setDraftRiskConfig,
    setDraftCredentialBoundaryChecks,
    setDraftSource: updateDraftSource,
    selectGroup,
    selectStrategy,
    saveStrategySettings,
    createVersion,
    savePaperDraft,
    checkSyntax,
    runBacktest,
    confirmBacktest,
    cancelPreflight,
    reopenRun,
    selectTrade,
    selectAnalyzedTrade,
    openComparePicker,
    closeComparePicker,
    chooseCompareRun,
    exitCompareMode,
    refreshRunHistory,
    refreshDatasetCoverage,
    refreshJobVisibility,
    refreshLocalFillAudit,
    refreshFillJobVisibility,
    refreshFillSchedulerStatus,
    refreshPaperSchedulerStatus,
    refreshPaperKillSwitchStatus,
    previewDatasetFillPlan,
    refreshPaperSessionPreview,
    setPaperSessionDetailInput,
    loadPaperSessionDetail,
    refreshPaperSessionObservability,
    loadPaperSessionDetailFromSummary,
    startPaperSessionFromPreview,
    setLiveOrderSide,
    setLiveOrderSizeMode,
    setLiveOrderAmount,
    setLiveOrderCredentialRefId,
    previewLiveOrder,
    loadLiveOrderDetail,
    refreshLiveOrders,
    confirmSubmitLiveOrder,
    cancelLiveOrder,
    reconcileLiveOrder,
    projectLiveOrderToJournal,
    setTestnetOrderSide,
    setTestnetOrderSizeMode,
    setTestnetOrderAmount,
    setTestnetCredentialRefId,
    previewTestnetOrder,
    loadTestnetOrderDetail,
    refreshTestnetOrders,
    confirmSubmitTestnetOrder,
    cancelTestnetOrder,
    reconcileTestnetOrder,
    projectTestnetOrderToJournal,
    runPaperSessionLocal,
    cancelPaperSessionLocal,
    retryPaperSessionLocal,
    resumePaperSessionLocal,
    setIsDatasetLocalFillConfirmed,
    confirmDatasetLocalFill,
    queueDatasetFillLocal,
    refreshPipeline,
    startBenchmarkRepeat,
    createManualSignalPackage,
    createResearchRobustnessGate,
    loadExecutionJournalEntries,
    createExecutionJournalEntry,
    updateExecutionJournalEntry,
    deleteExecutionJournalEntry,
  }
}

