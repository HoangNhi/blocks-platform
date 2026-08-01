export type TradeLabValidationStatus = "draft" | "valid" | "invalid"
export type TradeLabRunStatus = "queued" | "running" | "completed" | "failed" | "cancelled"
export type TradeLabBotStatus = "draft" | "active" | "paused" | "archived"
export type TradeLabMode = "backtest" | "paper" | "live"
export type TradeLabOrderStatus = "accepted" | "rejected" | "filled" | "skipped"
export type TradeLabLogLevel = "debug" | "info" | "warning" | "error"
export type TradeLabCoverageHealth = "healthy" | "incomplete" | "suspect" | "blocked"
export type TradeLabPreflightOutcome = "ready" | "needs_fill" | "needs_repair" | "blocked"
export type TradeLabDataJobType = "fill" | "repair"
export type TradeLabPipelineStatus = "queued" | "waiting_for_data" | "running" | "completed" | "failed"
export type TradeLabBenchmarkStatus = "pending" | "running" | "matched" | "mismatched" | "failed"

export type TradeLabCredentialBoundaryStatus =
  | "missing"
  | "read_only_ready"
  | "unsafe_permissions"
  | "ip_not_restricted"
  | "not_verified"

export type TradeLabCredentialBoundaryChecks = {
  readOnlyEnabled: boolean
  tradingDisabled: boolean
  withdrawDisabled: boolean
  futuresMarginDisabled: boolean
  ipRestricted: boolean
}

export type TradeLabCredentialBoundary = {
  exchange: "binance"
  status: TradeLabCredentialBoundaryStatus
  checks: TradeLabCredentialBoundaryChecks
  updatedAt: string | null
}

export type TradeLabMetricSnapshot = {
  initialEquity: number
  finalEquity: number
  totalReturnPct: number
  maxDrawdownPct: number
  profitFactor: number | null
  winRatePct: number | null
  totalTrades: number
  closedTrades: number
}

export type TradeLabLogEntry = {
  id: string
  timestamp: string
  level: TradeLabLogLevel
  eventType: string
  message: string
  payload: Record<string, unknown>
}

export type TradeLabOrderEntry = {
  id: string
  timestamp: string
  side: "buy" | "sell"
  orderType: "market"
  status: TradeLabOrderStatus
  fillPrice: number | null
  fillQty: number | null
  fillNotional: number | null
  feeAmount: number | null
  reason: string | null
  payload: Record<string, unknown>
}

export type TradeLabCandleEntry = {
  openTime: string
  closeTime?: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export type TradeLabEquityPoint = {
  timestamp: string
  equity: number
  drawdownPct: number
}

export type TradeLabCoverageSegment = {
  startAt: string
  endAt: string
  rowCount: number
}

export type TradeLabCoverageSummary = {
  datasetKey: string
  exchange: string
  symbol: string
  timeframe: string
  healthStatus: TradeLabCoverageHealth
  earliestOpenTime: string | null
  latestOpenTime: string | null
  coveredStartAt: string | null
  coveredEndAt: string | null
  segmentCount: number
  gapCount: number
  segments: TradeLabCoverageSegment[]
  metadata: Record<string, unknown>
}

export type TradeLabDatasetCoverageSegment = {
  id: string
  segmentIndex: number
  startAt: string
  endAt: string
  rowCount: number
}

export type TradeLabDatasetCoverageItem = {
  id: string
  datasetKey: string
  exchange: string
  symbol: string
  timeframe: string
  healthStatus: TradeLabCoverageHealth
  earliestOpenTime: string | null
  latestOpenTime: string | null
  coveredStartAt: string | null
  coveredEndAt: string | null
  segmentCount: number
  gapCount: number
  lastCheckedAt: string | null
  metadata: Record<string, unknown>
  segments: TradeLabDatasetCoverageSegment[]
}

export type TradeLabMissingRange = {
  startAt: string
  endAt: string
  kind: "head" | "tail" | "internal" | "fill"
}

export type TradeLabPreflightSourceSummary = {
  source: string
  rowCount: number
}

export type TradeLabPreflightResult = {
  datasetKey: string
  exchange: string
  symbol: string
  timeframe: string
  requestedStartAt: string
  requestedEndAt: string
  outcome: TradeLabPreflightOutcome
  action: TradeLabDataJobType | null
  reasons: string[]
  coverage: TradeLabCoverageSummary | null
  missingSegments: TradeLabMissingRange[]
  repairStartAt: string | null
  repairEndAt: string | null
  activeJobId: string | null
  activeJobType: TradeLabDataJobType | null
  sourceBlocked: boolean
  sourceSummary: TradeLabPreflightSourceSummary[]
  provenanceBlocked: boolean
  provenanceReasonCode: string | null
}

export type TradeLabDatasetFillPreviewStatus = "covered" | "partial" | "missing" | "unknown"

export type TradeLabDatasetFillPreviewRequest = {
  strategy_id: string
  exchange: string
  symbol: string
  timeframe: string
  requested_start_at: string
  requested_end_at: string
  source?: string
}

export type TradeLabDatasetFillPreview = {
  previewId: string
  generatedAt: string
  requestFingerprint: string
  datasetKey: string
  exchange: string
  symbol: string
  timeframe: string
  requestedRange: {
    startAt: string
    endAt: string
  }
  coverageStatus: TradeLabDatasetFillPreviewStatus
  gapCount: number
  estimatedRows: number
  blockedReasons: string[]
  safetyStatus: "preview_only"
  missingRanges: TradeLabMissingRange[]
  activeJobId: string | null
  activeJobType: TradeLabDataJobType | null
}

export type TradeLabPaperSessionPreviewStatus = "allowed" | "blocked" | string

export type TradeLabPaperSessionPreviewGateFailure = {
  gate: string
  reasonCode: string
  message: string
  data: Record<string, unknown>
}

export type TradeLabPaperSessionSetupReasonCode =
  | "paper_draft_required"
  | "paper_symbol_required"
  | "paper_timeframe_required"
  | "paper_range_required"
  | "paper_range_invalid"

export type TradeLabPaperSessionSetupReason = {
  code: TradeLabPaperSessionSetupReasonCode
  message: string
}

export type TradeLabPaperSessionPreviewRequest = {
  bot_id: string
  exchange: string
  symbol: string
  timeframe: string
  start_at: string
  end_at: string
  risk_policy_override?: Record<string, unknown>
  source?: string
}

export type TradeLabPaperSessionPreview = {
  mode: string
  previewStatus: TradeLabPaperSessionPreviewStatus
  allowed: boolean
  reasonCode: string
  failedGates: TradeLabPaperSessionPreviewGateFailure[]
  warnings: string[]
  details: Record<string, unknown>
  safetyStatus: string
  botContext: {
    botId: string
    mode: string
    status: string
    symbol: string
    timeframe: string
  }
  strategyContext: {
    strategyId: string | null
    strategyVersionId: string | null
    sourceValid: boolean
    versionLocked: boolean
    dirty: boolean
  }
  datasetContext: {
    datasetKey: string
    exchange: string
    symbol: string
    timeframe: string
    startAt: string
    endAt: string
    preflightOutcome: string
  }
}

export type TradeLabTestnetOrderPreviewRequest = {
  confirmPreviewOnly: true
  idempotencyKey: string
  clientActionId: string
  source: "strategy_lab"
  actor: string
  strategyId: string
  strategyVersionId: string
  sourceRunId?: string | null
  sourceSignalPackageId?: string | null
  credentialRefId: string
  environment: "binance_testnet"
  exchange: "binance"
  marketType: "spot"
  symbol: string
  side: "buy" | "sell"
  orderType: "market"
  quantity?: string | null
  quoteQuantity?: string | null
}

export type TradeLabTestnetOrderPreviewResult = {
  status: string
  allowed: boolean
  reasonCode: string
  safetyStatus: string
  intentId: string | null
  previewId: string | null
  clientOrderId: string | null
  expiresAt: string | null
  order: {
    environment: string
    exchange: string
    marketType: string
    symbol: string
    side: string
    orderType: string
    quantity: string | null
    quoteQuantity: string | null
    estimatedNotional: string | null
    estimatedFee: string | null
  } | null
  sourceContext: Record<string, unknown> | null
  credentialSnapshot: Record<string, unknown>
  riskSnapshot: Record<string, unknown>
  auditEventIds: string[]
  details: Record<string, unknown>
}

export type TradeLabTestnetOrderOperationResult = {
  status: string
  reasonCode: string
  safetyStatus: string
  semanticStatusCode: number
  shouldCommit: boolean
  intentId: string | null
  previewId: string | null
  clientOrderId: string | null
  exchangeOrderId: string | null
  intentStatus: string | null
  reconciliationAttemptId: string | null
  snapshot: Record<string, unknown>
  auditEventIds: string[]
  details: Record<string, unknown>
}

export type TradeLabTestnetOrderConfirmSubmitRequest = {
  confirmTestnetOrder: true
  idempotencyKey: string
  actor: string
}

export type TradeLabTestnetOrderCancelRequest = {
  confirmTestnetCancel: true
  idempotencyKey: string
  reason: "user_requested" | "risk_reducing" | "operator_review"
  actor: string
}

export type TradeLabTestnetOrderReconcileRequest = {
  orderId: string
  confirmTestnetReconcile: true
  trigger: "manual" | "submit_timeout" | "cancel_race" | "operator_review"
  actor: string
}

export type TradeLabTestnetOrderJournalProjectionRequest = {
  confirmTestnetJournalProjection: true
  source: "strategy_lab"
  actor: string
}

export type TradeLabTestnetOrderJournalProjectionResult = {
  status: string
  reasonCode: string
  safetyStatus: string
  semanticStatusCode: number
  shouldCommit: boolean
  intentId: string | null
  journalEntryId: string | null
  clientOrderId: string | null
  intentStatus: string | null
  auditEventIds: string[]
  details: Record<string, unknown>
}

export type TradeLabTestnetOrderEvent = {
  eventId: string
  previewId: string | null
  eventType: string
  fromStatus: string | null
  toStatus: string | null
  reasonCode: string | null
  clientOrderId: string | null
  exchangeOrderId: string | null
  actor: string
  metadata: Record<string, unknown>
  createdAt: string | null
}

export type TradeLabTestnetOrderPreview = {
  previewId: string
  previewKey: string
  status: string
  reasonCode: string | null
  symbol: string
  side: string
  orderType: string
  quantity: string | null
  quoteQuantity: string | null
  estimatedNotional: string | null
  estimatedFee: string | null
  riskSnapshot: Record<string, unknown>
  credentialSnapshot: Record<string, unknown>
  sourceSnapshot: Record<string, unknown>
  expiresAt: string | null
  createdAt: string | null
}

export type TradeLabTestnetOrderIntent = {
  intentId: string
  status: string
  reasonCode: string | null
  clientOrderId: string
  environment: string
  exchange: string
  marketType: string
  symbol: string
  side: string
  orderType: string
  quantity: string | null
  quoteQuantity: string | null
  strategyId: string
  strategyVersionId: string
  sourceRunId: string | null
  credentialRefId: string
  latestPreviewId: string | null
  reconciliationRequired: boolean
  createdAt: string | null
  updatedAt: string | null
}

export type TradeLabTestnetOrderDetail = {
  safetyStatus: string
  intent: TradeLabTestnetOrderIntent
  latestPreview: TradeLabTestnetOrderPreview | null
  previews: TradeLabTestnetOrderPreview[]
  events: TradeLabTestnetOrderEvent[]
  reconciliationAttempts: Record<string, unknown>[]
}

export type TradeLabTestnetOrderListOptions = {
  strategyId?: string
  strategyVersionId?: string
  sourceRunId?: string
  credentialRefId?: string
  status?: string
  symbol?: string
  limit?: number
}

export type TradeLabTestnetOrderList = {
  safetyStatus: string
  items: Array<{
    intent: TradeLabTestnetOrderIntent
    latestPreview: TradeLabTestnetOrderPreview | null
  }>
}

export type TradeLabLiveOrderPreviewRequest = {
  confirmPreviewOnly: true
  idempotencyKey: string
  clientActionId: string
  source: "strategy_lab"
  actor: string
  strategyId: string
  strategyVersionId: string
  sourceRunId?: string | null
  sourceSignalPackageId?: string | null
  credentialRefId: string
  environment: "binance_live"
  exchange: "binance"
  marketType: "spot"
  symbol: string
  side: "buy" | "sell"
  orderType: "market"
  quantity?: string | null
  quoteQuantity?: string | null
}

export type TradeLabLiveOrderPreviewResult = TradeLabTestnetOrderPreviewResult

export type TradeLabLiveOrderOperationResult = TradeLabTestnetOrderOperationResult

export type TradeLabLiveOrderConfirmSubmitRequest = {
  confirmLiveOrder: true
  idempotencyKey: string
  actor: string
}

export type TradeLabLiveOrderCancelRequest = {
  confirmLiveCancel: true
  idempotencyKey: string
  reason: "user_requested" | "risk_reducing" | "operator_review"
  actor: string
}

export type TradeLabLiveOrderReconcileRequest = {
  confirmLiveReconcile: true
  trigger: "manual" | "cancel_race" | "unknown_recovery" | "operator_review"
  actor: string
}

export type TradeLabLiveOrderJournalProjectionRequest = {
  confirmLiveJournalProjection: true
  source: "strategy_lab"
  actor: string
}

export type TradeLabLiveOrderJournalProjectionResult = TradeLabTestnetOrderJournalProjectionResult

export type TradeLabLiveOrderEvent = TradeLabTestnetOrderEvent

export type TradeLabLiveOrderPreview = TradeLabTestnetOrderPreview

export type TradeLabLiveOrderIntent = TradeLabTestnetOrderIntent

export type TradeLabLiveOrderDetail = {
  safetyStatus: string
  intent: TradeLabLiveOrderIntent
  latestPreview: TradeLabLiveOrderPreview | null
  previews: TradeLabLiveOrderPreview[]
  events: TradeLabLiveOrderEvent[]
  reconciliationAttempts: Record<string, unknown>[]
}

export type TradeLabLiveOrderListOptions = TradeLabTestnetOrderListOptions

export type TradeLabLiveOrderList = {
  safetyStatus: string
  items: Array<{
    intent: TradeLabLiveOrderIntent
    latestPreview: TradeLabLiveOrderPreview | null
  }>
}

export type TradeLabPaperSessionObservabilityStatus =
  | "blocked"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancel_requested"
  | "cancelled"
  | string

export type TradeLabPaperSessionObservabilityOptions = {
  strategyId?: string
  strategyVersionId?: string
  datasetKey?: string
  status?: TradeLabPaperSessionObservabilityStatus
  limit?: number
}

export type TradeLabPaperSessionObservabilityItem = {
  sessionId: string
  status: TradeLabPaperSessionObservabilityStatus
  reasonCode: string | null
  safetyStatus: string
  strategyId: string
  strategyVersionId: string
  datasetKey: string
  exchange: string
  symbol: string
  timeframe: string
  startAt: string
  endAt: string
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  errorMessage: string | null
  artifactCounts: {
    orders: number
    fills: number
    positions: number
    portfolioSnapshots: number
    auditEvents: number
  }
  latestAudit: {
    auditEventId: string
    eventAt: string
    action: string
    reasonCode: string | null
    newState: string | null
    actor: string | null
    metadata: Record<string, unknown>
  } | null
  gateSummary: {
    failedGateCount: number
    failedGateReasons: string[]
    blockedReasonCode: string | null
  }
}

export type TradeLabPaperSessionObservability = {
  safetyStatus: "read_only_paper_session_observability" | string
  items: TradeLabPaperSessionObservabilityItem[]
  hasMore: boolean
}

export type TradeLabPaperKillSwitchStatus = {
  enabled: boolean
  reasonCode: string
  safetyStatus: string
  source: string
  updatedAt: string | null
  updatedBy: string | null
  details: Record<string, unknown>
}

export type TradeLabPaperSessionStartStatus = "queued" | "blocked" | string

export type TradeLabPaperSessionStartGateFailure = {
  gate: string
  reasonCode: string
  message: string
  data: Record<string, unknown>
}

export type TradeLabPaperSessionStartRequest = {
  bot_id: string
  exchange: string
  symbol: string
  timeframe: string
  start_at: string
  end_at: string
  starting_cash: number
  idempotency_key: string
  confirm_start: true
  risk_policy_override?: Record<string, unknown>
  source?: string
  actor?: string
}

export type TradeLabPaperSessionStartResult = {
  sessionId: string | null
  status: TradeLabPaperSessionStartStatus
  allowed: boolean
  reasonCode: string
  safetyStatus: string
  requestFingerprint: string
  idempotencyKey: string
  failedGates: TradeLabPaperSessionStartGateFailure[]
  warnings: string[]
  details: Record<string, unknown>
  datasetContext: {
    datasetKey: string
    exchange: string
    symbol: string
    timeframe: string
    startAt: string
    endAt: string
  }
  gateContext: Record<string, unknown>
  auditEventIds: string[]
}

export type TradeLabPaperSessionRunLocalStatus =
  | "blocked"
  | "busy"
  | "completed"
  | "failed"
  | "cancelled"
  | string

export type TradeLabPaperSessionRunLocalRequest = {
  confirm_local_paper_run: true
  max_candles_per_tick?: number
  worker_id?: string
}

export type TradeLabPaperSessionRunLocalResult = {
  status: TradeLabPaperSessionRunLocalStatus
  reasonCode: string
  sessionId: string | null
  candlesProcessed: number
  ordersCreated: number
  fillsCreated: number
  snapshotsCreated: number
  safetyStatus: string
  details: Record<string, unknown>
}

export type TradeLabPaperSessionCancelLocalStatus =
  | "blocked"
  | "cancelled"
  | "cancel_requested"
  | string

export type TradeLabPaperSessionCancelLocalRequest = {
  confirm_local_paper_cancel: true
  reason?: "user_requested"
  actor?: string
}

export type TradeLabPaperSessionCancelLocalResult = {
  status: TradeLabPaperSessionCancelLocalStatus
  reasonCode: string
  sessionId: string | null
  previousStatus: string | null
  currentStatus: string | null
  cancelRequestedAt: string | null
  safetyStatus: string
  details: Record<string, unknown>
}

export type TradeLabPaperSessionRetryLocalStatus =
  | "blocked"
  | "queued"
  | string

export type TradeLabPaperSessionRetryLocalRequest = {
  confirm_local_paper_retry: true
  idempotency_key: string
  reason?: "user_requested"
  actor?: string
}

export type TradeLabPaperSessionRetryLocalResult = {
  status: TradeLabPaperSessionRetryLocalStatus
  reasonCode: string
  safetyStatus: string
  sourceSessionId: string | null
  retrySessionId: string | null
  sourceStatus: string | null
  retryStatus: string | null
  idempotencyKey: string
  details: Record<string, unknown>
}

export type TradeLabPaperSessionResumeReadinessCheckpoint = {
  lastProcessedCandleId: string
  lastProcessedCandleOpenTime: string
  nextCandleId: string
  nextCandleOpenTime: string
  cashBalance: number
  equity: number
  realizedPnl: number
  unrealizedPnl: number
  feesPaid: number
  exposureNotional: number
  openPositionQuantity: number
  averageEntryPrice: number | null
  pendingOrdersCount: number
}

export type TradeLabPaperSessionResumeReadiness = {
  sessionId: string
  status: string
  reasonCode: string
  allowed: boolean
  safetyStatus: string
  checkpoint: TradeLabPaperSessionResumeReadinessCheckpoint | null
  checkpointSource: string
  artifactIdentityStatus: string
  resumeMode: string
  attemptNo: number | null
  blockingReasons: string[]
  details: Record<string, unknown>
}

export type TradeLabPaperSessionResumeLocalRequest = {
  confirm_local_paper_resume: true
  idempotency_key: string
  reason?: "user_requested"
  actor?: string
}

export type TradeLabPaperSessionResumeCursor = {
  lastProcessedCandleId: string
  nextCandleOpenTime: string
  attemptNo: number
}

export type TradeLabPaperSessionResumeLocalResult = {
  status: "blocked" | "queued" | string
  reasonCode: string
  safetyStatus: string
  sourceSessionId: string | null
  resumeSessionId: string | null
  sourceStatus: string | null
  resumeStatus: string | null
  idempotencyKey: string
  resumeCursor: TradeLabPaperSessionResumeCursor | null
  details: Record<string, unknown>
}

export type TradeLabPaperSessionAuditEvent = {
  auditEventId: string
  eventAt: string
  actor: string | null
  action: string
  targetType: string
  targetId: string | null
  oldState: string | null
  newState: string | null
  reasonCode: string | null
  correlationId: string | null
  requestId: string | null
  metadata: Record<string, unknown>
  createdAt: string | null
  createdBy: string | null
}

export type TradeLabPaperSessionOrder = {
  orderId: string
  side: string
  orderType: string
  status: string
  quantity: number
  requestedPrice: number | null
  requestedNotional: number | null
  submittedAt: string | null
  finalizedAt: string | null
  reasonCode: string | null
  metadata: Record<string, unknown>
}

export type TradeLabPaperSessionFill = {
  fillId: string
  paperOrderId: string
  sourceCandleId: string | null
  fillTime: string
  side: string
  price: number
  quantity: number
  notional: number
  feeAmount: number
  feeAsset: string | null
  slippageAmount: number
  metadata: Record<string, unknown>
}

export type TradeLabPaperSessionPosition = {
  positionId: string
  symbol: string
  side: string
  status: string
  quantity: number
  averageEntryPrice: number | null
  realizedPnl: number
  unrealizedPnl: number
  openedAt: string | null
  closedAt: string | null
  metadata: Record<string, unknown>
}

export type TradeLabPaperSessionPortfolioSnapshot = {
  snapshotId: string
  sourceCandleId: string | null
  snapshotAt: string
  cashBalance: number
  equity: number
  realizedPnl: number
  unrealizedPnl: number
  feesPaid: number
  drawdownPct: number
  exposureNotional: number
  metadata: Record<string, unknown>
}

export type TradeLabPaperSessionDetail = {
  session: {
    sessionId: string
    botId: string
    strategyId: string
    strategyVersionId: string
    mode: string
    status: string
    exchange: string
    symbol: string
    timeframe: string
    datasetKey: string
    startAt: string
    endAt: string
    startedAt: string | null
    finishedAt: string | null
    cancelRequestedAt: string | null
    startingCash: number
    reasonCode: string | null
    errorMessage: string | null
  }
  datasetContext: Record<string, unknown>
  gateContext: Record<string, unknown>
  auditEvents: TradeLabPaperSessionAuditEvent[]
  artifacts: {
    orders: TradeLabPaperSessionOrder[]
    fills: TradeLabPaperSessionFill[]
    positions: TradeLabPaperSessionPosition[]
    portfolioSnapshots: TradeLabPaperSessionPortfolioSnapshot[]
    limits: {
      orders: number
      fills: number
      positions: number
      portfolioSnapshots: number
      auditEvents: number
    }
  }
  safetyStatus: string
}

export type TradeLabDatasetLocalFillRequest = {
  strategy_id: string
  exchange: string
  symbol: string
  timeframe: string
  requested_start_at: string
  requested_end_at: string
  preview_id: string
  request_fingerprint: string
  confirm_local_fill: boolean
  source?: string
}

export type TradeLabDatasetFillEnqueueLocalRequest = {
  strategy_id: string
  exchange: string
  symbol: string
  timeframe: string
  requested_start_at: string
  requested_end_at: string
  preview_id: string
  request_fingerprint: string
  missing_ranges: Array<{ start_at: string; end_at: string; kind: string }>
  confirm_local_fill: boolean
  source?: string
}

export type TradeLabDatasetFillEnqueueLocalResult = {
  jobId: string
  datasetKey: string
  status: "queued" | string
  safetyStatus: "queued_local_dev" | string
  requestedRange: {
    startAt: string
    endAt: string
  }
  missingRangeCount: number
  previewId: string
  requestFingerprint: string
}

export type TradeLabDatasetLocalFillRangeResult = {
  startAt: string
  endAt: string
  kind: TradeLabMissingRange["kind"]
  rowsFetched: number
  rowsInserted: number
  rowsSkippedExisting: number
}

export type TradeLabDatasetLocalFillResult = {
  jobId: string
  datasetKey: string
  status: "completed" | "failed"
  safetyStatus: "local_dev_fill_only"
  requestedRange: {
    startAt: string
    endAt: string
  }
  rangesFilled: TradeLabDatasetLocalFillRangeResult[]
  rowsFetched: number
  rowsInserted: number
  rowsSkippedExisting: number
  blockedReasons: string[]
  previewId: string
  requestFingerprint: string
}

export type TradeLabDatasetLocalFillAuditRange = {
  startAt: string | null
  endAt: string | null
  kind: string | null
  metadata: Record<string, unknown>
}

export type TradeLabDatasetLocalFillAuditRangeResult = {
  startAt: string | null
  endAt: string | null
  kind: string | null
  rowsFetched: number
  rowsInserted: number
  rowsSkippedExisting: number
  metadata: Record<string, unknown>
}

export type TradeLabDatasetLocalFillAuditItem = {
  jobId: string
  status: "queued" | "running" | "completed" | "failed" | "cancelled" | string
  createdAt: string
  finishedAt: string | null
  requestedRange: TradeLabDatasetLocalFillAuditRange
  appliedRange: TradeLabDatasetLocalFillAuditRange
  rowsImported: number
  rowsFetched: number
  rowsInserted: number
  rowsSkippedExisting: number
  errorMessage: string | null
  reasonCode: string | null
  providerStatus: string | null
  previewId: string | null
  requestFingerprint: string | null
  missingRanges: Array<Record<string, unknown>>
  rangeResults: Array<Record<string, unknown>>
}

export type TradeLabDatasetLocalFillAudit = {
  datasetKey: string
  exchange: string
  symbol: string
  timeframe: string
  safetyStatus: "read_only"
  items: TradeLabDatasetLocalFillAuditItem[]
}

export type TradeLabDatasetFillJobVisibilityRange = {
  startAt: string | null
  endAt: string | null
}

export type TradeLabDatasetFillJobVisibilityItem = {
  jobId: string
  datasetKey: string
  jobType: TradeLabDataJobType | string
  status: "queued" | "running" | "cancel_requested" | "completed" | "failed" | "cancelled" | "stale" | string
  requestedRange: TradeLabDatasetFillJobVisibilityRange
  appliedRange: TradeLabDatasetFillJobVisibilityRange
  rowsImported: number
  rowsFetched: number
  rowsInserted: number
  rowsSkippedExisting: number
  reasonCode: string | null
  providerStatus: string | null
  attemptCount: number
  workerId: string | null
  createdAt: string
  startedAt: string | null
  finishedAt: string | null
  heartbeatAt: string | null
  metadata: Record<string, unknown>
}

export type TradeLabDatasetFillJobVisibility = {
  datasetKey: string
  exchange: string
  symbol: string
  timeframe: string
  safetyStatus: "read_only"
  active: TradeLabDatasetFillJobVisibilityItem[]
  recent: TradeLabDatasetFillJobVisibilityItem[]
}

export type TradeLabFillSchedulerStatus = {
  enabled: boolean
  running: boolean
  workerId: string
  intervalSeconds: number
  lastTickStartedAt: string | null
  lastTickCompletedAt: string | null
  lastTickStatus: "disabled" | "skipped" | "idle" | "processed" | "failed" | string
  lastSkipReason: string | null
  lastReasonCode: string | null
  lastJobId: string | null
  lastDatasetKey: string | null
  staleJobsMarked: number
  consecutiveFailureCount: number
  safetyStatus: "read_only_scheduler_visibility" | string
}

export type TradeLabPaperSchedulerStatus = {
  enabled: boolean
  running: boolean
  workerId: string
  intervalSeconds: number
  lastTickStartedAt: string | null
  lastTickCompletedAt: string | null
  lastTickStatus: "disabled" | "skipped" | "idle" | "running" | "processed" | "failed" | string
  lastSkipReason: string | null
  lastReasonCode: string | null
  lastSessionId: string | null
  candlesProcessed: number
  ordersCreated: number
  fillsCreated: number
  snapshotsCreated: number
  consecutiveFailureCount: number
  safetyStatus: "read_only_paper_scheduler_visibility" | string
}

export type TradeLabDataJobSummary = {
  id: string
  coverageId: string | null
  datasetKey: string
  jobType: TradeLabDataJobType
  exchange: string
  symbol: string
  timeframe: string
  requestedStartAt: string
  requestedEndAt: string
  appliedStartAt: string | null
  appliedEndAt: string | null
  claimedAt: string | null
  startedAt: string | null
  finishedAt: string | null
  workerId: string | null
  status: TradeLabRunStatus | "queued" | "running" | "completed" | "failed" | "cancelled"
  rowsImported: number
  errorMessage: string | null
  metadata: Record<string, unknown>
  createdAt: string
  createdBy: string | null
}

export type TradeLabRunSnapshot = {
  sourceSnapshot: Record<string, unknown>
  datasetContext: Record<string, unknown>
  pipelineContext: Record<string, unknown>
}

export type TradeLabRunHistoryEntry = {
  id: string
  botId: string | null
  strategyId: string
  strategyVersionId: string
  runType: string
  status: TradeLabRunStatus
  pipelineStatus: TradeLabPipelineStatus
  exchange: string
  symbol: string
  timeframe: string
  startAt: string
  endAt: string
  startedAt: string | null
  finishedAt: string | null
  dataJobId: string | null
  errorMessage: string | null
  createdAt: string
  createdBy: string | null
  snapshot?: TradeLabRunSnapshot
}

export type MarketType = 'SPOT' | 'USD_M_FUTURES'

export type TradeLabRuntimeConfig = {
  exchange: string
  symbol: string
  timeframe: string
  startAt: string
  endAt: string
  initialEquity: number
  feeBps: number
  slippageBps: number
  marketType?: MarketType
  defaultLeverage?: number
}

export type TradeLabRiskConfig = {
  maxOrderPercent: number
  maxPositionPercent: number
  maxDrawdownPercent: number
  minNotional: number
  stepSize: number
  tickSize: number
}

export type TradeLabStrategyVersion = {
  id: string
  strategyId: string
  versionNumber: number
  validationStatus: TradeLabValidationStatus
  validationMessage: string | null
  sourceCode: string
  sourceHash: string
  createdAt: string
}

export type TradeLabStrategyValidationCheck = {
  validationStatus: "valid" | "invalid"
  validationMessage: string | null
  line: number | null
  column: number | null
}

export type TradeLabRunSummary = {
  id: string
  status: TradeLabRunStatus
  finishedAt: string | null
  metrics: TradeLabMetricSnapshot | null
}

export type TradeLabStrategyGroupSummary = {
  id: string
  name: string
  slug: string
  description: string
  metadata: Record<string, unknown>
  strategyCount: number
  activeStrategyCount: number
}

export type TradeLabStrategySummary = {
  id: string
  strategyGroupId: string
  name: string
  slug: string
  description: string
  status: TradeLabBotStatus
  currentVersionId: string | null
  runtimeConfig: TradeLabRuntimeConfig
  riskConfig: TradeLabRiskConfig
  versionCount: number
}

export type TradeLabStrategyDetail = TradeLabStrategySummary & {
  metadata: Record<string, unknown>
  versions: TradeLabStrategyVersion[]
  lastRun?: TradeLabRunSummary | null
}

export type TradeLabBotSummary = {
  id: string
  strategyId: string
  strategyVersionId: string | null
  name: string
  mode: TradeLabMode
  status: TradeLabBotStatus
  symbol: string
  timeframe: string
  runtimeConfig: TradeLabRuntimeConfig
  riskConfig: TradeLabRiskConfig
  metadata: Record<string, unknown>
  createdAt: string
}

export type TradeLabRunDetail = {
  id: string
  botId: string
  strategyId: string
  strategyVersionId: string
  status: TradeLabRunStatus
  pipelineStatus?: TradeLabPipelineStatus
  startedAt: string | null
  finishedAt: string | null
  errorMessage: string | null
  stopReason: string | null
  metrics: TradeLabMetricSnapshot | null
  equityCurve: TradeLabEquityPoint[]
  snapshot?: TradeLabRunSnapshot
  pipeline?: TradeLabRunPipeline
}

export type TradeLabBacktestExecution = {
  status: TradeLabRunStatus
  runId: string | null
  logs: TradeLabLogEntry[]
  orders: TradeLabOrderEntry[]
  metrics: TradeLabMetricSnapshot | null
  equityCurve: TradeLabEquityPoint[]
  stopReason: string | null
  errorMessage: string | null
}

export type TradeLabTradeDetail = {
  marker: TradeLabChartMarker
  order: Record<string, unknown> | null
  signal: Record<string, unknown> | null
  logs: TradeLabLogEntry[]
}

export type TradeLabChartMarker = {
  id: string
  timestamp: string
  kind: "buy" | "sell" | "LIQUIDATION"
  side: "buy" | "sell"
  price: number | null
  quantity: number | null
  tradeOrderId: string | null
  strategySignalId: string | null
  message: string | null
  payload: Record<string, unknown>
  signal?: Record<string, unknown> | null
}

export type TradeLabRunChart = {
  candles: TradeLabCandleEntry[]
  markers: TradeLabChartMarker[]
  equityCurve: TradeLabEquityPoint[]
  selectedTrade: TradeLabTradeDetail | null
}

export type TradeLabAnalyzedTrade = {
  id: string
  entryOrderId: string
  exitOrderId: string | null
  entryTime: string
  exitTime: string | null
  side: "buy" | "sell"
  status: "open" | "closed"
  entryPrice: number | null
  exitPrice: number | null
  quantity: number | null
  pnl: number | null
  pnlPct: number | null
  durationSeconds: number | null
  entrySignalId: string | null
  exitSignalId: string | null
  entryReason: string | null
  exitReason: string | null
}

export type TradeLabTradeSummary = {
  totalTrades: number
  closedTrades: number
  openTrades: number
  winningTrades: number
  losingTrades: number
  breakEvenTrades: number
  realizedPnl: number
  averagePnl: number | null
  averagePnlPct: number | null
  averageDurationSeconds: number | null
  winRatePct: number | null
  profitFactor: number | null
}

export type TradeLabRunAnalysisResult = {
  id: string
  botRunId: string
  initialEquity: number
  finalEquity: number
  totalReturnPct: number
  maxDrawdownPct: number
  profitFactor: number | null
  winRatePct: number | null
  totalTrades: number
  metrics: TradeLabMetricSnapshot
  equityCurve: TradeLabEquityPoint[]
  createdAt: string
}

export type TradeLabRunAnalysisDatasetContext = {
  datasetKey: string
  exchange: string
  symbol: string
  timeframe: string
  requestedStartAt: string | null
  requestedEndAt: string | null
  sourceHash: string | null
  strategyVersionId: string | null
  coverage: TradeLabCoverageSummary | null
}

export type TradeLabFuturesResearchSummary = {
  totalFundingFeePaid: number
  totalFundingFeeReceived: number
  liquidationCount: number
  longTrades: number
  shortTrades: number
  longWinRate: number | null
  shortWinRate: number | null
  avgLeverageUsed: number | null
  maxMarginUsagePct: number | null
  maxMaintenanceMarginPct: number | null
}

export type BacktestPosition = {
  id: string
  runId: string
  symbol: string
  side: "LONG" | "SHORT"
  size: number
  leverage: number
  entryPrice: number
  closePrice?: number | null
  liquidationPrice?: number | null
  marginMode?: string | null
  maintenanceMargin?: number | null
  fundingFeePaid?: number
  maxNotional?: number | null
  maxMarginUsed?: number | null
  peakLeverageUsed?: number | null
  realizedPnl: number
  status: "OPEN" | "CLOSED" | "LIQUIDATED"
}

export type TradeLabRunAnalysis = {
  run: TradeLabRunHistoryEntry
  result: TradeLabRunAnalysisResult | null
  snapshot: TradeLabRunSnapshot
  runtimeConfig: TradeLabRuntimeConfig
  riskConfig: TradeLabRiskConfig
  datasetContext: TradeLabRunAnalysisDatasetContext
  tradeSummary: TradeLabTradeSummary
  trades: TradeLabAnalyzedTrade[]
  positions: BacktestPosition[]
  totalFundingFeePaid: number
  futuresSummary: TradeLabFuturesResearchSummary | null
}

export type TradeLabSelectedTradeExecutionDetail = {
  trade: TradeLabAnalyzedTrade
  entryOrder: Record<string, unknown> | null
  exitOrder: Record<string, unknown> | null
  entrySignal: Record<string, unknown> | null
  exitSignal: Record<string, unknown> | null
  logs: TradeLabLogEntry[]
}

export type TradeLabCompareMetricDiff = {
  key: string
  label: string
  baseValue: number | null
  compareValue: number | null
  delta: number | null
  format: "currency" | "number" | "percent"
}

export type TradeLabCompareFieldDiff = {
  key: string
  label: string
  baseValue: string
  compareValue: string
  isMatch: boolean
}

export type TradeLabCompareConfigDiff = {
  sourceHash: TradeLabCompareFieldDiff
  strategyVersion: TradeLabCompareFieldDiff
  runtimeConfigDiffs: TradeLabCompareFieldDiff[]
  riskConfigDiffs: TradeLabCompareFieldDiff[]
  datasetContextDiffs: TradeLabCompareFieldDiff[]
  baseSourceCode: string
  compareSourceCode: string
}

export type TradeLabCompareTradeSummaryDiff = {
  key: string
  label: string
  baseValue: number | null
  compareValue: number | null
  delta: number | null
  format: "currency" | "number" | "percent"
}

export type TradeLabCompareModeState = {
  isOpen: boolean
  baseRunId: string
  compareRunId: string
  baseAnalysis: TradeLabRunAnalysis
  compareAnalysis: TradeLabRunAnalysis
  metricDiffs: TradeLabCompareMetricDiff[]
  configDiff: TradeLabCompareConfigDiff
  tradeSummaryDiffs: TradeLabCompareTradeSummaryDiff[]
  datasetMismatchWarning: string | null
}

export type TradeLabRunPipeline = {
  run: TradeLabRunHistoryEntry
  preflight: TradeLabPreflightResult | null
  dataJob: TradeLabDataJobSummary | null
  backtestJob: Record<string, unknown> | null
  status: TradeLabPipelineStatus
  message: string | null
}

export type TradeLabJobVisibilityItem = TradeLabRunPipeline & {
  isStale: boolean
  staleReason: string | null
  lastActivityAt: string | null
}

export type TradeLabStrategyJobVisibility = {
  strategyId: string
  active: TradeLabJobVisibilityItem[]
  recent: TradeLabJobVisibilityItem[]
  staleThresholdMinutes: number
}

export type TradeLabBenchmarkMetricDiff = {
  baseline: number | string | null
  repeat: number | string | null
  match: boolean
}

export type TradeLabBenchmarkCheck = {
  id: string
  baselineRunId: string
  repeatRunId: string | null
  strategyId: string
  strategyVersionId: string
  datasetKey: string
  inputFingerprint: string
  repeatInputFingerprint: string | null
  inputMatch: boolean | null
  resultFingerprint: string | null
  repeatResultFingerprint: string | null
  resultMatch: boolean | null
  tolerancePolicy: Record<string, unknown>
  metricDiffs: Record<string, TradeLabBenchmarkMetricDiff>
  status: TradeLabBenchmarkStatus
  errorMessage: string | null
  createdAt: string | null
  updatedAt: string | null
}

export type TradeLabManualSignalPackage = {
  signalPackageId: string
  sourceRunId: string
  strategyId: string
  strategyVersionId: string
  strategyName: string
  exchange: string
  symbol: string
  timeframe: string
  datasetKey: string | null
  runStartAt: string
  runEndAt: string
  generatedAt: string
  action: "watch" | "buy" | "sell" | "close" | "no_trade" | string
  entryRule: string
  stopRule: string
  takeProfitRule: string | null
  exitRule: string
  positionSizingRule: string
  maxRiskPerTrade: string | null
  invalidationRule: string
  manualExecutionNotes: string[]
  limitations: string[]
  warnings: string[]
  sourceMetrics: Record<string, unknown>
  sourceTradeSummary: Record<string, unknown>
  datasetEvidence: Record<string, unknown>
  riskEvidence: Record<string, unknown>
  robustnessEvidenceStatus: "not_available" | "partial" | "passed" | "failed" | string
  liveReadinessStatus: "manual_handoff_only" | "blocked" | "candidate" | string
  safetyStatus: string
  markdown: string
}

export type TradeLabRobustnessGateStatus = "pass" | "warn" | "fail" | string

export type TradeLabRobustnessGateResult = {
  status: TradeLabRobustnessGateStatus
  reasonCode: string
  summary: string
  [key: string]: unknown
}

export type TradeLabResearchRobustnessGate = {
  robustnessGateId: string
  sourceRunId: string
  strategyId: string
  strategyVersionId: string
  strategyName: string
  exchange: string
  symbol: string
  timeframe: string
  datasetKey: string | null
  generatedAt: string
  candidateLabel: "insufficient_evidence" | "research_candidate" | "not_candidate" | string
  liveReadinessStatus: "not_live_ready" | string
  safetyStatus: string
  gates: Record<string, TradeLabRobustnessGateResult>
  warnings: string[]
  limitations: string[]
  sourceMetrics: Record<string, unknown>
  sourceTradeSummary: Record<string, unknown>
}

export type TradeLabExecutionJournalFill = {
  fillId: string | null
  fillRole: "entry" | "exit" | "adjustment" | string
  side: "buy" | "sell" | string
  fillTime: string | null
  price: number
  quantity: number
  fee: number | null
  feeAsset: string | null
  notes: string | null
  createdAt: string | null
  updatedAt: string | null
}

export type TradeLabExecutionJournalComparisonSummary = {
  averageEntryPrice: number | null
  averageExitPrice: number | null
  entryQuantity: number
  exitQuantity: number
  totalFees: number
  realizedGrossPnl: number | null
  realizedNetPnl: number | null
  slippageBps: number | null
  rMultiple: number | null
  disciplineStatus: string
  outcomeStatus: string
  safetyStatus: string
  liveReadinessStatus: string
}

export type TradeLabExecutionJournalEntry = {
  entryId: string
  sourceRunId: string
  strategyId: string | null
  strategyVersionId: string | null
  symbol: string
  timeframe: string
  side: string
  plannedSnapshot: Record<string, unknown>
  comparisonSummary: TradeLabExecutionJournalComparisonSummary
  outcomeStatus: string
  disciplineStatus: string
  safetyStatus: string
  liveReadinessStatus: string
  notes: string | null
  fills: TradeLabExecutionJournalFill[]
  createdAt: string | null
  updatedAt: string | null
}

export type TradeLabExecutionJournalList = {
  items: TradeLabExecutionJournalEntry[]
}

export type TradeLabExecutionJournalFillRequest = {
  fillRole: "entry" | "exit" | "adjustment" | string
  side: "buy" | "sell" | string
  fillTime?: string | null
  price: number
  quantity: number
  fee?: number | null
  feeAsset?: string | null
  notes?: string | null
}

export type TradeLabExecutionJournalEntryRequest = {
  confirmManualEntryOnly: true
  source: "strategy_lab"
  side: "long" | "short" | "flat_or_watch" | string
  plannedSnapshot: Record<string, unknown>
  disciplineStatus: "followed_plan" | "partial_deviation" | "broke_plan" | "not_recorded" | string
  notes?: string | null
  fills: TradeLabExecutionJournalFillRequest[]
}

export type TradeLabStrategyGroup = TradeLabStrategyGroupSummary & {
  strategies: TradeLabStrategyDetail[]
}

export type TradeLabWorkbenchState = {
  groups: TradeLabStrategyGroup[]
  selectedGroupId: string | null
  selectedStrategyId: string | null
  runtimeConfig: TradeLabRuntimeConfig
  riskConfig: TradeLabRiskConfig
  metrics: TradeLabMetricSnapshot | null
  logs: TradeLabLogEntry[]
  orders: TradeLabOrderEntry[]
  candles: TradeLabCandleEntry[]
  equityCurve: TradeLabEquityPoint[]
  preflight: TradeLabPreflightResult | null
  activePipeline: TradeLabRunPipeline | null
  jobVisibility: TradeLabStrategyJobVisibility | null
  fillJobVisibility: TradeLabDatasetFillJobVisibility | null
  fillJobVisibilityError: string | null
  isFillJobVisibilityLoading: boolean
  fillSchedulerStatus: TradeLabFillSchedulerStatus | null
  fillSchedulerStatusError: string | null
  isFillSchedulerStatusLoading: boolean
  refreshFillSchedulerStatus: () => Promise<TradeLabFillSchedulerStatus | null>
  paperSchedulerStatus: TradeLabPaperSchedulerStatus | null
  paperSchedulerStatusError: string | null
  isPaperSchedulerStatusLoading: boolean
  refreshPaperSchedulerStatus: () => Promise<TradeLabPaperSchedulerStatus | null>
  datasetFillEnqueueResult: TradeLabDatasetFillEnqueueLocalResult | null
  datasetFillEnqueueError: string | null
  isEnqueueingDatasetFill: boolean
  queueDatasetFillLocal: () => Promise<TradeLabDatasetFillEnqueueLocalResult | null>
  isJobVisibilityLoading: boolean
  jobVisibilityError: string | null
  runHistory: TradeLabRunHistoryEntry[]
  selectedTrade: TradeLabTradeDetail | null
  selectedAnalyzedTrade: TradeLabAnalyzedTrade | null
  selectedTradeExecutionDetail: TradeLabSelectedTradeExecutionDetail | null
  runAnalysis: TradeLabRunAnalysis | null
  compareCandidates: TradeLabRunHistoryEntry[]
  compareMode: TradeLabCompareModeState | null
  benchmarkCheck: TradeLabBenchmarkCheck | null
  isComparePickerOpen: boolean
  editorSource: string
  draftSavedAt: string | null
}
