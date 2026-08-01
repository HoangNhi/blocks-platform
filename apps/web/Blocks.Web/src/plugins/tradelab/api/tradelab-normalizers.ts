import type {
  BacktestPosition,
  TradeLabFuturesResearchSummary,
  TradeLabBacktestExecution,
  TradeLabBenchmarkCheck,
  TradeLabChartMarker,
  TradeLabCoverageSegment,
  TradeLabCoverageSummary,
  TradeLabDataJobSummary,
  TradeLabDatasetCoverageItem,
  TradeLabDatasetFillEnqueueLocalResult,
  TradeLabDatasetFillPreview,
  TradeLabDatasetFillJobVisibility,
  TradeLabDatasetFillJobVisibilityItem,
  TradeLabDatasetFillJobVisibilityRange,
  TradeLabExecutionJournalEntry,
  TradeLabExecutionJournalFill,
  TradeLabExecutionJournalList,
  TradeLabFillSchedulerStatus,
  TradeLabDatasetLocalFillAudit,
  TradeLabDatasetLocalFillResult,
  TradeLabBotSummary,
  TradeLabEquityPoint,
  TradeLabAnalyzedTrade,
  TradeLabLogEntry,
  TradeLabManualSignalPackage,
  TradeLabMetricSnapshot,
  TradeLabMissingRange,
  TradeLabOrderEntry,
  TradeLabPipelineStatus,
  TradeLabResearchRobustnessGate,
  TradeLabLiveOrderDetail,
  TradeLabLiveOrderIntent,
  TradeLabLiveOrderJournalProjectionResult,
  TradeLabLiveOrderList,
  TradeLabLiveOrderOperationResult,
  TradeLabLiveOrderPreview,
  TradeLabLiveOrderPreviewResult,
  TradeLabPaperSessionPreview,
  TradeLabPaperKillSwitchStatus,
  TradeLabPaperSchedulerStatus,
  TradeLabPaperSessionObservability,
  TradeLabPaperSessionDetail,
  TradeLabPaperSessionCancelLocalResult,
  TradeLabPaperSessionResumeLocalResult,
  TradeLabPaperSessionResumeReadiness,
  TradeLabPaperSessionRetryLocalResult,
  TradeLabPaperSessionRunLocalResult,
  TradeLabPaperSessionStartResult,
  TradeLabTestnetOrderDetail,
  TradeLabTestnetOrderIntent,
  TradeLabTestnetOrderJournalProjectionResult,
  TradeLabTestnetOrderList,
  TradeLabTestnetOrderOperationResult,
  TradeLabTestnetOrderPreview,
  TradeLabTestnetOrderPreviewResult,
  TradeLabPreflightResult,
  TradeLabRunAnalysis,
  TradeLabRunAnalysisDatasetContext,
  TradeLabRunAnalysisResult,
  TradeLabRunDetail,
  TradeLabRunHistoryEntry,
  TradeLabJobVisibilityItem,
  TradeLabRunPipeline,
  TradeLabRunSnapshot,
  TradeLabRuntimeConfig,
  MarketType,
  TradeLabRunChart,
  TradeLabStrategyJobVisibility,
  TradeLabStrategyDetail,
  TradeLabStrategyGroupSummary,
  TradeLabStrategySummary,
  TradeLabStrategyValidationCheck,
  TradeLabStrategyVersion,
  TradeLabTradeDetail,
  TradeLabSelectedTradeExecutionDetail,
  TradeLabTradeSummary,
} from "../types"

type ApiRecord = Record<string, unknown>

function asRecord(value: unknown): ApiRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as ApiRecord) : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function pick(record: ApiRecord, ...keys: string[]) {
  for (const key of keys) {
    if (key in record) {
      return record[key]
    }
  }
  return undefined
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback
}

function nullableText(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null
}

function textArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : []
}

function numberValue(value: unknown, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return fallback
}

function nullableNumberValue(value: unknown) {
  return nullableNumber(value)
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function nullableBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null
}

function decimalText(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value === "string") return value
  if (typeof value === "number" && Number.isFinite(value)) return String(value)
  return null
}

function normalizeTestnetOrderPreviewResultOrder(row: unknown): TradeLabTestnetOrderPreviewResult["order"] {
  const record = asRecord(row)
  if (!Object.keys(record).length) return null
  return {
    environment: text(pick(record, "environment")),
    exchange: text(pick(record, "exchange")),
    marketType: text(pick(record, "market_type", "marketType")),
    symbol: text(pick(record, "symbol")),
    side: text(pick(record, "side")),
    orderType: text(pick(record, "order_type", "orderType")),
    quantity: decimalText(pick(record, "quantity")),
    quoteQuantity: decimalText(pick(record, "quote_quantity", "quoteQuantity")),
    estimatedNotional: decimalText(pick(record, "estimated_notional", "estimatedNotional")),
    estimatedFee: decimalText(pick(record, "estimated_fee", "estimatedFee")),
  }
}

function normalizeTestnetOrderPreviewResult(row: unknown): TradeLabTestnetOrderPreviewResult {
  const record = asRecord(row)
  return {
    status: text(pick(record, "status")),
    allowed: Boolean(pick(record, "allowed")),
    reasonCode: text(pick(record, "reason_code", "reasonCode")),
    safetyStatus: text(pick(record, "safety_status", "safetyStatus")),
    intentId: nullableText(pick(record, "intent_id", "intentId")),
    previewId: nullableText(pick(record, "preview_id", "previewId")),
    clientOrderId: nullableText(pick(record, "client_order_id", "clientOrderId")),
    expiresAt: nullableText(pick(record, "expires_at", "expiresAt")),
    order: normalizeTestnetOrderPreviewResultOrder(pick(record, "order")),
    sourceContext: Object.keys(asRecord(pick(record, "source_context", "sourceContext"))).length ? asRecord(pick(record, "source_context", "sourceContext")) : null,
    credentialSnapshot: asRecord(pick(record, "credential_snapshot", "credentialSnapshot")),
    riskSnapshot: asRecord(pick(record, "risk_snapshot", "riskSnapshot")),
    auditEventIds: textArray(pick(record, "audit_event_ids", "auditEventIds")),
    details: asRecord(pick(record, "details")),
  }
}

function normalizeTestnetOrderOperationResult(row: unknown, snapshotKeys: string[]): TradeLabTestnetOrderOperationResult {
  const record = asRecord(row)
  const snapshot = snapshotKeys.reduce<Record<string, unknown>>((value, key) => {
    const candidate = asRecord(pick(record, key))
    return Object.keys(value).length ? value : candidate
  }, {})
  return {
    status: text(pick(record, "status")),
    reasonCode: text(pick(record, "reason_code", "reasonCode")),
    safetyStatus: text(pick(record, "safety_status", "safetyStatus")),
    semanticStatusCode: numberValue(pick(record, "semantic_status_code", "semanticStatusCode"), 200),
    shouldCommit: Boolean(pick(record, "should_commit", "shouldCommit")),
    intentId: nullableText(pick(record, "intent_id", "intentId")),
    previewId: nullableText(pick(record, "preview_id", "previewId")),
    clientOrderId: nullableText(pick(record, "client_order_id", "clientOrderId")),
    exchangeOrderId: nullableText(pick(record, "exchange_order_id", "exchangeOrderId")),
    intentStatus: nullableText(pick(record, "intent_status", "intentStatus")),
    reconciliationAttemptId: nullableText(pick(record, "reconciliation_attempt_id", "reconciliationAttemptId")),
    snapshot,
    auditEventIds: textArray(pick(record, "audit_event_ids", "auditEventIds")),
    details: asRecord(pick(record, "details")),
  }
}

function normalizeTestnetOrderConfirmSubmitResult(row: unknown): TradeLabTestnetOrderOperationResult {
  return normalizeTestnetOrderOperationResult(row, ["submit_snapshot", "submitSnapshot"])
}

function normalizeTestnetOrderCancelResult(row: unknown): TradeLabTestnetOrderOperationResult {
  return normalizeTestnetOrderOperationResult(row, ["cancel_snapshot", "cancelSnapshot"])
}

function normalizeTestnetOrderReconcileResult(row: unknown): TradeLabTestnetOrderOperationResult {
  return normalizeTestnetOrderOperationResult(row, ["reconcile_snapshot", "reconcileSnapshot"])
}

function normalizeTestnetOrderJournalProjectionResult(row: unknown): TradeLabTestnetOrderJournalProjectionResult {
  const record = asRecord(row)
  return {
    status: text(pick(record, "status")),
    reasonCode: text(pick(record, "reason_code", "reasonCode")),
    safetyStatus: text(pick(record, "safety_status", "safetyStatus")),
    semanticStatusCode: numberValue(pick(record, "semantic_status_code", "semanticStatusCode"), 200),
    shouldCommit: Boolean(pick(record, "should_commit", "shouldCommit")),
    intentId: nullableText(pick(record, "intent_id", "intentId")),
    journalEntryId: nullableText(pick(record, "journal_entry_id", "journalEntryId")),
    clientOrderId: nullableText(pick(record, "client_order_id", "clientOrderId")),
    intentStatus: nullableText(pick(record, "intent_status", "intentStatus")),
    auditEventIds: textArray(pick(record, "audit_event_ids", "auditEventIds")),
    details: asRecord(pick(record, "details")),
  }
}

function normalizeLiveOrderPreviewResult(row: unknown): TradeLabLiveOrderPreviewResult {
  return normalizeTestnetOrderPreviewResult(row)
}

function normalizeLiveOrderOperationResult(row: unknown): TradeLabLiveOrderOperationResult {
  return normalizeTestnetOrderOperationResult(row, ["submit_snapshot", "submitSnapshot", "cancel_snapshot", "cancelSnapshot", "reconcile_snapshot", "reconcileSnapshot"])
}

function normalizeLiveOrderConfirmSubmitResult(row: unknown): TradeLabLiveOrderOperationResult {
  return normalizeTestnetOrderConfirmSubmitResult(row)
}

function normalizeLiveOrderCancelResult(row: unknown): TradeLabLiveOrderOperationResult {
  return normalizeTestnetOrderCancelResult(row)
}

function normalizeLiveOrderReconcileResult(row: unknown): TradeLabLiveOrderOperationResult {
  return normalizeTestnetOrderReconcileResult(row)
}

function normalizeLiveOrderJournalProjectionResult(row: unknown): TradeLabLiveOrderJournalProjectionResult {
  return normalizeTestnetOrderJournalProjectionResult(row)
}

function normalizeLiveOrderIntent(row: unknown): TradeLabLiveOrderIntent {
  return normalizeTestnetOrderIntent(row)
}

function normalizeLiveOrderPreview(row: unknown): TradeLabLiveOrderPreview {
  return normalizeTestnetOrderPreview(row)
}

function normalizeLiveOrderDetail(row: unknown): TradeLabLiveOrderDetail | null {
  const detail = normalizeTestnetOrderDetail(row)
  return detail ? { ...detail } : null
}

function normalizeLiveOrderList(row: unknown): TradeLabLiveOrderList {
  const list = normalizeTestnetOrderList(row)
  return { ...list }
}

function normalizeTestnetOrderIntent(row: unknown): TradeLabTestnetOrderIntent {
  const record = asRecord(row)
  return {
    intentId: text(pick(record, "intent_id", "intentId")),
    status: text(pick(record, "status")),
    reasonCode: nullableText(pick(record, "reason_code", "reasonCode")),
    clientOrderId: text(pick(record, "client_order_id", "clientOrderId")),
    environment: text(pick(record, "environment")),
    exchange: text(pick(record, "exchange")),
    marketType: text(pick(record, "market_type", "marketType")),
    symbol: text(pick(record, "symbol")),
    side: text(pick(record, "side")),
    orderType: text(pick(record, "order_type", "orderType")),
    quantity: decimalText(pick(record, "quantity")),
    quoteQuantity: decimalText(pick(record, "quote_quantity", "quoteQuantity")),
    strategyId: text(pick(record, "strategy_id", "strategyId")),
    strategyVersionId: text(pick(record, "strategy_version_id", "strategyVersionId")),
    sourceRunId: nullableText(pick(record, "source_run_id", "sourceRunId")),
    credentialRefId: text(pick(record, "credential_ref_id", "credentialRefId")),
    latestPreviewId: nullableText(pick(record, "latest_preview_id", "latestPreviewId")),
    reconciliationRequired: Boolean(pick(record, "reconciliation_required", "reconciliationRequired")),
    createdAt: nullableText(pick(record, "created_at", "createdAt")),
    updatedAt: nullableText(pick(record, "updated_at", "updatedAt")),
  }
}

function normalizeTestnetOrderPreview(row: unknown): TradeLabTestnetOrderPreview {
  const record = asRecord(row)
  return {
    previewId: text(pick(record, "preview_id", "previewId")),
    previewKey: text(pick(record, "preview_key", "previewKey")),
    status: text(pick(record, "status")),
    reasonCode: nullableText(pick(record, "reason_code", "reasonCode")),
    symbol: text(pick(record, "symbol")),
    side: text(pick(record, "side")),
    orderType: text(pick(record, "order_type", "orderType")),
    quantity: decimalText(pick(record, "quantity")),
    quoteQuantity: decimalText(pick(record, "quote_quantity", "quoteQuantity")),
    estimatedNotional: decimalText(pick(record, "estimated_notional", "estimatedNotional")),
    estimatedFee: decimalText(pick(record, "estimated_fee", "estimatedFee")),
    riskSnapshot: asRecord(pick(record, "risk_snapshot", "riskSnapshot")),
    credentialSnapshot: asRecord(pick(record, "credential_snapshot", "credentialSnapshot")),
    sourceSnapshot: asRecord(pick(record, "source_snapshot", "sourceSnapshot")),
    expiresAt: nullableText(pick(record, "expires_at", "expiresAt")),
    createdAt: nullableText(pick(record, "created_at", "createdAt")),
  }
}

function normalizeTestnetOrderEvent(row: unknown) {
  const record = asRecord(row)
  return {
    eventId: text(pick(record, "event_id", "eventId")),
    previewId: nullableText(pick(record, "preview_id", "previewId")),
    eventType: text(pick(record, "event_type", "eventType")),
    fromStatus: nullableText(pick(record, "from_status", "fromStatus")),
    toStatus: nullableText(pick(record, "to_status", "toStatus")),
    reasonCode: nullableText(pick(record, "reason_code", "reasonCode")),
    clientOrderId: nullableText(pick(record, "client_order_id", "clientOrderId")),
    exchangeOrderId: nullableText(pick(record, "exchange_order_id", "exchangeOrderId")),
    actor: text(pick(record, "actor")),
    metadata: asRecord(pick(record, "metadata")),
    createdAt: nullableText(pick(record, "created_at", "createdAt")),
  }
}

function normalizeTestnetOrderDetail(row: unknown): TradeLabTestnetOrderDetail | null {
  const record = asRecord(row)
  const intentRecord = asRecord(pick(record, "intent"))
  if (!Object.keys(intentRecord).length) return null
  return {
    safetyStatus: text(pick(record, "safety_status", "safetyStatus")),
    intent: normalizeTestnetOrderIntent(intentRecord),
    latestPreview: Object.keys(asRecord(pick(record, "latest_preview", "latestPreview"))).length ? normalizeTestnetOrderPreview(pick(record, "latest_preview", "latestPreview")) : null,
    previews: asArray(pick(record, "previews")).map(normalizeTestnetOrderPreview),
    events: asArray(pick(record, "events")).map(normalizeTestnetOrderEvent),
    reconciliationAttempts: asArray(pick(record, "reconciliation_attempts", "reconciliationAttempts")).map((item) => asRecord(item)),
  }
}

function normalizeTestnetOrderList(row: unknown): TradeLabTestnetOrderList {
  const record = asRecord(row)
  return {
    safetyStatus: text(pick(record, "safety_status", "safetyStatus")),
    items: asArray(pick(record, "items")).map((item) => {
      const itemRecord = asRecord(item)
      return {
        intent: normalizeTestnetOrderIntent(pick(itemRecord, "intent")),
        latestPreview: Object.keys(asRecord(pick(itemRecord, "latest_preview", "latestPreview"))).length ? normalizeTestnetOrderPreview(pick(itemRecord, "latest_preview", "latestPreview")) : null,
      }
    }),
  }
}

function normalizeRuntimeConfig(row: unknown): TradeLabRuntimeConfig {
  const record = asRecord(row)
  const marketType = (text(pick(record, "market_type", "marketType")) === "USD_M_FUTURES" ? "USD_M_FUTURES" : "SPOT") as MarketType
  return {
    exchange: text(pick(record, "exchange"), "binance"),
    symbol: text(pick(record, "symbol"), "BTCUSDT"),
    timeframe: text(pick(record, "timeframe"), "1h"),
    startAt: text(pick(record, "start_at", "startAt"), ""),
    endAt: text(pick(record, "end_at", "endAt"), ""),
    initialEquity: numberValue(pick(record, "initial_equity", "initialEquity")),
    feeBps: numberValue(pick(record, "fee_bps", "feeBps")),
    slippageBps: numberValue(pick(record, "slippage_bps", "slippageBps")),
    marketType,
    defaultLeverage:
      marketType === "USD_M_FUTURES" ? numberValue(pick(record, "default_leverage", "defaultLeverage"), 1) : undefined,
  }
}

function normalizeRiskConfig(row: unknown) {
  const record = asRecord(row)
  return {
    maxOrderPercent: numberValue(pick(record, "max_order_percent", "maxOrderPercent")),
    maxPositionPercent: numberValue(pick(record, "max_position_percent", "maxPositionPercent")),
    maxDrawdownPercent: numberValue(pick(record, "max_drawdown_percent", "maxDrawdownPercent")),
    minNotional: numberValue(pick(record, "min_notional", "minNotional")),
    stepSize: numberValue(pick(record, "step_size", "stepSize")),
    tickSize: numberValue(pick(record, "tick_size", "tickSize")),
  }
}

function normalizeMetrics(row: unknown): TradeLabMetricSnapshot | null {
  const record = asRecord(row)
  if (Object.keys(record).length === 0) {
    return null
  }

  return {
    initialEquity: numberValue(pick(record, "initial_equity", "initialEquity")),
    finalEquity: numberValue(pick(record, "final_equity", "finalEquity")),
    totalReturnPct: numberValue(pick(record, "total_return_pct", "totalReturnPct")),
    maxDrawdownPct: numberValue(pick(record, "max_drawdown_pct", "maxDrawdownPct")),
    profitFactor: nullableNumber(pick(record, "profit_factor", "profitFactor")),
    winRatePct: nullableNumber(pick(record, "win_rate_pct", "winRatePct")),
    totalTrades: numberValue(pick(record, "total_trades", "totalTrades")),
    closedTrades: numberValue(pick(record, "closed_trades", "closedTrades")),
  }
}

function normalizeEquityPoint(row: unknown): TradeLabEquityPoint {
  const record = asRecord(row)
  return {
    timestamp: text(pick(record, "timestamp", "open_time", "openTime"), ""),
    equity: numberValue(pick(record, "equity"), 0),
    drawdownPct: numberValue(pick(record, "drawdown_pct", "drawdownPct"), 0),
  }
}

function normalizeLogEntry(row: unknown): TradeLabLogEntry {
  const record = asRecord(row)
  return {
    id: text(pick(record, "id"), crypto.randomUUID()),
    timestamp: text(pick(record, "created_at", "timestamp"), ""),
    level: text(pick(record, "level"), "info") as TradeLabLogEntry["level"],
    eventType: text(pick(record, "event_type", "eventType"), ""),
    message: text(pick(record, "message"), ""),
    payload: asRecord(pick(record, "payload")),
  }
}

function normalizeOrderEntry(row: unknown): TradeLabOrderEntry {
  const record = asRecord(row)
  return {
    id: text(pick(record, "id"), crypto.randomUUID()),
    timestamp: text(pick(record, "created_at", "fill_time", "timestamp"), ""),
    side: text(pick(record, "side"), "buy") as TradeLabOrderEntry["side"],
    orderType: text(pick(record, "order_type", "orderType"), "market") as TradeLabOrderEntry["orderType"],
    status: text(pick(record, "status"), "accepted") as TradeLabOrderEntry["status"],
    fillPrice: nullableNumber(pick(record, "fill_price", "fillPrice")),
    fillQty: nullableNumber(pick(record, "fill_qty", "fillQty")),
    fillNotional: nullableNumber(pick(record, "fill_notional", "fillNotional")),
    feeAmount: nullableNumber(pick(record, "fee_amount", "feeAmount")),
    reason: nullableText(pick(record, "reason")),
    payload: asRecord(pick(record, "payload")),
  }
}

function normalizeCoverageSegment(row: unknown): TradeLabCoverageSegment {
  const record = asRecord(row)
  return {
    startAt: text(pick(record, "start_at", "startAt"), ""),
    endAt: text(pick(record, "end_at", "endAt"), ""),
    rowCount: numberValue(pick(record, "row_count", "rowCount"), 0),
  }
}

function normalizeCoverageSummary(row: unknown): TradeLabCoverageSummary | null {
  const record = asRecord(row)
  if (Object.keys(record).length === 0) {
    return null
  }

  return {
    datasetKey: text(pick(record, "dataset_key", "datasetKey"), ""),
    exchange: text(pick(record, "exchange"), "binance"),
    symbol: text(pick(record, "symbol"), ""),
    timeframe: text(pick(record, "timeframe"), ""),
    healthStatus: text(pick(record, "health_status", "healthStatus"), "incomplete") as TradeLabCoverageSummary["healthStatus"],
    earliestOpenTime: nullableText(pick(record, "earliest_open_time", "earliestOpenTime")),
    latestOpenTime: nullableText(pick(record, "latest_open_time", "latestOpenTime")),
    coveredStartAt: nullableText(pick(record, "covered_start_at", "coveredStartAt")),
    coveredEndAt: nullableText(pick(record, "covered_end_at", "coveredEndAt")),
    segmentCount: numberValue(pick(record, "segment_count", "segmentCount")),
    gapCount: numberValue(pick(record, "gap_count", "gapCount")),
    segments: asArray(pick(record, "segments")).map(normalizeCoverageSegment),
    metadata: asRecord(pick(record, "metadata")),
  }
}

function normalizeDatasetCoverageSegment(row: unknown): TradeLabDatasetCoverageItem["segments"][number] {
  const record = asRecord(row)
  return {
    id: text(pick(record, "id"), crypto.randomUUID()),
    segmentIndex: numberValue(pick(record, "segment_index", "segmentIndex"), 0),
    startAt: text(pick(record, "start_at", "startAt"), ""),
    endAt: text(pick(record, "end_at", "endAt"), ""),
    rowCount: numberValue(pick(record, "row_count", "rowCount"), 0),
  }
}

function normalizeDatasetCoverageItem(row: unknown): TradeLabDatasetCoverageItem {
  const record = asRecord(row)
  return {
    id: text(pick(record, "id"), crypto.randomUUID()),
    datasetKey: text(pick(record, "dataset_key", "datasetKey"), ""),
    exchange: text(pick(record, "exchange"), "binance"),
    symbol: text(pick(record, "symbol"), ""),
    timeframe: text(pick(record, "timeframe"), ""),
    healthStatus: text(
      pick(record, "health_status", "healthStatus"),
      "incomplete",
    ) as TradeLabDatasetCoverageItem["healthStatus"],
    earliestOpenTime: nullableText(pick(record, "earliest_open_time", "earliestOpenTime")),
    latestOpenTime: nullableText(pick(record, "latest_open_time", "latestOpenTime")),
    coveredStartAt: nullableText(pick(record, "covered_start_at", "coveredStartAt")),
    coveredEndAt: nullableText(pick(record, "covered_end_at", "coveredEndAt")),
    segmentCount: numberValue(pick(record, "segment_count", "segmentCount"), 0),
    gapCount: numberValue(pick(record, "gap_count", "gapCount"), 0),
    lastCheckedAt: nullableText(pick(record, "last_checked_at", "lastCheckedAt")),
    metadata: asRecord(pick(record, "metadata")),
    segments: asArray(pick(record, "segments")).map(normalizeDatasetCoverageSegment),
  }
}

function normalizePreflightResult(row: unknown): TradeLabPreflightResult | null {
  const record = asRecord(row)
  if (Object.keys(record).length === 0) {
    return null
  }

  return {
    datasetKey: text(pick(record, "dataset_key", "datasetKey"), ""),
    exchange: text(pick(record, "exchange"), "binance"),
    symbol: text(pick(record, "symbol"), ""),
    timeframe: text(pick(record, "timeframe"), ""),
    requestedStartAt: text(pick(record, "requested_start_at", "requestedStartAt"), ""),
    requestedEndAt: text(pick(record, "requested_end_at", "requestedEndAt"), ""),
    outcome: text(pick(record, "outcome"), "ready") as TradeLabPreflightResult["outcome"],
    action: (nullableText(pick(record, "action")) as TradeLabPreflightResult["action"]) ?? null,
    reasons: asArray(pick(record, "reasons")).map((item) => text(item, "")),
    coverage: normalizeCoverageSummary(pick(record, "coverage")),
    missingSegments: asArray(pick(record, "missing_segments", "missingSegments")).map((item) => {
      const segment = asRecord(item)
      return {
        startAt: text(pick(segment, "start_at", "startAt"), ""),
        endAt: text(pick(segment, "end_at", "endAt"), ""),
        kind: text(pick(segment, "kind"), "fill") as TradeLabPreflightResult["missingSegments"][number]["kind"],
      }
    }),
    repairStartAt: nullableText(pick(record, "repair_start_at", "repairStartAt")),
    repairEndAt: nullableText(pick(record, "repair_end_at", "repairEndAt")),
    activeJobId: nullableText(pick(record, "active_job_id", "activeJobId")),
    activeJobType: nullableText(pick(record, "active_job_type", "activeJobType")) as TradeLabPreflightResult["activeJobType"],
    sourceBlocked: Boolean(pick(record, "source_blocked", "sourceBlocked")),
    sourceSummary: asArray(pick(record, "source_summary", "sourceSummary")).map((item) => {
      const source = asRecord(item)
      return {
        source: text(pick(source, "source"), "unknown"),
        rowCount: numberValue(pick(source, "row_count", "rowCount"), 0),
      }
    }),
    provenanceBlocked: Boolean(pick(record, "provenance_blocked", "provenanceBlocked")),
    provenanceReasonCode: nullableText(pick(record, "provenance_reason_code", "provenanceReasonCode")),
  }
}

function normalizeMissingRange(row: unknown): TradeLabMissingRange {
  const record = asRecord(row)
  return {
    startAt: text(pick(record, "start_at", "startAt"), ""),
    endAt: text(pick(record, "end_at", "endAt"), ""),
    kind: text(pick(record, "kind"), "fill") as TradeLabMissingRange["kind"],
  }
}

function normalizeDatasetFillPreview(row: unknown): TradeLabDatasetFillPreview {
  const record = asRecord(row)
  const requestedRange = asRecord(pick(record, "requested_range", "requestedRange"))
  return {
    previewId: text(pick(record, "preview_id", "previewId"), ""),
    generatedAt: text(pick(record, "generated_at", "generatedAt"), ""),
    requestFingerprint: text(pick(record, "request_fingerprint", "requestFingerprint"), ""),
    datasetKey: text(pick(record, "dataset_key", "datasetKey"), ""),
    exchange: text(pick(record, "exchange"), "binance"),
    symbol: text(pick(record, "symbol"), ""),
    timeframe: text(pick(record, "timeframe"), ""),
    requestedRange: {
      startAt: text(pick(requestedRange, "start_at", "startAt"), ""),
      endAt: text(pick(requestedRange, "end_at", "endAt"), ""),
    },
    coverageStatus: text(pick(record, "coverage_status", "coverageStatus"), "unknown") as TradeLabDatasetFillPreview["coverageStatus"],
    gapCount: numberValue(pick(record, "gap_count", "gapCount"), 0),
    estimatedRows: numberValue(pick(record, "estimated_rows", "estimatedRows"), 0),
    blockedReasons: asArray(pick(record, "blocked_reasons", "blockedReasons")).map((item) => text(item, "")),
    safetyStatus: "preview_only",
    missingRanges: asArray(pick(record, "missing_ranges", "missingRanges")).map(normalizeMissingRange),
    activeJobId: nullableText(pick(record, "active_job_id", "activeJobId")),
    activeJobType: nullableText(pick(record, "active_job_type", "activeJobType")) as TradeLabDatasetFillPreview["activeJobType"],
  }
}

function normalizePaperSessionGateFailure(row: unknown): TradeLabPaperSessionPreview["failedGates"][number] {
  const record = asRecord(row)
  return {
    gate: text(pick(record, "gate"), ""),
    reasonCode: text(pick(record, "reason_code", "reasonCode"), ""),
    message: text(pick(record, "message"), ""),
    data: asRecord(pick(record, "data")),
  }
}

function normalizePaperSessionPreview(row: unknown): TradeLabPaperSessionPreview {
  const record = asRecord(row)
  const botContext = asRecord(pick(record, "bot_context", "botContext"))
  const strategyContext = asRecord(pick(record, "strategy_context", "strategyContext"))
  const datasetContext = asRecord(pick(record, "dataset_context", "datasetContext"))

  return {
    mode: text(pick(record, "mode"), "paper"),
    previewStatus: text(pick(record, "preview_status", "previewStatus"), "blocked"),
    allowed: pick(record, "allowed") === true,
    reasonCode: text(pick(record, "reason_code", "reasonCode"), ""),
    failedGates: asArray(pick(record, "failed_gates", "failedGates")).map(normalizePaperSessionGateFailure),
    warnings: asArray(pick(record, "warnings")).map((item) => text(item, "")),
    details: asRecord(pick(record, "details")),
    safetyStatus: text(pick(record, "safety_status", "safetyStatus"), "preview_only"),
    botContext: {
      botId: text(pick(botContext, "bot_id", "botId"), ""),
      mode: text(pick(botContext, "mode"), "paper"),
      status: text(pick(botContext, "status"), "draft"),
      symbol: text(pick(botContext, "symbol"), ""),
      timeframe: text(pick(botContext, "timeframe"), ""),
    },
    strategyContext: {
      strategyId: nullableText(pick(strategyContext, "strategy_id", "strategyId")),
      strategyVersionId: nullableText(pick(strategyContext, "strategy_version_id", "strategyVersionId")),
      sourceValid: pick(strategyContext, "source_valid", "sourceValid") !== false,
      versionLocked: pick(strategyContext, "version_locked", "versionLocked") !== false,
      dirty: pick(strategyContext, "dirty") === true,
    },
    datasetContext: {
      datasetKey: text(pick(datasetContext, "dataset_key", "datasetKey"), ""),
      exchange: text(pick(datasetContext, "exchange"), "binance"),
      symbol: text(pick(datasetContext, "symbol"), ""),
      timeframe: text(pick(datasetContext, "timeframe"), ""),
      startAt: text(pick(datasetContext, "start_at", "startAt"), ""),
      endAt: text(pick(datasetContext, "end_at", "endAt"), ""),
      preflightOutcome: text(pick(datasetContext, "preflight_outcome", "preflightOutcome"), ""),
    },
  }
}

function normalizePaperKillSwitchStatus(row: unknown): TradeLabPaperKillSwitchStatus {
  const record = asRecord(row)
  return {
    enabled: pick(record, "enabled") === true,
    reasonCode: text(pick(record, "reason_code", "reasonCode"), "paper_kill_switch_status_read"),
    safetyStatus: text(pick(record, "safety_status", "safetyStatus"), "read_only_paper_kill_switch_status"),
    source: text(pick(record, "source"), "config"),
    updatedAt: nullableText(pick(record, "updated_at", "updatedAt")),
    updatedBy: nullableText(pick(record, "updated_by", "updatedBy")),
    details: asRecord(pick(record, "details")),
  }
}

function normalizePaperSessionStart(row: unknown): TradeLabPaperSessionStartResult {
  const record = asRecord(row)
  const datasetContext = asRecord(pick(record, "dataset_context", "datasetContext"))

  return {
    sessionId: nullableText(pick(record, "session_id", "sessionId")),
    status: text(pick(record, "status"), "blocked"),
    allowed: pick(record, "allowed") === true,
    reasonCode: text(pick(record, "reason_code", "reasonCode"), ""),
    safetyStatus: text(pick(record, "safety_status", "safetyStatus"), ""),
    requestFingerprint: text(pick(record, "request_fingerprint", "requestFingerprint"), ""),
    idempotencyKey: text(pick(record, "idempotency_key", "idempotencyKey"), ""),
    failedGates: asArray(pick(record, "failed_gates", "failedGates")).map(normalizePaperSessionGateFailure),
    warnings: asArray(pick(record, "warnings")).map((item) => text(item, "")),
    details: asRecord(pick(record, "details")),
    datasetContext: {
      datasetKey: text(pick(datasetContext, "dataset_key", "datasetKey"), ""),
      exchange: text(pick(datasetContext, "exchange"), "binance"),
      symbol: text(pick(datasetContext, "symbol"), ""),
      timeframe: text(pick(datasetContext, "timeframe"), ""),
      startAt: text(pick(datasetContext, "start_at", "startAt"), ""),
      endAt: text(pick(datasetContext, "end_at", "endAt"), ""),
    },
    gateContext: asRecord(pick(record, "gate_context", "gateContext")),
    auditEventIds: asArray(pick(record, "audit_event_ids", "auditEventIds")).map((item) => text(item, "")),
  }
}

function normalizePaperSessionRunLocal(row: unknown): TradeLabPaperSessionRunLocalResult {
  const record = asRecord(row)
  return {
    status: text(pick(record, "status"), "blocked"),
    reasonCode: text(pick(record, "reason_code", "reasonCode"), ""),
    sessionId: nullableText(pick(record, "session_id", "sessionId")),
    candlesProcessed: numberValue(pick(record, "candles_processed", "candlesProcessed"), 0),
    ordersCreated: numberValue(pick(record, "orders_created", "ordersCreated"), 0),
    fillsCreated: numberValue(pick(record, "fills_created", "fillsCreated"), 0),
    snapshotsCreated: numberValue(pick(record, "snapshots_created", "snapshotsCreated"), 0),
    safetyStatus: text(pick(record, "safety_status", "safetyStatus"), ""),
    details: asRecord(pick(record, "details")),
  }
}

function normalizePaperSessionCancelLocal(row: unknown): TradeLabPaperSessionCancelLocalResult {
  const record = asRecord(row)
  return {
    status: text(pick(record, "status"), "blocked"),
    reasonCode: text(pick(record, "reason_code", "reasonCode"), ""),
    sessionId: nullableText(pick(record, "session_id", "sessionId")),
    previousStatus: nullableText(pick(record, "previous_status", "previousStatus")),
    currentStatus: nullableText(pick(record, "current_status", "currentStatus")),
    cancelRequestedAt: nullableText(pick(record, "cancel_requested_at", "cancelRequestedAt")),
    safetyStatus: text(pick(record, "safety_status", "safetyStatus"), ""),
    details: asRecord(pick(record, "details")),
  }
}

function normalizePaperSessionRetryLocal(row: unknown): TradeLabPaperSessionRetryLocalResult {
  const record = asRecord(row)
  return {
    status: text(pick(record, "status"), "blocked"),
    reasonCode: text(pick(record, "reason_code", "reasonCode"), ""),
    safetyStatus: text(pick(record, "safety_status", "safetyStatus"), "local_dev_paper_retry"),
    sourceSessionId: nullableText(pick(record, "source_session_id", "sourceSessionId")),
    retrySessionId: nullableText(pick(record, "retry_session_id", "retrySessionId")),
    sourceStatus: nullableText(pick(record, "source_status", "sourceStatus")),
    retryStatus: nullableText(pick(record, "retry_status", "retryStatus")),
    idempotencyKey: text(pick(record, "idempotency_key", "idempotencyKey"), ""),
    details: asRecord(pick(record, "details")),
  }
}

function normalizePaperSessionResumeReadinessCheckpoint(
  row: unknown,
): TradeLabPaperSessionResumeReadiness["checkpoint"] {
  const record = asRecord(row)
  if (Object.keys(record).length === 0) {
    return null
  }

  return {
    lastProcessedCandleId: text(pick(record, "last_processed_candle_id", "lastProcessedCandleId"), ""),
    lastProcessedCandleOpenTime: text(
      pick(record, "last_processed_candle_open_time", "lastProcessedCandleOpenTime"),
      "",
    ),
    nextCandleId: text(pick(record, "next_candle_id", "nextCandleId"), ""),
    nextCandleOpenTime: text(pick(record, "next_candle_open_time", "nextCandleOpenTime"), ""),
    cashBalance: numberValue(pick(record, "cash_balance", "cashBalance"), 0),
    equity: numberValue(pick(record, "equity"), 0),
    realizedPnl: numberValue(pick(record, "realized_pnl", "realizedPnl"), 0),
    unrealizedPnl: numberValue(pick(record, "unrealized_pnl", "unrealizedPnl"), 0),
    feesPaid: numberValue(pick(record, "fees_paid", "feesPaid"), 0),
    exposureNotional: numberValue(pick(record, "exposure_notional", "exposureNotional"), 0),
    openPositionQuantity: numberValue(pick(record, "open_position_quantity", "openPositionQuantity"), 0),
    averageEntryPrice: nullableNumber(pick(record, "average_entry_price", "averageEntryPrice")),
    pendingOrdersCount: numberValue(pick(record, "pending_orders_count", "pendingOrdersCount"), 0),
  }
}

function normalizePaperSessionResumeReadiness(row: unknown): TradeLabPaperSessionResumeReadiness {
  const record = asRecord(row)
  return {
    sessionId: text(pick(record, "session_id", "sessionId"), ""),
    status: text(pick(record, "status"), ""),
    reasonCode: text(pick(record, "reason_code", "reasonCode"), ""),
    allowed: pick(record, "allowed") === true,
    safetyStatus: text(pick(record, "safety_status", "safetyStatus"), "read_only_paper_resume_readiness"),
    checkpoint: normalizePaperSessionResumeReadinessCheckpoint(pick(record, "checkpoint")),
    checkpointSource: text(pick(record, "checkpoint_source", "checkpointSource"), ""),
    artifactIdentityStatus: text(pick(record, "artifact_identity_status", "artifactIdentityStatus"), ""),
    resumeMode: text(pick(record, "resume_mode", "resumeMode"), ""),
    attemptNo: nullableNumber(pick(record, "attempt_no", "attemptNo")),
    blockingReasons: asArray(pick(record, "blocking_reasons", "blockingReasons")).map((item) => text(item, "")),
    details: asRecord(pick(record, "details")),
  }
}

function normalizePaperSessionResumeCursor(row: unknown): TradeLabPaperSessionResumeLocalResult["resumeCursor"] {
  const record = asRecord(row)
  if (Object.keys(record).length === 0) {
    return null
  }

  return {
    lastProcessedCandleId: text(pick(record, "last_processed_candle_id", "lastProcessedCandleId"), ""),
    nextCandleOpenTime: text(pick(record, "next_candle_open_time", "nextCandleOpenTime"), ""),
    attemptNo: numberValue(pick(record, "attempt_no", "attemptNo"), 0),
  }
}

function normalizePaperSessionResumeLocal(row: unknown): TradeLabPaperSessionResumeLocalResult {
  const record = asRecord(row)
  return {
    status: text(pick(record, "status"), "blocked"),
    reasonCode: text(pick(record, "reason_code", "reasonCode"), ""),
    safetyStatus: text(pick(record, "safety_status", "safetyStatus"), "local_dev_paper_resume"),
    sourceSessionId: nullableText(pick(record, "source_session_id", "sourceSessionId")),
    resumeSessionId: nullableText(pick(record, "resume_session_id", "resumeSessionId")),
    sourceStatus: nullableText(pick(record, "source_status", "sourceStatus")),
    resumeStatus: nullableText(pick(record, "resume_status", "resumeStatus")),
    idempotencyKey: text(pick(record, "idempotency_key", "idempotencyKey"), ""),
    resumeCursor: normalizePaperSessionResumeCursor(pick(record, "resume_cursor", "resumeCursor")),
    details: asRecord(pick(record, "details")),
  }
}

function normalizePaperSessionDetailSession(row: unknown): TradeLabPaperSessionDetail["session"] {
  const record = asRecord(row)
  return {
    sessionId: text(pick(record, "session_id", "sessionId"), ""),
    botId: text(pick(record, "bot_id", "botId"), ""),
    strategyId: text(pick(record, "strategy_id", "strategyId"), ""),
    strategyVersionId: text(pick(record, "strategy_version_id", "strategyVersionId"), ""),
    mode: text(pick(record, "mode"), "paper"),
    status: text(pick(record, "status"), "unknown"),
    exchange: text(pick(record, "exchange"), "binance"),
    symbol: text(pick(record, "symbol"), ""),
    timeframe: text(pick(record, "timeframe"), ""),
    datasetKey: text(pick(record, "dataset_key", "datasetKey"), ""),
    startAt: text(pick(record, "start_at", "startAt"), ""),
    endAt: text(pick(record, "end_at", "endAt"), ""),
    startedAt: nullableText(pick(record, "started_at", "startedAt")),
    finishedAt: nullableText(pick(record, "finished_at", "finishedAt")),
    cancelRequestedAt: nullableText(pick(record, "cancel_requested_at", "cancelRequestedAt")),
    startingCash: numberValue(pick(record, "starting_cash", "startingCash"), 0),
    reasonCode: nullableText(pick(record, "reason_code", "reasonCode")),
    errorMessage: nullableText(pick(record, "error_message", "errorMessage")),
  }
}

function normalizePaperSessionAuditEvent(row: unknown): TradeLabPaperSessionDetail["auditEvents"][number] {
  const record = asRecord(row)
  return {
    auditEventId: text(pick(record, "audit_event_id", "auditEventId"), ""),
    eventAt: text(pick(record, "event_at", "eventAt"), ""),
    actor: nullableText(pick(record, "actor")),
    action: text(pick(record, "action"), ""),
    targetType: text(pick(record, "target_type", "targetType"), ""),
    targetId: nullableText(pick(record, "target_id", "targetId")),
    oldState: nullableText(pick(record, "old_state", "oldState")),
    newState: nullableText(pick(record, "new_state", "newState")),
    reasonCode: nullableText(pick(record, "reason_code", "reasonCode")),
    correlationId: nullableText(pick(record, "correlation_id", "correlationId")),
    requestId: nullableText(pick(record, "request_id", "requestId")),
    metadata: asRecord(pick(record, "metadata")),
    createdAt: nullableText(pick(record, "created_at", "createdAt")),
    createdBy: nullableText(pick(record, "created_by", "createdBy")),
  }
}

function normalizePaperSessionOrder(row: unknown): TradeLabPaperSessionDetail["artifacts"]["orders"][number] {
  const record = asRecord(row)
  return {
    orderId: text(pick(record, "order_id", "orderId"), ""),
    side: text(pick(record, "side"), ""),
    orderType: text(pick(record, "order_type", "orderType"), ""),
    status: text(pick(record, "status"), ""),
    quantity: numberValue(pick(record, "quantity"), 0),
    requestedPrice: nullableNumberValue(pick(record, "requested_price", "requestedPrice")),
    requestedNotional: nullableNumberValue(pick(record, "requested_notional", "requestedNotional")),
    submittedAt: nullableText(pick(record, "submitted_at", "submittedAt")),
    finalizedAt: nullableText(pick(record, "finalized_at", "finalizedAt")),
    reasonCode: nullableText(pick(record, "reason_code", "reasonCode")),
    metadata: asRecord(pick(record, "metadata")),
  }
}

function normalizePaperSessionFill(row: unknown): TradeLabPaperSessionDetail["artifacts"]["fills"][number] {
  const record = asRecord(row)
  return {
    fillId: text(pick(record, "fill_id", "fillId"), ""),
    paperOrderId: text(pick(record, "paper_order_id", "paperOrderId"), ""),
    sourceCandleId: nullableText(pick(record, "source_candle_id", "sourceCandleId")),
    fillTime: text(pick(record, "fill_time", "fillTime"), ""),
    side: text(pick(record, "side"), ""),
    price: numberValue(pick(record, "price"), 0),
    quantity: numberValue(pick(record, "quantity"), 0),
    notional: numberValue(pick(record, "notional"), 0),
    feeAmount: numberValue(pick(record, "fee_amount", "feeAmount"), 0),
    feeAsset: nullableText(pick(record, "fee_asset", "feeAsset")),
    slippageAmount: numberValue(pick(record, "slippage_amount", "slippageAmount"), 0),
    metadata: asRecord(pick(record, "metadata")),
  }
}

function normalizePaperSessionPosition(row: unknown): TradeLabPaperSessionDetail["artifacts"]["positions"][number] {
  const record = asRecord(row)
  return {
    positionId: text(pick(record, "position_id", "positionId"), ""),
    symbol: text(pick(record, "symbol"), ""),
    side: text(pick(record, "side"), ""),
    status: text(pick(record, "status"), ""),
    quantity: numberValue(pick(record, "quantity"), 0),
    averageEntryPrice: nullableNumberValue(pick(record, "average_entry_price", "averageEntryPrice")),
    realizedPnl: numberValue(pick(record, "realized_pnl", "realizedPnl"), 0),
    unrealizedPnl: numberValue(pick(record, "unrealized_pnl", "unrealizedPnl"), 0),
    openedAt: nullableText(pick(record, "opened_at", "openedAt")),
    closedAt: nullableText(pick(record, "closed_at", "closedAt")),
    metadata: asRecord(pick(record, "metadata")),
  }
}

function normalizePaperSessionPortfolioSnapshot(
  row: unknown,
): TradeLabPaperSessionDetail["artifacts"]["portfolioSnapshots"][number] {
  const record = asRecord(row)
  return {
    snapshotId: text(pick(record, "snapshot_id", "snapshotId"), ""),
    sourceCandleId: nullableText(pick(record, "source_candle_id", "sourceCandleId")),
    snapshotAt: text(pick(record, "snapshot_at", "snapshotAt"), ""),
    cashBalance: numberValue(pick(record, "cash_balance", "cashBalance"), 0),
    equity: numberValue(pick(record, "equity"), 0),
    realizedPnl: numberValue(pick(record, "realized_pnl", "realizedPnl"), 0),
    unrealizedPnl: numberValue(pick(record, "unrealized_pnl", "unrealizedPnl"), 0),
    feesPaid: numberValue(pick(record, "fees_paid", "feesPaid"), 0),
    drawdownPct: numberValue(pick(record, "drawdown_pct", "drawdownPct"), 0),
    exposureNotional: numberValue(pick(record, "exposure_notional", "exposureNotional"), 0),
    metadata: asRecord(pick(record, "metadata")),
  }
}

function normalizePaperSessionArtifactLimits(row: unknown): TradeLabPaperSessionDetail["artifacts"]["limits"] {
  const record = asRecord(row)
  return {
    orders: numberValue(pick(record, "orders"), 0),
    fills: numberValue(pick(record, "fills"), 0),
    positions: numberValue(pick(record, "positions"), 0),
    portfolioSnapshots: numberValue(pick(record, "portfolio_snapshots", "portfolioSnapshots"), 0),
    auditEvents: numberValue(pick(record, "audit_events", "auditEvents"), 0),
  }
}

function normalizePaperSessionDetail(row: unknown): TradeLabPaperSessionDetail {
  const record = asRecord(row)
  const artifacts = asRecord(pick(record, "artifacts"))
  return {
    session: normalizePaperSessionDetailSession(pick(record, "session")),
    datasetContext: asRecord(pick(record, "dataset_context", "datasetContext")),
    gateContext: asRecord(pick(record, "gate_context", "gateContext")),
    auditEvents: asArray(pick(record, "audit_events", "auditEvents")).map(normalizePaperSessionAuditEvent),
    artifacts: {
      orders: asArray(pick(artifacts, "orders")).map(normalizePaperSessionOrder),
      fills: asArray(pick(artifacts, "fills")).map(normalizePaperSessionFill),
      positions: asArray(pick(artifacts, "positions")).map(normalizePaperSessionPosition),
      portfolioSnapshots: asArray(pick(artifacts, "portfolio_snapshots", "portfolioSnapshots")).map(
        normalizePaperSessionPortfolioSnapshot,
      ),
      limits: normalizePaperSessionArtifactLimits(pick(artifacts, "limits")),
    },
    safetyStatus: text(pick(record, "safety_status", "safetyStatus"), "read_only_paper_session_detail"),
  }
}

function normalizePaperSessionObservabilityItem(row: unknown): TradeLabPaperSessionObservability["items"][number] {
  const record = asRecord(row)
  const artifactCounts = asRecord(pick(record, "artifact_counts", "artifactCounts"))
  const latestAudit = pick(record, "latest_audit", "latestAudit")
  const latestAuditRecord = latestAudit == null ? null : asRecord(latestAudit)
  const gateSummary = asRecord(pick(record, "gate_summary", "gateSummary"))
  return {
    sessionId: text(pick(record, "session_id", "sessionId"), ""),
    status: text(pick(record, "status"), "unknown"),
    reasonCode: nullableText(pick(record, "reason_code", "reasonCode")),
    safetyStatus: text(pick(record, "safety_status", "safetyStatus"), "read_only_paper_session_observability"),
    strategyId: text(pick(record, "strategy_id", "strategyId"), ""),
    strategyVersionId: text(pick(record, "strategy_version_id", "strategyVersionId"), ""),
    datasetKey: text(pick(record, "dataset_key", "datasetKey"), ""),
    exchange: text(pick(record, "exchange"), "binance"),
    symbol: text(pick(record, "symbol"), ""),
    timeframe: text(pick(record, "timeframe"), ""),
    startAt: text(pick(record, "start_at", "startAt"), ""),
    endAt: text(pick(record, "end_at", "endAt"), ""),
    createdAt: text(pick(record, "created_at", "createdAt"), ""),
    startedAt: nullableText(pick(record, "started_at", "startedAt")),
    finishedAt: nullableText(pick(record, "finished_at", "finishedAt")),
    errorMessage: nullableText(pick(record, "error_message", "errorMessage")),
    artifactCounts: {
      orders: numberValue(pick(artifactCounts, "orders"), 0),
      fills: numberValue(pick(artifactCounts, "fills"), 0),
      positions: numberValue(pick(artifactCounts, "positions"), 0),
      portfolioSnapshots: numberValue(pick(artifactCounts, "portfolio_snapshots", "portfolioSnapshots"), 0),
      auditEvents: numberValue(pick(artifactCounts, "audit_events", "auditEvents"), 0),
    },
    latestAudit: latestAuditRecord
      ? {
          auditEventId: text(pick(latestAuditRecord, "audit_event_id", "auditEventId"), ""),
          eventAt: text(pick(latestAuditRecord, "event_at", "eventAt"), ""),
          action: text(pick(latestAuditRecord, "action"), ""),
          reasonCode: nullableText(pick(latestAuditRecord, "reason_code", "reasonCode")),
          newState: nullableText(pick(latestAuditRecord, "new_state", "newState")),
          actor: nullableText(pick(latestAuditRecord, "actor")),
          metadata: asRecord(pick(latestAuditRecord, "metadata")),
        }
      : null,
    gateSummary: {
      failedGateCount: numberValue(pick(gateSummary, "failed_gate_count", "failedGateCount"), 0),
      failedGateReasons: asArray(pick(gateSummary, "failed_gate_reasons", "failedGateReasons")).map((item) =>
        text(item, ""),
      ),
      blockedReasonCode: nullableText(pick(gateSummary, "blocked_reason_code", "blockedReasonCode")),
    },
  }
}

function normalizePaperSessionObservability(row: unknown): TradeLabPaperSessionObservability {
  const record = asRecord(row)
  return {
    safetyStatus: text(pick(record, "safety_status", "safetyStatus"), "read_only_paper_session_observability"),
    items: asArray(pick(record, "items")).map(normalizePaperSessionObservabilityItem),
    hasMore: pick(record, "has_more", "hasMore") === true,
  }
}

function normalizeDatasetLocalFillRange(row: unknown): TradeLabDatasetLocalFillResult["rangesFilled"][number] {
  const record = asRecord(row)
  return {
    startAt: text(pick(record, "start_at", "startAt"), ""),
    endAt: text(pick(record, "end_at", "endAt"), ""),
    kind: text(pick(record, "kind"), "fill") as TradeLabDatasetLocalFillResult["rangesFilled"][number]["kind"],
    rowsFetched: numberValue(pick(record, "rows_fetched", "rowsFetched"), 0),
    rowsInserted: numberValue(pick(record, "rows_inserted", "rowsInserted"), 0),
    rowsSkippedExisting: numberValue(pick(record, "rows_skipped_existing", "rowsSkippedExisting"), 0),
  }
}

function normalizeDatasetFillEnqueueRange(row: unknown): TradeLabDatasetFillEnqueueLocalResult["requestedRange"] {
  const record = asRecord(row)
  return {
    startAt: text(pick(record, "start_at", "startAt"), ""),
    endAt: text(pick(record, "end_at", "endAt"), ""),
  }
}

function normalizeDatasetFillEnqueueResult(row: unknown): TradeLabDatasetFillEnqueueLocalResult {
  const record = asRecord(row)
  return {
    jobId: text(pick(record, "job_id", "jobId"), ""),
    datasetKey: text(pick(record, "dataset_key", "datasetKey"), ""),
    status: text(pick(record, "status"), "queued"),
    safetyStatus: text(pick(record, "safety_status", "safetyStatus"), "queued_local_dev"),
    requestedRange: normalizeDatasetFillEnqueueRange(pick(record, "requested_range", "requestedRange")),
    missingRangeCount: numberValue(pick(record, "missing_range_count", "missingRangeCount"), 0),
    previewId: text(pick(record, "preview_id", "previewId"), ""),
    requestFingerprint: text(pick(record, "request_fingerprint", "requestFingerprint"), ""),
  }
}

function normalizeDatasetLocalFillResult(row: unknown): TradeLabDatasetLocalFillResult {
  const record = asRecord(row)
  const requestedRange = asRecord(pick(record, "requested_range", "requestedRange"))
  return {
    jobId: text(pick(record, "job_id", "jobId"), ""),
    datasetKey: text(pick(record, "dataset_key", "datasetKey"), ""),
    status: text(pick(record, "status"), "failed") as TradeLabDatasetLocalFillResult["status"],
    safetyStatus: "local_dev_fill_only",
    requestedRange: {
      startAt: text(pick(requestedRange, "start_at", "startAt"), ""),
      endAt: text(pick(requestedRange, "end_at", "endAt"), ""),
    },
    rangesFilled: asArray(pick(record, "ranges_filled", "rangesFilled")).map(normalizeDatasetLocalFillRange),
    rowsFetched: numberValue(pick(record, "rows_fetched", "rowsFetched"), 0),
    rowsInserted: numberValue(pick(record, "rows_inserted", "rowsInserted"), 0),
    rowsSkippedExisting: numberValue(pick(record, "rows_skipped_existing", "rowsSkippedExisting"), 0),
    blockedReasons: asArray(pick(record, "blocked_reasons", "blockedReasons")).map((item) => text(item, "")),
    previewId: text(pick(record, "preview_id", "previewId"), ""),
    requestFingerprint: text(pick(record, "request_fingerprint", "requestFingerprint"), ""),
  }
}

function normalizeDatasetLocalFillAuditRange(row: unknown): TradeLabDatasetLocalFillAudit["items"][number]["requestedRange"] {
  const record = asRecord(row)
  return {
    startAt: nullableText(pick(record, "start_at", "startAt")),
    endAt: nullableText(pick(record, "end_at", "endAt")),
    kind: nullableText(pick(record, "kind")),
    metadata: asRecord(pick(record, "metadata")),
  }
}

function normalizeDatasetLocalFillAuditItem(row: unknown): TradeLabDatasetLocalFillAudit["items"][number] {
  const record = asRecord(row)
  return {
    jobId: text(pick(record, "job_id", "jobId"), ""),
    status: text(pick(record, "status"), "failed"),
    createdAt: text(pick(record, "created_at", "createdAt"), ""),
    finishedAt: nullableText(pick(record, "finished_at", "finishedAt")),
    requestedRange: normalizeDatasetLocalFillAuditRange(pick(record, "requested_range", "requestedRange")),
    appliedRange: normalizeDatasetLocalFillAuditRange(pick(record, "applied_range", "appliedRange")),
    rowsImported: numberValue(pick(record, "rows_imported", "rowsImported"), 0),
    rowsFetched: numberValue(pick(record, "rows_fetched", "rowsFetched"), 0),
    rowsInserted: numberValue(pick(record, "rows_inserted", "rowsInserted"), 0),
    rowsSkippedExisting: numberValue(pick(record, "rows_skipped_existing", "rowsSkippedExisting"), 0),
    errorMessage: nullableText(pick(record, "error_message", "errorMessage")),
    reasonCode: nullableText(pick(record, "reason_code", "reasonCode")),
    providerStatus: nullableText(pick(record, "provider_status", "providerStatus")),
    previewId: nullableText(pick(record, "preview_id", "previewId")),
    requestFingerprint: nullableText(pick(record, "request_fingerprint", "requestFingerprint")),
    missingRanges: asArray(pick(record, "missing_ranges", "missingRanges")).map(asRecord),
    rangeResults: asArray(pick(record, "range_results", "rangeResults")).map(asRecord),
  }
}

function normalizeDatasetLocalFillAudit(row: unknown): TradeLabDatasetLocalFillAudit {
  const record = asRecord(row)
  return {
    datasetKey: text(pick(record, "dataset_key", "datasetKey"), ""),
    exchange: text(pick(record, "exchange"), "binance"),
    symbol: text(pick(record, "symbol"), ""),
    timeframe: text(pick(record, "timeframe"), ""),
    safetyStatus: "read_only",
    items: asArray(pick(record, "items")).map(normalizeDatasetLocalFillAuditItem),
  }
}

function normalizeDatasetFillJobVisibilityRange(row: unknown): TradeLabDatasetFillJobVisibilityRange {
  const record = asRecord(row)
  return {
    startAt: nullableText(pick(record, "start_at", "startAt")),
    endAt: nullableText(pick(record, "end_at", "endAt")),
  }
}

function normalizeDatasetFillJobVisibilityItem(row: unknown): TradeLabDatasetFillJobVisibilityItem {
  const record = asRecord(row)
  return {
    jobId: text(pick(record, "job_id", "jobId"), ""),
    datasetKey: text(pick(record, "dataset_key", "datasetKey"), ""),
    jobType: text(pick(record, "job_type", "jobType"), "fill"),
    status: text(pick(record, "status"), "queued"),
    requestedRange: normalizeDatasetFillJobVisibilityRange(pick(record, "requested_range", "requestedRange")),
    appliedRange: normalizeDatasetFillJobVisibilityRange(pick(record, "applied_range", "appliedRange")),
    rowsImported: numberValue(pick(record, "rows_imported", "rowsImported"), 0),
    rowsFetched: numberValue(pick(record, "rows_fetched", "rowsFetched"), 0),
    rowsInserted: numberValue(pick(record, "rows_inserted", "rowsInserted"), 0),
    rowsSkippedExisting: numberValue(pick(record, "rows_skipped_existing", "rowsSkippedExisting"), 0),
    reasonCode: nullableText(pick(record, "reason_code", "reasonCode")),
    providerStatus: nullableText(pick(record, "provider_status", "providerStatus")),
    attemptCount: numberValue(pick(record, "attempt_count", "attemptCount"), 1),
    workerId: nullableText(pick(record, "worker_id", "workerId")),
    createdAt: text(pick(record, "created_at", "createdAt"), ""),
    startedAt: nullableText(pick(record, "started_at", "startedAt")),
    finishedAt: nullableText(pick(record, "finished_at", "finishedAt")),
    heartbeatAt: nullableText(pick(record, "heartbeat_at", "heartbeatAt")),
    metadata: asRecord(pick(record, "metadata")),
  }
}

function normalizeDatasetFillJobVisibility(row: unknown): TradeLabDatasetFillJobVisibility {
  const record = asRecord(row)
  return {
    datasetKey: text(pick(record, "dataset_key", "datasetKey"), ""),
    exchange: text(pick(record, "exchange"), "binance"),
    symbol: text(pick(record, "symbol"), ""),
    timeframe: text(pick(record, "timeframe"), ""),
    safetyStatus: "read_only",
    active: asArray(pick(record, "active")).map(normalizeDatasetFillJobVisibilityItem),
    recent: asArray(pick(record, "recent")).map(normalizeDatasetFillJobVisibilityItem),
  }
}

function normalizeFillSchedulerStatus(row: unknown): TradeLabFillSchedulerStatus {
  const record = asRecord(row)
  return {
    enabled: pick(record, "enabled") === true,
    running: pick(record, "running") === true,
    workerId: text(pick(record, "worker_id", "workerId"), "trade-lab-local-scheduler"),
    intervalSeconds: numberValue(pick(record, "interval_seconds", "intervalSeconds"), 60),
    lastTickStartedAt: nullableText(pick(record, "last_tick_started_at", "lastTickStartedAt")),
    lastTickCompletedAt: nullableText(pick(record, "last_tick_completed_at", "lastTickCompletedAt")),
    lastTickStatus: text(pick(record, "last_tick_status", "lastTickStatus"), "disabled"),
    lastSkipReason: nullableText(pick(record, "last_skip_reason", "lastSkipReason")),
    lastReasonCode: nullableText(pick(record, "last_reason_code", "lastReasonCode")),
    lastJobId: nullableText(pick(record, "last_job_id", "lastJobId")),
    lastDatasetKey: nullableText(pick(record, "last_dataset_key", "lastDatasetKey")),
    staleJobsMarked: numberValue(pick(record, "stale_jobs_marked", "staleJobsMarked"), 0),
    consecutiveFailureCount: numberValue(pick(record, "consecutive_failure_count", "consecutiveFailureCount"), 0),
    safetyStatus: text(pick(record, "safety_status", "safetyStatus"), "read_only_scheduler_visibility"),
  }
}

function normalizePaperSchedulerStatus(row: unknown): TradeLabPaperSchedulerStatus {
  const record = asRecord(row)
  return {
    enabled: pick(record, "enabled") === true,
    running: pick(record, "running") === true,
    workerId: text(pick(record, "worker_id", "workerId"), "tradelab-local-paper-scheduler"),
    intervalSeconds: numberValue(pick(record, "interval_seconds", "intervalSeconds"), 60),
    lastTickStartedAt: nullableText(pick(record, "last_tick_started_at", "lastTickStartedAt")),
    lastTickCompletedAt: nullableText(pick(record, "last_tick_completed_at", "lastTickCompletedAt")),
    lastTickStatus: text(pick(record, "last_tick_status", "lastTickStatus"), "disabled"),
    lastSkipReason: nullableText(pick(record, "last_skip_reason", "lastSkipReason")),
    lastReasonCode: nullableText(pick(record, "last_reason_code", "lastReasonCode")),
    lastSessionId: nullableText(pick(record, "last_session_id", "lastSessionId")),
    candlesProcessed: numberValue(pick(record, "candles_processed", "candlesProcessed"), 0),
    ordersCreated: numberValue(pick(record, "orders_created", "ordersCreated"), 0),
    fillsCreated: numberValue(pick(record, "fills_created", "fillsCreated"), 0),
    snapshotsCreated: numberValue(pick(record, "snapshots_created", "snapshotsCreated"), 0),
    consecutiveFailureCount: numberValue(pick(record, "consecutive_failure_count", "consecutiveFailureCount"), 0),
    safetyStatus: text(pick(record, "safety_status", "safetyStatus"), "read_only_paper_scheduler_visibility"),
  }
}

function normalizeDataJobSummary(row: unknown): TradeLabDataJobSummary | null {
  const record = asRecord(row)
  if (Object.keys(record).length === 0) {
    return null
  }

  return {
    id: text(pick(record, "id"), ""),
    coverageId: nullableText(pick(record, "coverage_id", "coverageId")),
    datasetKey: text(pick(record, "dataset_key", "datasetKey"), ""),
    jobType: text(pick(record, "job_type", "jobType"), "fill") as TradeLabDataJobSummary["jobType"],
    exchange: text(pick(record, "exchange"), "binance"),
    symbol: text(pick(record, "symbol"), ""),
    timeframe: text(pick(record, "timeframe"), ""),
    requestedStartAt: text(pick(record, "requested_start_at", "requestedStartAt"), ""),
    requestedEndAt: text(pick(record, "requested_end_at", "requestedEndAt"), ""),
    appliedStartAt: nullableText(pick(record, "applied_start_at", "appliedStartAt")),
    appliedEndAt: nullableText(pick(record, "applied_end_at", "appliedEndAt")),
    claimedAt: nullableText(pick(record, "claimed_at", "claimedAt")),
    startedAt: nullableText(pick(record, "started_at", "startedAt")),
    finishedAt: nullableText(pick(record, "finished_at", "finishedAt")),
    workerId: nullableText(pick(record, "worker_id", "workerId")),
    status: text(pick(record, "status"), "queued") as TradeLabDataJobSummary["status"],
    rowsImported: numberValue(pick(record, "rows_imported", "rowsImported")),
    errorMessage: nullableText(pick(record, "error_message", "errorMessage")),
    metadata: asRecord(pick(record, "metadata")),
    createdAt: text(pick(record, "created_at", "createdAt"), ""),
    createdBy: nullableText(pick(record, "created_by", "createdBy")),
  }
}

function normalizeRunSnapshot(row: unknown): TradeLabRunSnapshot | undefined {
  const record = asRecord(row)
  if (Object.keys(record).length === 0) {
    return undefined
  }

  return {
    sourceSnapshot: asRecord(pick(record, "source_snapshot", "sourceSnapshot")),
    datasetContext: asRecord(pick(record, "dataset_context", "datasetContext")),
    pipelineContext: asRecord(pick(record, "pipeline_context", "pipelineContext")),
  }
}

function normalizeRunHistoryEntry(row: unknown): TradeLabRunHistoryEntry {
  const record = asRecord(row)
  return {
    id: text(pick(record, "id"), ""),
    botId: nullableText(pick(record, "bot_id", "botId")),
    strategyId: text(pick(record, "strategy_id", "strategyId"), ""),
    strategyVersionId: text(pick(record, "strategy_version_id", "strategyVersionId"), ""),
    runType: text(pick(record, "run_type", "runType"), "backtest"),
    status: text(pick(record, "status"), "queued") as TradeLabRunHistoryEntry["status"],
    pipelineStatus: text(pick(record, "pipeline_status", "pipelineStatus"), "queued") as TradeLabPipelineStatus,
    exchange: text(pick(record, "exchange"), "binance"),
    symbol: text(pick(record, "symbol"), ""),
    timeframe: text(pick(record, "timeframe"), ""),
    startAt: text(pick(record, "start_at", "startAt"), ""),
    endAt: text(pick(record, "end_at", "endAt"), ""),
    startedAt: nullableText(pick(record, "started_at", "startedAt")),
    finishedAt: nullableText(pick(record, "finished_at", "finishedAt")),
    dataJobId: nullableText(pick(record, "data_job_id", "dataJobId")),
    errorMessage: nullableText(pick(record, "error_message", "errorMessage")),
    createdAt: text(pick(record, "created_at", "createdAt"), ""),
    createdBy: nullableText(pick(record, "created_by", "createdBy")),
    snapshot: normalizeRunSnapshot(pick(record, "snapshot")),
  }
}

function normalizeChartMarker(row: unknown): TradeLabChartMarker {
  const record = asRecord(row)
  return {
    id: text(pick(record, "id"), crypto.randomUUID()),
    timestamp: text(pick(record, "timestamp"), ""),
    kind: text(pick(record, "kind"), "buy") as TradeLabChartMarker["kind"],
    side: text(pick(record, "side"), "buy") as TradeLabChartMarker["side"],
    price: nullableNumber(pick(record, "price")),
    quantity: nullableNumber(pick(record, "quantity")),
    tradeOrderId: nullableText(pick(record, "trade_order_id", "tradeOrderId")),
    strategySignalId: nullableText(pick(record, "strategy_signal_id", "strategySignalId")),
    message: nullableText(pick(record, "message")),
    payload: asRecord(pick(record, "payload")),
    signal: asRecord(pick(record, "signal")),
  }
}

function normalizeTradeDetail(row: unknown): TradeLabTradeDetail | null {
  const record = asRecord(row)
  if (Object.keys(record).length === 0) {
    return null
  }

  return {
    marker: normalizeChartMarker(pick(record, "marker")),
    order: asRecord(pick(record, "order")),
    signal: asRecord(pick(record, "signal")),
    logs: asArray(pick(record, "logs")).map(normalizeLogEntry),
  }
}

function normalizeRunPipeline(row: unknown): TradeLabRunPipeline | null {
  const record = asRecord(row)
  if (Object.keys(record).length === 0) {
    return null
  }

  return {
    run: normalizeRunHistoryEntry(pick(record, "run")),
    preflight: normalizePreflightResult(pick(record, "preflight")),
    dataJob: normalizeDataJobSummary(pick(record, "data_job", "dataJob")),
    backtestJob: asRecord(pick(record, "backtest_job", "backtestJob")),
    status: text(pick(record, "status"), "queued") as TradeLabPipelineStatus,
    message: nullableText(pick(record, "message")),
  }
}

function normalizeJobVisibilityItem(row: unknown): TradeLabJobVisibilityItem {
  const record = asRecord(row)
  const pipeline = normalizeRunPipeline(record) ?? {
    run: normalizeRunHistoryEntry(pick(record, "run")),
    preflight: null,
    dataJob: null,
    backtestJob: null,
    status: text(pick(record, "status"), "queued") as TradeLabPipelineStatus,
    message: nullableText(pick(record, "message")),
  }

  return {
    ...pipeline,
    isStale: pick(record, "is_stale", "isStale") === true,
    staleReason: nullableText(pick(record, "stale_reason", "staleReason")),
    lastActivityAt: nullableText(pick(record, "last_activity_at", "lastActivityAt")),
  }
}

function normalizeStrategyJobVisibility(row: unknown): TradeLabStrategyJobVisibility {
  const record = asRecord(row)
  return {
    strategyId: text(pick(record, "strategy_id", "strategyId"), ""),
    active: asArray(pick(record, "active")).map(normalizeJobVisibilityItem),
    recent: asArray(pick(record, "recent")).map(normalizeJobVisibilityItem),
    staleThresholdMinutes: numberValue(pick(record, "stale_threshold_minutes", "staleThresholdMinutes"), 10),
  }
}

function normalizeRunChart(row: unknown): TradeLabRunChart {
  const record = asRecord(row)
  return {
    candles: asArray(pick(record, "candles")).map((item) => {
      const candle = asRecord(item)
      return {
        openTime: text(pick(candle, "open_time", "openTime"), ""),
        closeTime: nullableText(pick(candle, "close_time", "closeTime")) ?? undefined,
        open: numberValue(pick(candle, "open"), 0),
        high: numberValue(pick(candle, "high"), 0),
        low: numberValue(pick(candle, "low"), 0),
        close: numberValue(pick(candle, "close"), 0),
        volume: numberValue(pick(candle, "volume"), 0),
      }
    }),
    markers: asArray(pick(record, "markers")).map(normalizeChartMarker),
    equityCurve: asArray(pick(record, "equity_curve", "equityCurve")).map(normalizeEquityPoint),
    selectedTrade: normalizeTradeDetail(pick(record, "selected_trade", "selectedTrade")),
  }
}

function normalizeAnalyzedTrade(row: unknown): TradeLabAnalyzedTrade {
  const record = asRecord(row)
  return {
    id: text(pick(record, "id"), crypto.randomUUID()),
    entryOrderId: text(pick(record, "entry_order_id", "entryOrderId"), ""),
    exitOrderId: nullableText(pick(record, "exit_order_id", "exitOrderId")),
    entryTime: text(pick(record, "entry_time", "entryTime"), ""),
    exitTime: nullableText(pick(record, "exit_time", "exitTime")),
    side: text(pick(record, "side"), "buy") as TradeLabAnalyzedTrade["side"],
    status: text(pick(record, "status"), "open") as TradeLabAnalyzedTrade["status"],
    entryPrice: nullableNumber(pick(record, "entry_price", "entryPrice")),
    exitPrice: nullableNumber(pick(record, "exit_price", "exitPrice")),
    quantity: nullableNumber(pick(record, "quantity")),
    pnl: nullableNumber(pick(record, "pnl")),
    pnlPct: nullableNumber(pick(record, "pnl_pct", "pnlPct")),
    durationSeconds: nullableNumber(pick(record, "duration_seconds", "durationSeconds")),
    entrySignalId: nullableText(pick(record, "entry_signal_id", "entrySignalId")),
    exitSignalId: nullableText(pick(record, "exit_signal_id", "exitSignalId")),
    entryReason: nullableText(pick(record, "entry_reason", "entryReason")),
    exitReason: nullableText(pick(record, "exit_reason", "exitReason")),
  }
}

function normalizeTradeSummary(row: unknown): TradeLabTradeSummary | null {
  const record = asRecord(row)
  if (Object.keys(record).length === 0) {
    return null
  }

  return {
    totalTrades: numberValue(pick(record, "total_trades", "totalTrades")),
    closedTrades: numberValue(pick(record, "closed_trades", "closedTrades")),
    openTrades: numberValue(pick(record, "open_trades", "openTrades")),
    winningTrades: numberValue(pick(record, "winning_trades", "winningTrades")),
    losingTrades: numberValue(pick(record, "losing_trades", "losingTrades")),
    breakEvenTrades: numberValue(pick(record, "break_even_trades", "breakEvenTrades")),
    realizedPnl: numberValue(pick(record, "realized_pnl", "realizedPnl")),
    averagePnl: nullableNumber(pick(record, "average_pnl", "averagePnl")),
    averagePnlPct: nullableNumber(pick(record, "average_pnl_pct", "averagePnlPct")),
    averageDurationSeconds: nullableNumber(pick(record, "average_duration_seconds", "averageDurationSeconds")),
    winRatePct: nullableNumber(pick(record, "win_rate_pct", "winRatePct")),
    profitFactor: nullableNumber(pick(record, "profit_factor", "profitFactor")),
  }
}

function normalizeRunAnalysisResult(row: unknown): TradeLabRunAnalysisResult | null {
  const record = asRecord(row)
  if (Object.keys(record).length === 0) {
    return null
  }

  const metrics = normalizeMetrics(pick(record, "metrics"))
  return {
    id: text(pick(record, "id"), ""),
    botRunId: text(pick(record, "bot_run_id", "botRunId"), ""),
    initialEquity: numberValue(pick(record, "initial_equity", "initialEquity")),
    finalEquity: numberValue(pick(record, "final_equity", "finalEquity")),
    totalReturnPct: numberValue(pick(record, "total_return_pct", "totalReturnPct")),
    maxDrawdownPct: numberValue(pick(record, "max_drawdown_pct", "maxDrawdownPct")),
    profitFactor: nullableNumber(pick(record, "profit_factor", "profitFactor")),
    winRatePct: nullableNumber(pick(record, "win_rate_pct", "winRatePct")),
    totalTrades: numberValue(pick(record, "total_trades", "totalTrades")),
    metrics: metrics ?? {
      initialEquity: 0,
      finalEquity: 0,
      totalReturnPct: 0,
      maxDrawdownPct: 0,
      profitFactor: null,
      winRatePct: null,
      totalTrades: 0,
      closedTrades: 0,
    },
    equityCurve: asArray(pick(record, "equity_curve", "equityCurve")).map(normalizeEquityPoint),
    createdAt: text(pick(record, "created_at", "createdAt"), ""),
  }
}
function normalizeBacktestPosition(row: unknown): BacktestPosition {
  const record = asRecord(row)
  return {
    id: text(pick(record, "id"), ""),
    runId: text(pick(record, "run_id", "runId"), ""),
    symbol: text(pick(record, "symbol"), ""),
    side: text(pick(record, "side"), "LONG") as BacktestPosition["side"],
    size: numberValue(pick(record, "size"), 0),
    leverage: numberValue(pick(record, "leverage"), 1),
    entryPrice: numberValue(pick(record, "entry_price", "entryPrice"), 0),
    closePrice: nullableNumber(pick(record, "close_price", "closePrice")),
    liquidationPrice: nullableNumber(pick(record, "liquidation_price", "liquidationPrice")),
    marginMode: nullableText(pick(record, "margin_mode", "marginMode")),
    maintenanceMargin: nullableNumber(pick(record, "maintenance_margin", "maintenanceMargin")),
    fundingFeePaid: numberValue(pick(record, "funding_fee_paid", "fundingFeePaid"), 0),
    maxNotional: nullableNumber(pick(record, "max_notional", "maxNotional")),
    maxMarginUsed: nullableNumber(pick(record, "max_margin_used", "maxMarginUsed")),
    peakLeverageUsed: nullableNumber(pick(record, "peak_leverage_used", "peakLeverageUsed")),
    realizedPnl: numberValue(pick(record, "realized_pnl", "realizedPnl"), 0),
    status: text(pick(record, "status"), "OPEN") as BacktestPosition["status"],
  }
}

function normalizeFuturesResearchSummary(row: unknown): TradeLabFuturesResearchSummary | null {
  const record = asRecord(row)
  if (Object.keys(record).length === 0) {
    return null
  }
  return {
    totalFundingFeePaid: numberValue(pick(record, "total_funding_fee_paid", "totalFundingFeePaid"), 0),
    totalFundingFeeReceived: numberValue(pick(record, "total_funding_fee_received", "totalFundingFeeReceived"), 0),
    liquidationCount: numberValue(pick(record, "liquidation_count", "liquidationCount"), 0),
    longTrades: numberValue(pick(record, "long_trades", "longTrades"), 0),
    shortTrades: numberValue(pick(record, "short_trades", "shortTrades"), 0),
    longWinRate: nullableNumber(pick(record, "long_win_rate", "longWinRate")),
    shortWinRate: nullableNumber(pick(record, "short_win_rate", "shortWinRate")),
    avgLeverageUsed: nullableNumber(pick(record, "avg_leverage_used", "avgLeverageUsed")),
    maxMarginUsagePct: nullableNumber(pick(record, "max_margin_usage_pct", "maxMarginUsagePct")),
    maxMaintenanceMarginPct: nullableNumber(pick(record, "max_maintenance_margin_pct", "maxMaintenanceMarginPct")),
  }
}


function normalizeRunAnalysisDatasetContext(row: unknown): TradeLabRunAnalysisDatasetContext | null {
  const record = asRecord(row)
  if (Object.keys(record).length === 0) {
    return null
  }

  return {
    datasetKey: text(pick(record, "dataset_key", "datasetKey"), ""),
    exchange: text(pick(record, "exchange"), "binance"),
    symbol: text(pick(record, "symbol"), ""),
    timeframe: text(pick(record, "timeframe"), ""),
    requestedStartAt: nullableText(pick(record, "requested_start_at", "requestedStartAt")),
    requestedEndAt: nullableText(pick(record, "requested_end_at", "requestedEndAt")),
    sourceHash: nullableText(pick(record, "source_hash", "sourceHash")),
    strategyVersionId: nullableText(pick(record, "strategy_version_id", "strategyVersionId")),
    coverage: normalizeCoverageSummary(pick(record, "coverage")),
  }
}

function normalizeRunAnalysis(row: unknown): TradeLabRunAnalysis | null {
  const record = asRecord(row)
  if (Object.keys(record).length === 0) {
    return null
  }

  return {
    run: normalizeRunHistoryEntry(pick(record, "run")),
    result: normalizeRunAnalysisResult(pick(record, "result")),
    snapshot: normalizeRunSnapshot(pick(record, "snapshot")) ?? {
      sourceSnapshot: {},
      datasetContext: {},
      pipelineContext: {},
    },
    runtimeConfig: normalizeRuntimeConfig(pick(record, "runtime_config", "runtimeConfig")),
    riskConfig: normalizeRiskConfig(pick(record, "risk_config", "riskConfig")),
    datasetContext: normalizeRunAnalysisDatasetContext(pick(record, "dataset_context", "datasetContext")) ?? {
      datasetKey: "",
      exchange: "binance",
      symbol: "",
      timeframe: "",
      requestedStartAt: null,
      requestedEndAt: null,
      sourceHash: null,
      strategyVersionId: null,
      coverage: null,
    },
    tradeSummary: normalizeTradeSummary(pick(record, "trade_summary", "tradeSummary")) ?? {
      totalTrades: 0,
      closedTrades: 0,
      openTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      breakEvenTrades: 0,
      realizedPnl: 0,
      averagePnl: null,
      averagePnlPct: null,
      averageDurationSeconds: null,
      winRatePct: null,
      profitFactor: null,
    },
    trades: asArray(pick(record, "trades")).map(normalizeAnalyzedTrade),
    positions: asArray(pick(record, "positions")).map(normalizeBacktestPosition),
    totalFundingFeePaid: numberValue(pick(record, "total_funding_fee_paid", "totalFundingFeePaid"), 0),
    futuresSummary: normalizeFuturesResearchSummary(pick(record, "futures_summary", "futuresSummary")),
  }
}

function normalizeSelectedTradeExecutionDetail(row: unknown): TradeLabSelectedTradeExecutionDetail | null {
  const record = asRecord(row)
  if (Object.keys(record).length === 0) {
    return null
  }

  return {
    trade: normalizeAnalyzedTrade(pick(record, "trade")),
    entryOrder: asRecord(pick(record, "entry_order", "entryOrder")),
    exitOrder: asRecord(pick(record, "exit_order", "exitOrder")),
    entrySignal: asRecord(pick(record, "entry_signal", "entrySignal")),
    exitSignal: asRecord(pick(record, "exit_signal", "exitSignal")),
    logs: asArray(pick(record, "logs")).map(normalizeLogEntry),
  }
}

function benchmarkStatus(value: unknown): TradeLabBenchmarkCheck["status"] {
  return value === "pending" || value === "running" || value === "matched" || value === "mismatched" || value === "failed"
    ? value
    : "pending"
}

function benchmarkMetricDiffs(value: unknown): TradeLabBenchmarkCheck["metricDiffs"] {
  const record = asRecord(value)
  return Object.fromEntries(
    Object.entries(record).map(([key, raw]) => {
      const item = asRecord(raw)
      const baseline = pick(item, "baseline")
      const repeat = pick(item, "repeat")
      return [
        key,
        {
          baseline: typeof baseline === "number" || typeof baseline === "string" ? baseline : null,
          repeat: typeof repeat === "number" || typeof repeat === "string" ? repeat : null,
          match: pick(item, "match") === true,
        },
      ]
    }),
  )
}

function normalizeBenchmarkCheck(row: unknown): TradeLabBenchmarkCheck {
  const record = asRecord(row)
  return {
    id: text(pick(record, "id"), ""),
    baselineRunId: text(pick(record, "baseline_run_id", "baselineRunId"), ""),
    repeatRunId: nullableText(pick(record, "repeat_run_id", "repeatRunId")),
    strategyId: text(pick(record, "strategy_id", "strategyId"), ""),
    strategyVersionId: text(pick(record, "strategy_version_id", "strategyVersionId"), ""),
    datasetKey: text(pick(record, "dataset_key", "datasetKey"), ""),
    inputFingerprint: text(pick(record, "input_fingerprint", "inputFingerprint"), ""),
    repeatInputFingerprint: nullableText(pick(record, "repeat_input_fingerprint", "repeatInputFingerprint")),
    inputMatch: nullableBoolean(pick(record, "input_match", "inputMatch")),
    resultFingerprint: nullableText(pick(record, "result_fingerprint", "resultFingerprint")),
    repeatResultFingerprint: nullableText(pick(record, "repeat_result_fingerprint", "repeatResultFingerprint")),
    resultMatch: nullableBoolean(pick(record, "result_match", "resultMatch")),
    tolerancePolicy: asRecord(pick(record, "tolerance_policy", "tolerancePolicy")),
    metricDiffs: benchmarkMetricDiffs(pick(record, "metric_diffs", "metricDiffs")),
    status: benchmarkStatus(pick(record, "status")),
    errorMessage: nullableText(pick(record, "error_message", "errorMessage")),
    createdAt: nullableText(pick(record, "created_at", "createdAt")),
    updatedAt: nullableText(pick(record, "updated_at", "updatedAt")),
  }
}

export function normalizeManualSignalPackage(row: unknown): TradeLabManualSignalPackage {
  const record = asRecord(row)
  return {
    signalPackageId: text(pick(record, "signal_package_id", "signalPackageId")),
    sourceRunId: text(pick(record, "source_run_id", "sourceRunId")),
    strategyId: text(pick(record, "strategy_id", "strategyId")),
    strategyVersionId: text(pick(record, "strategy_version_id", "strategyVersionId")),
    strategyName: text(pick(record, "strategy_name", "strategyName")),
    exchange: text(pick(record, "exchange")),
    symbol: text(pick(record, "symbol")),
    timeframe: text(pick(record, "timeframe")),
    datasetKey: nullableText(pick(record, "dataset_key", "datasetKey")),
    runStartAt: text(pick(record, "run_start_at", "runStartAt")),
    runEndAt: text(pick(record, "run_end_at", "runEndAt")),
    generatedAt: text(pick(record, "generated_at", "generatedAt")),
    action: text(pick(record, "action"), "watch"),
    entryRule: text(pick(record, "entry_rule", "entryRule")),
    stopRule: text(pick(record, "stop_rule", "stopRule")),
    takeProfitRule: nullableText(pick(record, "take_profit_rule", "takeProfitRule")),
    exitRule: text(pick(record, "exit_rule", "exitRule")),
    positionSizingRule: text(pick(record, "position_sizing_rule", "positionSizingRule")),
    maxRiskPerTrade: nullableText(pick(record, "max_risk_per_trade", "maxRiskPerTrade")),
    invalidationRule: text(pick(record, "invalidation_rule", "invalidationRule")),
    manualExecutionNotes: textArray(pick(record, "manual_execution_notes", "manualExecutionNotes")),
    limitations: textArray(pick(record, "limitations")),
    warnings: textArray(pick(record, "warnings")),
    sourceMetrics: asRecord(pick(record, "source_metrics", "sourceMetrics")),
    sourceTradeSummary: asRecord(pick(record, "source_trade_summary", "sourceTradeSummary")),
    datasetEvidence: asRecord(pick(record, "dataset_evidence", "datasetEvidence")),
    riskEvidence: asRecord(pick(record, "risk_evidence", "riskEvidence")),
    robustnessEvidenceStatus: text(pick(record, "robustness_evidence_status", "robustnessEvidenceStatus"), "not_available"),
    liveReadinessStatus: text(pick(record, "live_readiness_status", "liveReadinessStatus"), "manual_handoff_only"),
    safetyStatus: text(pick(record, "safety_status", "safetyStatus")),
    markdown: text(pick(record, "markdown")),
  }
}

function robustnessGateResults(value: unknown): TradeLabResearchRobustnessGate["gates"] {
  const record = asRecord(value)
  return Object.fromEntries(
    Object.entries(record).map(([key, raw]) => {
      const gate = asRecord(raw)
      return [
        key,
        {
          ...gate,
          status: text(pick(gate, "status"), "warn"),
          reasonCode: text(pick(gate, "reason_code", "reasonCode")),
          summary: text(pick(gate, "summary")),
        },
      ]
    }),
  )
}

export function normalizeResearchRobustnessGate(row: unknown): TradeLabResearchRobustnessGate {
  const record = asRecord(row)
  return {
    robustnessGateId: text(pick(record, "robustness_gate_id", "robustnessGateId")),
    sourceRunId: text(pick(record, "source_run_id", "sourceRunId")),
    strategyId: text(pick(record, "strategy_id", "strategyId")),
    strategyVersionId: text(pick(record, "strategy_version_id", "strategyVersionId")),
    strategyName: text(pick(record, "strategy_name", "strategyName")),
    exchange: text(pick(record, "exchange")),
    symbol: text(pick(record, "symbol")),
    timeframe: text(pick(record, "timeframe")),
    datasetKey: nullableText(pick(record, "dataset_key", "datasetKey")),
    generatedAt: text(pick(record, "generated_at", "generatedAt")),
    candidateLabel: text(pick(record, "candidate_label", "candidateLabel"), "insufficient_evidence"),
    liveReadinessStatus: text(pick(record, "live_readiness_status", "liveReadinessStatus"), "not_live_ready"),
    safetyStatus: text(pick(record, "safety_status", "safetyStatus")),
    gates: robustnessGateResults(pick(record, "gates")),
    warnings: textArray(pick(record, "warnings")),
    limitations: textArray(pick(record, "limitations")),
    sourceMetrics: asRecord(pick(record, "source_metrics", "sourceMetrics")),
    sourceTradeSummary: asRecord(pick(record, "source_trade_summary", "sourceTradeSummary")),
  }
}

export function normalizeExecutionJournalFill(row: unknown): TradeLabExecutionJournalFill {
  const record = asRecord(row)
  return {
    fillId: nullableText(pick(record, "fill_id", "fillId")),
    fillRole: text(pick(record, "fill_role", "fillRole"), "entry"),
    side: text(pick(record, "side"), "buy"),
    fillTime: nullableText(pick(record, "fill_time", "fillTime")),
    price: numberValue(pick(record, "price"), 0),
    quantity: numberValue(pick(record, "quantity"), 0),
    fee: nullableNumber(pick(record, "fee")),
    feeAsset: nullableText(pick(record, "fee_asset", "feeAsset")),
    notes: nullableText(pick(record, "notes")),
    createdAt: nullableText(pick(record, "created_at", "createdAt")),
    updatedAt: nullableText(pick(record, "updated_at", "updatedAt")),
  }
}

export function normalizeExecutionJournalEntry(row: unknown): TradeLabExecutionJournalEntry {
  const record = asRecord(row)
  const summary = asRecord(pick(record, "comparison_summary", "comparisonSummary"))
  return {
    entryId: text(pick(record, "entry_id", "entryId"), ""),
    sourceRunId: text(pick(record, "source_run_id", "sourceRunId"), ""),
    strategyId: nullableText(pick(record, "strategy_id", "strategyId")),
    strategyVersionId: nullableText(pick(record, "strategy_version_id", "strategyVersionId")),
    symbol: text(pick(record, "symbol"), ""),
    timeframe: text(pick(record, "timeframe"), ""),
    side: text(pick(record, "side"), "long"),
    plannedSnapshot: asRecord(pick(record, "planned_snapshot", "plannedSnapshot")),
    comparisonSummary: {
      averageEntryPrice: nullableNumber(pick(summary, "average_entry_price", "averageEntryPrice")),
      averageExitPrice: nullableNumber(pick(summary, "average_exit_price", "averageExitPrice")),
      entryQuantity: numberValue(pick(summary, "entry_quantity", "entryQuantity"), 0),
      exitQuantity: numberValue(pick(summary, "exit_quantity", "exitQuantity"), 0),
      totalFees: numberValue(pick(summary, "total_fees", "totalFees"), 0),
      realizedGrossPnl: nullableNumber(pick(summary, "realized_gross_pnl", "realizedGrossPnl")),
      realizedNetPnl: nullableNumber(pick(summary, "realized_net_pnl", "realizedNetPnl")),
      slippageBps: nullableNumber(pick(summary, "slippage_bps", "slippageBps")),
      rMultiple: nullableNumber(pick(summary, "r_multiple", "rMultiple")),
      disciplineStatus: text(pick(summary, "discipline_status", "disciplineStatus"), "not_recorded"),
      outcomeStatus: text(pick(summary, "outcome_status", "outcomeStatus"), "incomplete"),
      safetyStatus: text(pick(summary, "safety_status", "safetyStatus"), "observed_execution_evidence_only"),
      liveReadinessStatus: text(pick(summary, "live_readiness_status", "liveReadinessStatus"), "not_live_ready"),
    },
    outcomeStatus: text(pick(record, "outcome_status", "outcomeStatus"), "incomplete"),
    disciplineStatus: text(pick(record, "discipline_status", "disciplineStatus"), "not_recorded"),
    safetyStatus: text(pick(record, "safety_status", "safetyStatus"), "manual_execution_journal_only"),
    liveReadinessStatus: text(pick(record, "live_readiness_status", "liveReadinessStatus"), "not_live_ready"),
    notes: nullableText(pick(record, "notes")),
    fills: asArray(pick(record, "fills")).map(normalizeExecutionJournalFill),
    createdAt: nullableText(pick(record, "created_at", "createdAt")),
    updatedAt: nullableText(pick(record, "updated_at", "updatedAt")),
  }
}

export function normalizeExecutionJournalList(row: unknown): TradeLabExecutionJournalList {
  const record = asRecord(row)
  return { items: asArray(pick(record, "items")).map(normalizeExecutionJournalEntry) }
}

export function normalizeStrategyVersion(row: unknown): TradeLabStrategyVersion {
  const record = asRecord(row)
  return {
    id: text(pick(record, "id"), crypto.randomUUID()),
    strategyId: text(pick(record, "strategy_id", "strategyId"), ""),
    versionNumber: numberValue(pick(record, "version_number", "versionNumber"), 0),
    validationStatus: text(pick(record, "validation_status", "validationStatus"), "draft") as TradeLabStrategyVersion["validationStatus"],
    validationMessage: nullableText(pick(record, "validation_message", "validationMessage")),
    sourceCode: text(pick(record, "source_code", "sourceCode"), ""),
    sourceHash: text(pick(record, "source_hash", "sourceHash"), ""),
    createdAt: text(pick(record, "created_at", "createdAt"), ""),
  }
}

export function normalizeStrategyValidationCheck(row: unknown): TradeLabStrategyValidationCheck {
  const record = asRecord(row)
  const rawStatus = text(pick(record, "validation_status", "validationStatus"), "invalid")
  return {
    validationStatus: rawStatus === "valid" ? "valid" : "invalid",
    validationMessage: nullableText(pick(record, "validation_message", "validationMessage")),
    line: nullableNumber(pick(record, "line")),
    column: nullableNumber(pick(record, "column")),
  }
}

export function normalizeStrategyGroupSummary(
  row: unknown,
  strategies: unknown[] = [],
): TradeLabStrategyGroupSummary {
  const record = asRecord(row)
  const groupId = text(pick(record, "id"), "")
  const strategyRows = asArray(strategies)
    .map(asRecord)
    .filter((strategy) => text(pick(strategy, "strategy_group_id", "strategyGroupId"), "") === groupId)

  return {
    id: groupId,
    name: text(pick(record, "name"), ""),
    slug: text(pick(record, "slug"), ""),
    description: nullableText(pick(record, "description")) ?? "",
    metadata: asRecord(pick(record, "metadata")),
    strategyCount: strategyRows.length,
    activeStrategyCount: strategyRows.filter((strategy) => text(pick(strategy, "status"), "") === "active").length,
  }
}

export function normalizeStrategySummary(row: unknown): TradeLabStrategySummary {
  const record = asRecord(row)
  const runtimeConfig = normalizeRuntimeConfig(pick(record, "runtime_config", "runtimeConfig"))
  const riskConfig = normalizeRiskConfig(pick(record, "risk_config", "riskConfig"))
  const versions = asArray(pick(record, "versions")).map(normalizeStrategyVersion)

  return {
    id: text(pick(record, "id"), ""),
    strategyGroupId: text(pick(record, "strategy_group_id", "strategyGroupId"), ""),
    name: text(pick(record, "name"), ""),
    slug: text(pick(record, "slug"), ""),
    description: nullableText(pick(record, "description")) ?? "",
    status: text(pick(record, "status"), "draft") as TradeLabStrategySummary["status"],
    currentVersionId: nullableText(pick(record, "current_version_id", "currentVersionId")),
    runtimeConfig,
    riskConfig,
    versionCount: numberValue(
      pick(record, "version_count", "versionCount"),
      versions.length,
    ),
  }
}

export function normalizeStrategyDetail(row: unknown): TradeLabStrategyDetail {
  const record = asRecord(row)
  return {
    ...normalizeStrategySummary(record),
    metadata: asRecord(pick(record, "metadata")),
    versions: asArray(pick(record, "versions")).map(normalizeStrategyVersion),
  }
}

export function normalizeBotSummary(row: unknown): TradeLabBotSummary {
  const record = asRecord(row)
  return {
    id: text(pick(record, "id"), ""),
    strategyId: text(pick(record, "strategy_id", "strategyId"), ""),
    strategyVersionId: nullableText(pick(record, "strategy_version_id", "strategyVersionId")),
    name: text(pick(record, "name"), ""),
    mode: text(pick(record, "mode"), "backtest") as TradeLabBotSummary["mode"],
    status: text(pick(record, "status"), "draft") as TradeLabBotSummary["status"],
    symbol: text(pick(record, "symbol"), ""),
    timeframe: text(pick(record, "timeframe"), ""),
    runtimeConfig: normalizeRuntimeConfig(pick(record, "runtime_config", "runtimeConfig")),
    riskConfig: normalizeRiskConfig(pick(record, "risk_config", "riskConfig")),
    metadata: asRecord(pick(record, "metadata")),
    createdAt: text(pick(record, "created_at", "createdAt"), ""),
  }
}

export function normalizeRunDetail(row: unknown): TradeLabRunDetail {
  const record = asRecord(row)
  const result = asRecord(pick(record, "result"))
  const resultMetrics = normalizeMetrics(pick(result, "metrics"))
  const fallbackMetrics = normalizeMetrics(pick(record, "metrics"))
  const snapshot = normalizeRunSnapshot(pick(record, "snapshot"))
  const pipeline = normalizeRunPipeline(pick(record, "pipeline"))

  return {
    id: text(pick(record, "id"), ""),
    botId: nullableText(pick(record, "bot_id", "botId")) ?? "",
    strategyId: text(pick(record, "strategy_id", "strategyId"), ""),
    strategyVersionId: text(pick(record, "strategy_version_id", "strategyVersionId"), ""),
    status: text(pick(record, "status"), "queued") as TradeLabRunDetail["status"],
    pipelineStatus: text(pick(record, "pipeline_status", "pipelineStatus"), pipeline?.status ?? "queued") as TradeLabRunDetail["pipelineStatus"],
    startedAt: nullableText(pick(record, "started_at", "startedAt")),
    finishedAt: nullableText(pick(record, "finished_at", "finishedAt")),
    errorMessage: nullableText(pick(record, "error_message", "errorMessage")),
    stopReason: nullableText(pick(record, "stop_reason", "stopReason")),
    metrics: resultMetrics ?? fallbackMetrics,
    equityCurve: asArray(
      pick(result, "equity_curve", "equityCurve", "equity_curve_points") ??
        pick(record, "equity_curve", "equityCurve", "equity_curve_points"),
    ).map(normalizeEquityPoint),
    snapshot: snapshot ?? undefined,
    pipeline: pipeline ?? undefined,
  }
}

export function normalizeBacktestExecution(row: unknown): TradeLabBacktestExecution {
  const record = asRecord(row)
  const result = asRecord(pick(record, "result"))
  const botRun = asRecord(pick(record, "bot_run", "botRun"))
  const metrics = normalizeMetrics(pick(result, "metrics")) ?? normalizeMetrics(pick(record, "metrics"))
  const equityCurve = asArray(pick(result, "equity_curve", "equityCurve", "equity_curve_points")).map(
    normalizeEquityPoint,
  )

  return {
    status: text(pick(record, "status"), "queued") as TradeLabBacktestExecution["status"],
    runId: nullableText(pick(botRun, "id", "runId")),
    logs: asArray(pick(record, "logs")).map(normalizeLogEntry),
    orders: asArray(pick(record, "trade_orders", "orders")).map(normalizeOrderEntry),
    metrics,
    equityCurve: equityCurve.length > 0
      ? equityCurve
      : asArray(
          pick(record, "equity_curve", "equityCurve", "equity_curve_points") ??
            pick(result, "equity_curve", "equityCurve", "equity_curve_points"),
        ).map(normalizeEquityPoint),
    stopReason: nullableText(pick(record, "stop_reason", "stopReason")),
    errorMessage: nullableText(pick(record, "error_message", "errorMessage")),
  }
}

export {
  normalizeBenchmarkCheck,
  normalizeChartMarker,
  normalizeCoverageSegment,
  normalizeCoverageSummary,
  normalizeDataJobSummary,
  normalizeDatasetCoverageItem,
  normalizeDatasetFillEnqueueResult,
  normalizeDatasetFillJobVisibility,
  normalizeDatasetFillPreview,
  normalizeDatasetLocalFillAudit,
  normalizeDatasetLocalFillResult,
  normalizeFillSchedulerStatus,
  normalizePaperSchedulerStatus,
  normalizePaperSessionDetail,
  normalizePaperSessionCancelLocal,
  normalizePaperSessionResumeLocal,
  normalizePaperSessionResumeReadiness,
  normalizePaperSessionRetryLocal,
  normalizePaperKillSwitchStatus,
  normalizePaperSessionObservability,
  normalizePaperSessionPreview,
  normalizePaperSessionRunLocal,
  normalizePaperSessionStart,
  normalizeLiveOrderCancelResult,
  normalizeLiveOrderConfirmSubmitResult,
  normalizeLiveOrderDetail,
  normalizeLiveOrderIntent,
  normalizeLiveOrderJournalProjectionResult,
  normalizeLiveOrderList,
  normalizeLiveOrderOperationResult,
  normalizeLiveOrderPreview,
  normalizeLiveOrderPreviewResult,
  normalizeLiveOrderReconcileResult,
  normalizeTestnetOrderCancelResult,
  normalizeTestnetOrderConfirmSubmitResult,
  normalizeTestnetOrderDetail,
  normalizeTestnetOrderJournalProjectionResult,
  normalizeTestnetOrderList,
  normalizeTestnetOrderPreviewResult,
  normalizeTestnetOrderReconcileResult,
  normalizePreflightResult,
  normalizeRunChart,
  normalizeRunHistoryEntry,
  normalizeRunPipeline,
  normalizeRunSnapshot,
  normalizeRunAnalysis,
  normalizeStrategyJobVisibility,
  normalizeSelectedTradeExecutionDetail,
  normalizeTradeDetail,
}

