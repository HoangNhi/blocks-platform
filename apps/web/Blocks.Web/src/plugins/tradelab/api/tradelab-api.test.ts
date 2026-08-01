import { describe, expect, it, vi } from "vitest"

import type { ApiClient } from "@/lib/api/client"

import { createTradeLabApi } from "./tradelab-api"

function createRequestMock(): ApiClient["request"] {
  return vi.fn() as unknown as ApiClient["request"]
}

describe("TradeLab API client", () => {
  it("loads strategy groups from backend", async () => {
    const request = createRequestMock()
    const api = createTradeLabApi({ request })

    await api.listStrategyGroups()

    expect(request).toHaveBeenCalledWith("/api/tradelab/strategy-groups")
  })

  it("lists strategies with the selected group query", async () => {
    const request = createRequestMock()
    const api = createTradeLabApi({ request })

    await api.listStrategies("group-1")

    expect(request).toHaveBeenCalledWith("/api/tradelab/strategies", {
      query: { strategy_group_id: "group-1" },
    })
  })

  it("updates strategies through backend", async () => {
    const request = createRequestMock()
    const api = createTradeLabApi({ request })

    await api.updateStrategy("strategy-1", {
      runtime_config: { exchange: "binance" },
      risk_config: { max_order_percent: 10 },
    })

    expect(request).toHaveBeenCalledWith("/api/tradelab/strategies/strategy-1", {
      method: "PUT",
      body: {
        runtime_config: { exchange: "binance" },
        risk_config: { max_order_percent: 10 },
      },
    })
  })

  it("lists dataset coverage", async () => {
    const request = createRequestMock()
    const api = createTradeLabApi({ request })

    await api.listDatasetCoverage()

    expect(request).toHaveBeenCalledWith("/api/tradelab/datasets/coverage")
  })

  it("creates strategy versions through backend", async () => {
    const request = createRequestMock()
    const api = createTradeLabApi({ request })

    await api.createStrategyVersion("strategy-1", "print('ok')")

    expect(request).toHaveBeenCalledWith("/api/tradelab/strategies/strategy-1/versions", {
      method: "POST",
      body: { source_code: "print('ok')" },
    })
  })

  it("validates strategy source without creating a version", async () => {
    const request = createRequestMock()
    const api = createTradeLabApi({ request })

    await api.validateStrategySource("def on_candle(ctx):\n    return None\n")

    expect(request).toHaveBeenCalledWith("/api/tradelab/strategies/validate-source", {
      method: "POST",
      body: { sourceCode: "def on_candle(ctx):\n    return None\n" },
    })
  })

  it("creates backtest bots through backend", async () => {
    const request = createRequestMock()
    const api = createTradeLabApi({ request })

    await api.createBot({
      strategy_id: "strategy-1",
      strategy_version_id: "version-1",
      name: "Bot 1",
      symbol: "BTCUSDT",
      timeframe: "1h",
      runtime_config: {},
      risk_config: {},
    })

    expect(request).toHaveBeenCalledWith("/api/tradelab/bots", {
      method: "POST",
      body: {
        mode: "backtest",
        status: "draft",
        strategy_id: "strategy-1",
        strategy_version_id: "version-1",
        name: "Bot 1",
        symbol: "BTCUSDT",
        timeframe: "1h",
        runtime_config: {},
        risk_config: {},
      },
    })
  })

  it("creates paper draft bots through backend", async () => {
    const request = createRequestMock()
    const api = createTradeLabApi({ request })

    await api.createBot({
      strategy_id: "strategy-1",
      strategy_version_id: "version-1",
      name: "Paper Draft 1",
      mode: "paper",
      status: "draft",
      symbol: "BTCUSDT",
      timeframe: "1h",
      runtime_config: {},
      risk_config: {},
    })

    expect(request).toHaveBeenCalledWith("/api/tradelab/bots", {
      method: "POST",
      body: {
        mode: "paper",
        status: "draft",
        strategy_id: "strategy-1",
        strategy_version_id: "version-1",
        name: "Paper Draft 1",
        symbol: "BTCUSDT",
        timeframe: "1h",
        runtime_config: {},
        risk_config: {},
      },
    })
  })

  it("runs bot backtests through backend", async () => {
    const request = createRequestMock()
    const api = createTradeLabApi({ request })

    await api.runBotBacktest("bot-1", {
      exchange: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      start_at: "2026-01-01T00:00:00Z",
      end_at: "2026-01-02T00:00:00Z",
      initial_equity: 10000,
      fee_bps: 10,
      slippage_bps: 5,
    })

    expect(request).toHaveBeenCalledWith("/api/tradelab/bots/bot-1/backtests", {
      method: "POST",
      body: {
        exchange: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        start_at: "2026-01-01T00:00:00Z",
        end_at: "2026-01-02T00:00:00Z",
        initial_equity: 10000,
        fee_bps: 10,
        slippage_bps: 5,
      },
    })
  })

  it("requests preflight, pipeline, chart, and history endpoints", async () => {
    const request = createRequestMock()
    const api = createTradeLabApi({ request })

    await api.preflightBotBacktest("bot-1", {
      exchange: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      start_at: "2026-01-01T00:00:00Z",
      end_at: "2026-01-02T00:00:00Z",
      initial_equity: 1000,
      fee_bps: 0,
      slippage_bps: 0,
    })
    await api.startBotBacktest("bot-1", {
      exchange: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      start_at: "2026-01-01T00:00:00Z",
      end_at: "2026-01-02T00:00:00Z",
      initial_equity: 1000,
      fee_bps: 0,
      slippage_bps: 0,
    })
    await api.listBotRuns({ strategyId: "strategy-1", status: "completed", limit: 25 })
    await api.getBotRunPipeline("run-1")
    await api.getBotRunChart("run-1", "trade-1")

    expect(request).toHaveBeenNthCalledWith(1, "/api/tradelab/bots/bot-1/backtests/preflight", {
      method: "POST",
      body: {
        exchange: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        start_at: "2026-01-01T00:00:00Z",
        end_at: "2026-01-02T00:00:00Z",
        initial_equity: 1000,
        fee_bps: 0,
        slippage_bps: 0,
      },
    })
    expect(request).toHaveBeenNthCalledWith(2, "/api/tradelab/bots/bot-1/backtests", {
      method: "POST",
      body: {
        exchange: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        start_at: "2026-01-01T00:00:00Z",
        end_at: "2026-01-02T00:00:00Z",
        initial_equity: 1000,
        fee_bps: 0,
        slippage_bps: 0,
      },
    })
    expect(request).toHaveBeenNthCalledWith(3, "/api/tradelab/bot-runs", {
      query: {
        strategy_id: "strategy-1",
        status: "completed",
        limit: 25,
      },
    })
    expect(request).toHaveBeenNthCalledWith(4, "/api/tradelab/bot-runs/run-1/pipeline")
    expect(request).toHaveBeenNthCalledWith(5, "/api/tradelab/bot-runs/run-1/chart", {
      query: { selected_trade_id: "trade-1" },
    })
  })

  it("loads strategy job visibility with recent limit query", async () => {
    const request = createRequestMock()
    const api = createTradeLabApi({ request })

    await api.getStrategyJobVisibility("strategy-1", { limit: 5 })

    expect(request).toHaveBeenCalledWith("/api/tradelab/strategies/strategy-1/job-visibility", {
      query: { limit: 5 },
    })
  })

  it("loads dataset coverage catalog through backend", async () => {
    const request = createRequestMock()
    const api = createTradeLabApi({ request })

    await api.listDatasetCoverage()

    expect(request).toHaveBeenCalledWith("/api/tradelab/datasets/coverage")
  })

  it("posts assisted testnet submit, cancel, and reconcile requests", async () => {
    const request = createRequestMock()
    const api = createTradeLabApi({ request })

    await api.confirmSubmitTestnetOrder("preview-1", {
      confirmTestnetOrder: true,
      idempotencyKey: "submit-1",
      actor: "local-user",
    })
    await api.cancelTestnetOrder("intent-1", {
      confirmTestnetCancel: true,
      idempotencyKey: "cancel-1",
      reason: "user_requested",
      actor: "local-user",
    })
    await api.reconcileTestnetOrder({
      orderId: "intent-1",
      confirmTestnetReconcile: true,
      trigger: "manual",
      actor: "local-user",
    })
    await api.projectTestnetOrderToJournal("intent-1", {
      confirmTestnetJournalProjection: true,
      source: "strategy_lab",
      actor: "local-user",
    })

    expect(request).toHaveBeenNthCalledWith(1, "/api/tradelab/testnet/orders/preview-1/confirm-submit", {
      method: "POST",
      body: { confirmTestnetOrder: true, idempotencyKey: "submit-1", actor: "local-user" },
    })
    expect(request).toHaveBeenNthCalledWith(2, "/api/tradelab/testnet/orders/intent-1/cancel", {
      method: "POST",
      body: { confirmTestnetCancel: true, idempotencyKey: "cancel-1", reason: "user_requested", actor: "local-user" },
    })
    expect(request).toHaveBeenNthCalledWith(3, "/api/tradelab/testnet/reconcile", {
      method: "POST",
      body: { orderId: "intent-1", confirmTestnetReconcile: true, trigger: "manual", actor: "local-user" },
    })
    expect(request).toHaveBeenNthCalledWith(4, "/api/tradelab/testnet/orders/intent-1/project-journal", {
      method: "POST",
      body: { confirmTestnetJournalProjection: true, source: "strategy_lab", actor: "local-user" },
    })
  })

  it("posts assisted live preview, submit, cancel, reconcile, and journal requests", async () => {
    const request = createRequestMock()
    const api = createTradeLabApi({ request })

    await api.previewLiveOrder({
      confirmPreviewOnly: true,
      idempotencyKey: "preview-1",
      clientActionId: "preview-1",
      source: "strategy_lab",
      actor: "local-user",
      strategyId: "strategy-1",
      strategyVersionId: "version-1",
      credentialRefId: "credential-1",
      environment: "binance_live",
      exchange: "binance",
      marketType: "spot",
      symbol: "BTCUSDT",
      side: "buy",
      orderType: "market",
      quantity: null,
      quoteQuantity: "25",
    })
    await api.confirmSubmitLiveOrder("preview-1", {
      confirmLiveOrder: true,
      idempotencyKey: "submit-1",
      actor: "local-user",
    })
    await api.cancelLiveOrder("intent-1", {
      confirmLiveCancel: true,
      idempotencyKey: "cancel-1",
      reason: "user_requested",
      actor: "local-user",
    })
    await api.reconcileLiveOrder("intent-1", {
      confirmLiveReconcile: true,
      trigger: "manual",
      actor: "local-user",
    })
    await api.projectLiveOrderToJournal("intent-1", {
      confirmLiveJournalProjection: true,
      source: "strategy_lab",
      actor: "local-user",
    })

    expect(request).toHaveBeenNthCalledWith(1, "/api/tradelab/live/orders/preview", {
      method: "POST",
      body: expect.objectContaining({
        confirmPreviewOnly: true,
        strategyId: "strategy-1",
        credentialRefId: "credential-1",
        environment: "binance_live",
      }),
    })
    expect(request).toHaveBeenNthCalledWith(2, "/api/tradelab/live/orders/preview-1/confirm-submit", {
      method: "POST",
      body: { confirmLiveOrder: true, idempotencyKey: "submit-1", actor: "local-user" },
    })
    expect(request).toHaveBeenNthCalledWith(3, "/api/tradelab/live/orders/intent-1/cancel", {
      method: "POST",
      body: { confirmLiveCancel: true, idempotencyKey: "cancel-1", reason: "user_requested", actor: "local-user" },
    })
    expect(request).toHaveBeenNthCalledWith(4, "/api/tradelab/live/orders/intent-1/reconcile", {
      method: "POST",
      body: { confirmLiveReconcile: true, trigger: "manual", actor: "local-user" },
    })
    expect(request).toHaveBeenNthCalledWith(5, "/api/tradelab/live/orders/intent-1/project-journal", {
      method: "POST",
      body: { confirmLiveJournalProjection: true, source: "strategy_lab", actor: "local-user" },
    })
  })

  it("previews dataset fill through preview-only backend endpoint", async () => {
    const request = createRequestMock()
    const api = createTradeLabApi({ request })
    const body = {
      strategy_id: "strategy-1",
      exchange: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      requested_start_at: "2026-01-01T00:00:00Z",
      requested_end_at: "2026-01-02T00:00:00Z",
      source: "strategy_lab",
    }

    await api.previewDatasetFill(body)

    expect(request).toHaveBeenCalledWith("/api/tradelab/datasets/fill-preview", {
      method: "POST",
      body,
    })
  })

  it("previews paper session readiness through preview-only backend endpoint", async () => {
    const request = createRequestMock()
    const api = createTradeLabApi({ request })
    const body = {
      bot_id: "paper-bot-1",
      exchange: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      start_at: "2026-01-01T00:00:00Z",
      end_at: "2026-01-02T00:00:00Z",
      risk_policy_override: {
        startingCash: 1000,
        maxOrderPercent: 10,
        maxPositionPercent: 100,
        maxDrawdownPercent: 15,
        minNotional: 10,
      },
      source: "strategy_lab",
    }

    await api.previewPaperSession(body)

    expect(request).toHaveBeenCalledWith("/api/tradelab/paper/sessions/preview", {
      method: "POST",
      body,
    })
  })

  it("loads read-only paper kill switch status", async () => {
    const request = createRequestMock()
    const api = createTradeLabApi({ request })

    await api.getPaperKillSwitchStatus()

    expect(request).toHaveBeenCalledWith("/api/tradelab/paper/safety/status")
  })

  it("starts paper session through start-only backend endpoint", async () => {
    const request = createRequestMock()
    const api = createTradeLabApi({ request })
    const body = {
      bot_id: "paper-bot-1",
      exchange: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      start_at: "2026-01-01T00:00:00Z",
      end_at: "2026-01-02T00:00:00Z",
      starting_cash: 1000,
      idempotency_key: "strategy-lab:123:abc",
      confirm_start: true,
      risk_policy_override: {
        startingCash: 1000,
        maxOrderPercent: 10,
        maxPositionPercent: 100,
        maxDrawdownPercent: 15,
        minNotional: 10,
      },
      source: "strategy_lab",
      actor: "local-user",
    } as const

    await api.startPaperSession(body)

    expect(request).toHaveBeenCalledWith("/api/tradelab/paper/sessions/start", {
      method: "POST",
      body,
    })
  })

  it("loads paper session detail through read-only backend endpoint", async () => {
    const request = createRequestMock()
    const api = createTradeLabApi({ request })

    await api.getPaperSessionDetail("paper-session-1")

    expect(request).toHaveBeenCalledWith("/api/tradelab/paper/sessions/paper-session-1")
  })

  it("lists read-only paper session observability summaries with current context filters", async () => {
    const request = createRequestMock()
    const api = createTradeLabApi({ request })

    await api.listPaperSessions({
      strategyId: "strategy-1",
      strategyVersionId: "version-1",
      datasetKey: "binance:BTCUSDT:1h",
      status: "completed",
      limit: 5,
    })

    expect(request).toHaveBeenCalledWith("/api/tradelab/paper/sessions", {
      query: {
        strategyId: "strategy-1",
        strategyVersionId: "version-1",
        datasetKey: "binance:BTCUSDT:1h",
        status: "completed",
        limit: 5,
      },
    })
    expect((request as ReturnType<typeof vi.fn>).mock.calls.map(([url]) => String(url)).join("\n")).not.toContain(
      "engine-tick-local",
    )
  })

  it("runs a loaded paper session through the wrapper endpoint only", async () => {
    const request = createRequestMock()
    const api = createTradeLabApi({ request })
    const body = {
      confirm_local_paper_run: true,
      max_candles_per_tick: 10000,
      worker_id: "strategy-lab-local-paper-run",
    } as const

    await api.runPaperSessionLocal("paper/session id", body)

    expect(request).toHaveBeenCalledWith("/api/tradelab/paper/sessions/paper%2Fsession%20id/run-local", {
      method: "POST",
      body,
    })
    expect((request as ReturnType<typeof vi.fn>).mock.calls.map(([url]) => String(url)).join("\n")).not.toContain(
      "engine-tick-local",
    )
  })

  it("confirms local dataset fill through local/dev mutation endpoint", async () => {
    const request = createRequestMock()
    const api = createTradeLabApi({ request })
    const body = {
      strategy_id: "strategy-1",
      exchange: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      requested_start_at: "2026-01-01T00:00:00Z",
      requested_end_at: "2026-01-02T00:00:00Z",
      preview_id: "preview-1",
      request_fingerprint: "fingerprint-1",
      confirm_local_fill: true,
      source: "strategy_lab",
    }

    await api.fillDatasetLocal(body)

    expect(request).toHaveBeenCalledWith("/api/tradelab/datasets/fill-local", {
      method: "POST",
      body,
    })
  })

  it("queues local background dataset fill through local/dev enqueue endpoint", async () => {
    const request = createRequestMock()
    const api = createTradeLabApi({ request })
    const body = {
      strategy_id: "strategy-1",
      exchange: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      requested_start_at: "2026-01-01T00:00:00Z",
      requested_end_at: "2026-01-01T06:00:00Z",
      preview_id: "preview-1",
      request_fingerprint: "fingerprint-1",
      missing_ranges: [{ start_at: "2026-01-01T03:00:00Z", end_at: "2026-01-01T06:00:00Z", kind: "tail" }],
      confirm_local_fill: true,
      source: "strategy_lab",
    }

    await api.enqueueDatasetFillLocal(body)

    expect(request).toHaveBeenCalledWith("/api/tradelab/datasets/fill-enqueue-local", {
      method: "POST",
      body,
    })
  })

  it("fetches local fill audit through read-only dataset endpoint", async () => {
    const request = createRequestMock()
    const api = createTradeLabApi({ request })

    await api.getDatasetLocalFillAudit({
      exchange: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      limit: 5,
    })

    expect(request).toHaveBeenCalledWith("/api/tradelab/datasets/local-fill-audit", {
      query: {
        exchange: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        dataset_key: undefined,
        limit: 5,
      },
    })
  })

  it("fetches background fill job visibility through read-only dataset endpoint", async () => {
    const request = createRequestMock()
    const api = createTradeLabApi({ request })

    await api.getDatasetFillJobVisibility({
      datasetKey: "binance:BTCUSDT:1h",
      limit: 5,
    })

    expect(request).toHaveBeenCalledWith("/api/tradelab/datasets/fill-job-visibility", {
      query: {
        exchange: undefined,
        symbol: undefined,
        timeframe: undefined,
        datasetKey: "binance:BTCUSDT:1h",
        limit: 5,
      },
    })
  })

  it("fetches scheduler status through read-only dataset endpoint", async () => {
    const request = createRequestMock()
    const api = createTradeLabApi({ request })

    await api.getFillSchedulerStatus()

    expect(request).toHaveBeenCalledWith("/api/tradelab/datasets/fill-scheduler/status")
  })

  it("fetches paper scheduler status through read-only paper endpoint", async () => {
    const request = createRequestMock()
    const api = createTradeLabApi({ request })

    await api.getPaperSchedulerStatus()

    expect(request).toHaveBeenCalledWith("/api/tradelab/paper/scheduler/status")
  })

  it("starts benchmark repeat with same-input confirmation", async () => {
    const request = vi.fn().mockResolvedValue({})
    const api = createTradeLabApi({ request })

    await api.startBenchmarkRepeat("run-1")

    expect(request).toHaveBeenCalledWith("/api/tradelab/bot-runs/run-1/benchmark-repeat", {
      method: "POST",
      body: { confirm_same_input: true },
    })
  })

  it("creates manual signal package with manual-only confirmation", async () => {
    const request = vi.fn().mockResolvedValue({ signalPackageId: "pkg-1" })
    const api = createTradeLabApi({ request })

    await api.createManualSignalPackage("run-1")

    expect(request).toHaveBeenCalledWith("/api/tradelab/bot-runs/run-1/manual-signal-package", {
      method: "POST",
      body: { confirmManualSignalOnly: true, source: "strategy_lab" },
    })
  })

  it("creates research robustness gate with research-only confirmation", async () => {
    const request = vi.fn().mockResolvedValue({})
    const api = createTradeLabApi({ request })

    await api.createResearchRobustnessGate("run-1")

    expect(request).toHaveBeenCalledWith("/api/tradelab/bot-runs/run-1/robustness-gate", {
      method: "POST",
      body: { confirmResearchOnly: true, source: "strategy_lab" },
    })
  })

  it("creates execution journal entry", async () => {
    const request = vi.fn().mockResolvedValue({})
    const api = createTradeLabApi({ request })
    const body = {
      confirmManualEntryOnly: true as const,
      source: "strategy_lab" as const,
      side: "long",
      plannedSnapshot: {},
      disciplineStatus: "followed_plan",
      notes: "Observed manually.",
      fills: [{ fillRole: "entry", side: "buy", price: 100, quantity: 1 }],
    }

    await api.createExecutionJournalEntry("run-1", body)

    expect(request).toHaveBeenCalledWith("/api/tradelab/bot-runs/run-1/execution-journal", {
      method: "POST",
      body,
    })
  })

  it("lists execution journal entries", async () => {
    const request = vi.fn().mockResolvedValue({ items: [] })
    const api = createTradeLabApi({ request })

    await api.listExecutionJournalEntries("run-1")

    expect(request).toHaveBeenCalledWith("/api/tradelab/bot-runs/run-1/execution-journal")
  })

  it("cancels local paper session through local/dev endpoint", async () => {
    const request = createRequestMock()
    const api = createTradeLabApi({ request })
    const body = {
      confirm_local_paper_cancel: true as const,
      reason: "user_requested" as const,
      actor: "strategy-lab-local-paper-cancel",
    }

    await api.cancelPaperSessionLocal("paper session/1", body)

    expect(request).toHaveBeenCalledWith("/api/tradelab/paper/sessions/paper%20session%2F1/cancel-local", {
      method: "POST",
      body,
    })
  })

  it("posts local paper retry to encoded session retry wrapper", async () => {
    const request = vi.fn().mockResolvedValue({})
    const api = createTradeLabApi({ request })
    const body = {
      confirm_local_paper_retry: true,
      idempotency_key: "strategy-lab-retry:paper/session id:1",
      reason: "user_requested",
      actor: "strategy-lab-local-paper-retry",
    } as const

    await api.retryPaperSessionLocal("paper/session id", body)

    expect(request).toHaveBeenCalledWith("/api/tradelab/paper/sessions/paper%2Fsession%20id/retry-local", {
      method: "POST",
      body,
    })
    expect((request as ReturnType<typeof vi.fn>).mock.calls.map(([url]) => String(url)).join("\n")).not.toContain(
      "engine-tick-local",
    )
  })

  it("fetches paper resume readiness through the read-only endpoint", async () => {
    const request = createRequestMock()
    const api = createTradeLabApi({ request })

    await api.getPaperSessionResumeReadiness("paper/session id")

    expect(request).toHaveBeenCalledWith("/api/tradelab/paper/sessions/paper%2Fsession%20id/resume-readiness")
  })

  it("posts local paper resume to encoded session resume wrapper", async () => {
    const request = vi.fn().mockResolvedValue({})
    const api = createTradeLabApi({ request })
    const body = {
      confirm_local_paper_resume: true,
      idempotency_key: "strategy-lab-resume:paper/session id:1",
      reason: "user_requested",
      actor: "strategy-lab-local-paper-resume",
    } as const

    await api.resumePaperSessionLocal("paper/session id", body)

    expect(request).toHaveBeenCalledWith("/api/tradelab/paper/sessions/paper%2Fsession%20id/resume-local", {
      method: "POST",
      body,
    })
    expect((request as ReturnType<typeof vi.fn>).mock.calls.map(([url]) => String(url)).join("\n")).not.toContain(
      "engine-tick-local",
    )
  })
})
