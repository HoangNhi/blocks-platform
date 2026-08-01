import type { ApiClient } from "@/lib/api/client"
import type {
  TradeLabBotStatus,
  TradeLabDatasetFillEnqueueLocalRequest,
  TradeLabDatasetFillPreviewRequest,
  TradeLabExecutionJournalEntryRequest,
  TradeLabDatasetLocalFillRequest,
  TradeLabMode,
  TradeLabPaperSessionObservabilityOptions,
  TradeLabPaperSessionCancelLocalRequest,
  TradeLabPaperSessionPreviewRequest,
  TradeLabPaperSessionResumeLocalRequest,
  TradeLabPaperSessionRetryLocalRequest,
  TradeLabPaperSessionRunLocalRequest,
  TradeLabPaperSessionStartRequest,
  TradeLabLiveOrderCancelRequest,
  TradeLabLiveOrderConfirmSubmitRequest,
  TradeLabLiveOrderJournalProjectionRequest,
  TradeLabLiveOrderListOptions,
  TradeLabLiveOrderPreviewRequest,
  TradeLabLiveOrderReconcileRequest,
  TradeLabTestnetOrderCancelRequest,
  TradeLabTestnetOrderConfirmSubmitRequest,
  TradeLabTestnetOrderJournalProjectionRequest,
  TradeLabTestnetOrderListOptions,
  TradeLabTestnetOrderPreviewRequest,
  TradeLabTestnetOrderReconcileRequest,
} from "../types"

type TradeLabApiOptions = Pick<ApiClient, "request">

export type UpdateStrategyRequest = {
  runtime_config?: Record<string, unknown>
  risk_config?: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export type CreateBotRequest = {
  strategy_id: string
  strategy_version_id: string | null
  name: string
  mode?: TradeLabMode
  status?: TradeLabBotStatus
  symbol: string
  timeframe: string
  runtime_config: Record<string, unknown>
  risk_config: Record<string, unknown>
  metadata?: Record<string, unknown>
}

export type RunBotBacktestRequest = {
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
}

export type GetDatasetLocalFillAuditOptions = {
  exchange?: string
  symbol?: string
  timeframe?: string
  datasetKey?: string
  limit?: number
}

export type GetDatasetFillJobVisibilityOptions = {
  exchange?: string
  symbol?: string
  timeframe?: string
  datasetKey?: string
  limit?: number
}

export function createTradeLabApi(client: TradeLabApiOptions) {
  return {
    listStrategyGroups: () => client.request<{ items: unknown[] }>("/api/tradelab/strategy-groups"),
    listStrategies: (strategyGroupId?: string) =>
      client.request<{ items: unknown[] }>("/api/tradelab/strategies", {
        query: { strategy_group_id: strategyGroupId },
      }),
    getStrategy: (strategyId: string) => client.request<unknown>(`/api/tradelab/strategies/${strategyId}`),
    updateStrategy: (strategyId: string, body: UpdateStrategyRequest) =>
      client.request<unknown>(`/api/tradelab/strategies/${strategyId}`, {
        method: "PUT",
        body,
      }),
    listStrategyVersions: (strategyId: string) =>
      client.request<{ items: unknown[] }>(`/api/tradelab/strategies/${strategyId}/versions`),
    createStrategyVersion: (strategyId: string, sourceCode: string) =>
      client.request<unknown>(`/api/tradelab/strategies/${strategyId}/versions`, {
        method: "POST",
        body: { source_code: sourceCode },
      }),
    validateStrategySource: (sourceCode: string) =>
      client.request<unknown>("/api/tradelab/strategies/validate-source", {
        method: "POST",
        body: { sourceCode },
      }),
    listBots: () => client.request<{ items: unknown[] }>("/api/tradelab/bots"),
    createBot: (body: CreateBotRequest) =>
      client.request<unknown>("/api/tradelab/bots", {
        method: "POST",
        body: { mode: "backtest", status: "draft", ...body },
      }),
    preflightBotBacktest: (botId: string, body: RunBotBacktestRequest) =>
      client.request<unknown>(`/api/tradelab/bots/${botId}/backtests/preflight`, {
        method: "POST",
        body,
      }),
    startBotBacktest: (botId: string, body: RunBotBacktestRequest) =>
      client.request<unknown>(`/api/tradelab/bots/${botId}/backtests`, {
        method: "POST",
        body,
      }),
    listBotRuns: (options?: { strategyId?: string; status?: string; limit?: number }) =>
      client.request<{ items: unknown[] }>("/api/tradelab/bot-runs", {
        query: {
          strategy_id: options?.strategyId,
          status: options?.status,
          limit: options?.limit,
        },
      }),
    getBotRun: (runId: string) => client.request<unknown>(`/api/tradelab/bot-runs/${runId}`),
    getBotRunAnalysis: (runId: string) => client.request<unknown>(`/api/tradelab/bot-runs/${runId}/analysis`),
    startBenchmarkRepeat: (runId: string) =>
      client.request<unknown>(`/api/tradelab/bot-runs/${runId}/benchmark-repeat`, {
        method: "POST",
        body: { confirm_same_input: true },
      }),
    createManualSignalPackage: (runId: string) =>
      client.request<unknown>(`/api/tradelab/bot-runs/${runId}/manual-signal-package`, {
        method: "POST",
        body: { confirmManualSignalOnly: true, source: "strategy_lab" },
      }),
    createResearchRobustnessGate: (runId: string) =>
      client.request<unknown>(`/api/tradelab/bot-runs/${runId}/robustness-gate`, {
        method: "POST",
        body: { confirmResearchOnly: true, source: "strategy_lab" },
      }),
    listExecutionJournalEntries: (runId: string) =>
      client.request<unknown>(`/api/tradelab/bot-runs/${runId}/execution-journal`),
    createExecutionJournalEntry: (runId: string, body: TradeLabExecutionJournalEntryRequest) =>
      client.request<unknown>(`/api/tradelab/bot-runs/${runId}/execution-journal`, {
        method: "POST",
        body,
      }),
    updateExecutionJournalEntry: (entryId: string, body: TradeLabExecutionJournalEntryRequest) =>
      client.request<unknown>(`/api/tradelab/execution-journal/${entryId}`, {
        method: "PATCH",
        body,
      }),
    deleteExecutionJournalEntry: (entryId: string) =>
      client.request<unknown>(`/api/tradelab/execution-journal/${entryId}`, {
        method: "DELETE",
      }),
    getBenchmarkChecks: (runId: string) =>
      client.request<{ latest: unknown | null }>(`/api/tradelab/bot-runs/${runId}/benchmark-checks`),
    getBotRunPipeline: (runId: string) =>
      client.request<unknown>(`/api/tradelab/bot-runs/${runId}/pipeline`),
    getStrategyJobVisibility: (strategyId: string, options?: { limit?: number }) =>
      client.request<unknown>(`/api/tradelab/strategies/${strategyId}/job-visibility`, {
        query: { limit: options?.limit },
      }),
    listDatasetCoverage: () => client.request<{ items: unknown[] }>("/api/tradelab/datasets/coverage"),
    previewDatasetFill: (body: TradeLabDatasetFillPreviewRequest) =>
      client.request<unknown>("/api/tradelab/datasets/fill-preview", {
        method: "POST",
        body,
      }),
    previewPaperSession: (body: TradeLabPaperSessionPreviewRequest) =>
      client.request<unknown>("/api/tradelab/paper/sessions/preview", {
        method: "POST",
        body,
      }),
    getPaperKillSwitchStatus: () =>
      client.request<unknown>("/api/tradelab/paper/safety/status"),
    getPaperSchedulerStatus: () =>
      client.request<unknown>("/api/tradelab/paper/scheduler/status"),
    startPaperSession: (body: TradeLabPaperSessionStartRequest) =>
      client.request<unknown>("/api/tradelab/paper/sessions/start", {
        method: "POST",
        body,
      }),
    getPaperSessionDetail: (sessionId: string) =>
      client.request<unknown>(`/api/tradelab/paper/sessions/${encodeURIComponent(sessionId)}`),
    listPaperSessions: (options?: TradeLabPaperSessionObservabilityOptions) =>
      client.request<unknown>("/api/tradelab/paper/sessions", {
        query: {
          strategyId: options?.strategyId,
          strategyVersionId: options?.strategyVersionId,
          datasetKey: options?.datasetKey,
          status: options?.status,
          limit: options?.limit,
        },
      }),
    runPaperSessionLocal: (sessionId: string, body: TradeLabPaperSessionRunLocalRequest) =>
      client.request<unknown>(`/api/tradelab/paper/sessions/${encodeURIComponent(sessionId)}/run-local`, {
        method: "POST",
        body,
      }),
    cancelPaperSessionLocal: (sessionId: string, body: TradeLabPaperSessionCancelLocalRequest) =>
      client.request<unknown>(`/api/tradelab/paper/sessions/${encodeURIComponent(sessionId)}/cancel-local`, {
        method: "POST",
        body,
      }),
    retryPaperSessionLocal: (sessionId: string, body: TradeLabPaperSessionRetryLocalRequest) =>
      client.request<unknown>(`/api/tradelab/paper/sessions/${encodeURIComponent(sessionId)}/retry-local`, {
        method: "POST",
        body,
      }),
    getPaperSessionResumeReadiness: (sessionId: string) =>
      client.request<unknown>(`/api/tradelab/paper/sessions/${encodeURIComponent(sessionId)}/resume-readiness`),
    resumePaperSessionLocal: (sessionId: string, body: TradeLabPaperSessionResumeLocalRequest) =>
      client.request<unknown>(`/api/tradelab/paper/sessions/${encodeURIComponent(sessionId)}/resume-local`, {
        method: "POST",
        body,
      }),
    previewTestnetOrder: (body: TradeLabTestnetOrderPreviewRequest) =>
      client.request<unknown>("/api/tradelab/testnet/orders/preview", {
        method: "POST",
        body,
      }),
    confirmSubmitTestnetOrder: (previewId: string, body: TradeLabTestnetOrderConfirmSubmitRequest) =>
      client.request<unknown>(`/api/tradelab/testnet/orders/${encodeURIComponent(previewId)}/confirm-submit`, {
        method: "POST",
        body,
      }),
    cancelTestnetOrder: (orderId: string, body: TradeLabTestnetOrderCancelRequest) =>
      client.request<unknown>(`/api/tradelab/testnet/orders/${encodeURIComponent(orderId)}/cancel`, {
        method: "POST",
        body,
      }),
    reconcileTestnetOrder: (body: TradeLabTestnetOrderReconcileRequest) =>
      client.request<unknown>("/api/tradelab/testnet/reconcile", {
        method: "POST",
        body,
      }),
    projectTestnetOrderToJournal: (orderId: string, body: TradeLabTestnetOrderJournalProjectionRequest) =>
      client.request<unknown>(`/api/tradelab/testnet/orders/${encodeURIComponent(orderId)}/project-journal`, {
        method: "POST",
        body,
      }),
    getTestnetOrderDetail: (orderId: string) =>
      client.request<unknown>(`/api/tradelab/testnet/orders/${encodeURIComponent(orderId)}`),
    listTestnetOrders: (options?: TradeLabTestnetOrderListOptions) =>
      client.request<unknown>("/api/tradelab/testnet/orders", { query: options }),
    previewLiveOrder: (body: TradeLabLiveOrderPreviewRequest) =>
      client.request<unknown>("/api/tradelab/live/orders/preview", {
        method: "POST",
        body,
      }),
    confirmSubmitLiveOrder: (previewId: string, body: TradeLabLiveOrderConfirmSubmitRequest) =>
      client.request<unknown>(`/api/tradelab/live/orders/${encodeURIComponent(previewId)}/confirm-submit`, {
        method: "POST",
        body,
      }),
    cancelLiveOrder: (orderId: string, body: TradeLabLiveOrderCancelRequest) =>
      client.request<unknown>(`/api/tradelab/live/orders/${encodeURIComponent(orderId)}/cancel`, {
        method: "POST",
        body,
      }),
    reconcileLiveOrder: (orderId: string, body: TradeLabLiveOrderReconcileRequest) =>
      client.request<unknown>(`/api/tradelab/live/orders/${encodeURIComponent(orderId)}/reconcile`, {
        method: "POST",
        body,
      }),
    projectLiveOrderToJournal: (orderId: string, body: TradeLabLiveOrderJournalProjectionRequest) =>
      client.request<unknown>(`/api/tradelab/live/orders/${encodeURIComponent(orderId)}/project-journal`, {
        method: "POST",
        body,
      }),
    getLiveOrderDetail: (orderId: string) =>
      client.request<unknown>(`/api/tradelab/live/orders/${encodeURIComponent(orderId)}`),
    listLiveOrders: (options?: TradeLabLiveOrderListOptions) =>
      client.request<unknown>("/api/tradelab/live/orders", { query: options }),
    fillDatasetLocal: (body: TradeLabDatasetLocalFillRequest) =>
      client.request<unknown>("/api/tradelab/datasets/fill-local", {
        method: "POST",
        body,
      }),
    enqueueDatasetFillLocal: (body: TradeLabDatasetFillEnqueueLocalRequest) =>
      client.request<unknown>("/api/tradelab/datasets/fill-enqueue-local", {
        method: "POST",
        body,
      }),
    getDatasetLocalFillAudit: (options: GetDatasetLocalFillAuditOptions) =>
      client.request<unknown>("/api/tradelab/datasets/local-fill-audit", {
        query: {
          exchange: options.exchange,
          symbol: options.symbol,
          timeframe: options.timeframe,
          dataset_key: options.datasetKey,
          limit: options.limit,
        },
      }),
    getDatasetFillJobVisibility: (options: GetDatasetFillJobVisibilityOptions) =>
      client.request<unknown>("/api/tradelab/datasets/fill-job-visibility", {
        query: {
          exchange: options.exchange,
          symbol: options.symbol,
          timeframe: options.timeframe,
          datasetKey: options.datasetKey,
          limit: options.limit,
        },
      }),
    getFillSchedulerStatus: () =>
      client.request<unknown>("/api/tradelab/datasets/fill-scheduler/status"),
    getBotRunChart: (runId: string, selectedTradeId?: string | null) =>
      client.request<unknown>(`/api/tradelab/bot-runs/${runId}/chart`, {
        query: selectedTradeId ? { selected_trade_id: selectedTradeId } : undefined,
      }),
    getBotRunTradeDetail: (runId: string, tradeId: string) =>
      client.request<unknown>(`/api/tradelab/bot-runs/${runId}/trades/${tradeId}`),
    getBotRunLogs: (runId: string) =>
      client.request<{ items: unknown[] }>(`/api/tradelab/bot-runs/${runId}/logs`),
    getBotRunOrders: (runId: string) =>
      client.request<{ items: unknown[] }>(`/api/tradelab/bot-runs/${runId}/orders`),
    getBotRunResult: (runId: string) =>
      client.request<unknown>(`/api/tradelab/bot-runs/${runId}/result`),
    runBotBacktest: (botId: string, body: RunBotBacktestRequest) =>
      client.request<unknown>(`/api/tradelab/bots/${botId}/backtests`, {
        method: "POST",
        body,
      }),
  }
}
