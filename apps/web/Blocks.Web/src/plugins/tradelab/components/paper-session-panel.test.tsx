// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { PaperSessionPanel } from "./paper-session-panel"
import type {
  TradeLabPaperSessionDetail,
  TradeLabPaperSessionCancelLocalResult,
  TradeLabPaperSessionObservability,
  TradeLabPaperSessionPreview,
  TradeLabPaperSessionResumeLocalResult,
  TradeLabPaperSessionResumeReadiness,
  TradeLabPaperSessionRetryLocalResult,
  TradeLabPaperSessionRunLocalResult,
  TradeLabPaperSessionSetupReason,
} from "../types"

function createSetupReason(): TradeLabPaperSessionSetupReason {
  return {
    code: "paper_draft_required",
    message: "Save a paper draft before previewing paper session readiness.",
  }
}

function createPreview(overrides: Partial<TradeLabPaperSessionPreview> = {}): TradeLabPaperSessionPreview {
  return {
    mode: "paper",
    previewStatus: "allowed",
    allowed: true,
    reasonCode: "paper_preview_allowed",
    failedGates: [],
    warnings: [],
    details: {},
    safetyStatus: "preview_only",
    botContext: {
      botId: "paper-bot-1",
      mode: "paper",
      status: "draft",
      symbol: "BTCUSDT",
      timeframe: "1h",
    },
    strategyContext: {
      strategyId: "strategy-1",
      strategyVersionId: "version-1",
      sourceValid: true,
      versionLocked: true,
      dirty: false,
    },
    datasetContext: {
      datasetKey: "binance:BTCUSDT:1h",
      exchange: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      startAt: "2026-01-01T00:00:00Z",
      endAt: "2026-01-02T00:00:00Z",
      preflightOutcome: "ready",
    },
    ...overrides,
  }
}

function createDetail(overrides: Partial<TradeLabPaperSessionDetail> = {}): TradeLabPaperSessionDetail {
  return {
    session: {
      sessionId: "paper-session-1",
      botId: "paper-bot-1",
      strategyId: "strategy-1",
      strategyVersionId: "version-1",
      mode: "paper",
      status: "completed",
      exchange: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      datasetKey: "binance:BTCUSDT:1h",
      startAt: "2026-01-01T00:00:00Z",
      endAt: "2026-01-02T00:00:00Z",
      startedAt: "2026-01-02T00:00:01Z",
      finishedAt: "2026-01-02T00:00:05Z",
      cancelRequestedAt: null,
      startingCash: 1000,
      reasonCode: "paper_engine_completed",
      errorMessage: null,
    },
    datasetContext: {},
    gateContext: {},
    auditEvents: [
      {
        auditEventId: "audit-1",
        eventAt: "2026-01-02T00:00:05Z",
        actor: "local-worker",
        action: "paper_session_completed",
        targetType: "paper_session",
        targetId: "paper-session-1",
        oldState: "running",
        newState: "completed",
        reasonCode: "paper_engine_completed",
        correlationId: null,
        requestId: null,
        metadata: { source: "local" },
        createdAt: "2026-01-02T00:00:05Z",
        createdBy: "local-worker",
      },
    ],
    artifacts: {
      orders: [],
      fills: [],
      positions: [],
      portfolioSnapshots: [
        {
          snapshotId: "snapshot-1",
          sourceCandleId: "candle-1",
          snapshotAt: "2026-01-02T00:00:04Z",
          cashBalance: 949.875,
          equity: 1005.5,
          realizedPnl: 0,
          unrealizedPnl: 5.5,
          feesPaid: 0,
          drawdownPct: 0,
          exposureNotional: 55.625,
          metadata: {},
        },
      ],
      limits: {
        orders: 100,
        fills: 100,
        positions: 20,
        portfolioSnapshots: 100,
        auditEvents: 20,
      },
    },
    safetyStatus: "read_only_paper_session_detail",
    ...overrides,
  }
}

function createRunResult(overrides: Partial<TradeLabPaperSessionRunLocalResult> = {}): TradeLabPaperSessionRunLocalResult {
  return {
    status: "completed",
    reasonCode: "paper_engine_completed",
    sessionId: "paper-session-1",
    candlesProcessed: 3,
    ordersCreated: 1,
    fillsCreated: 1,
    snapshotsCreated: 3,
    safetyStatus: "local_dev_paper_engine_tick",
    details: { workerId: "strategy-lab-local-paper-run" },
    ...overrides,
  }
}

function createCancelResult(
  overrides: Partial<TradeLabPaperSessionCancelLocalResult> = {},
): TradeLabPaperSessionCancelLocalResult {
  return {
    status: "cancelled",
    reasonCode: "paper_local_cancelled",
    sessionId: "paper-session-1",
    previousStatus: "queued",
    currentStatus: "cancelled",
    cancelRequestedAt: "2026-01-02T00:00:03Z",
    safetyStatus: "local_dev_paper_cancel",
    details: { actor: "strategy-lab-local-paper-cancel" },
    ...overrides,
  }
}

function createRetryResult(
  overrides: Partial<TradeLabPaperSessionRetryLocalResult> = {},
): TradeLabPaperSessionRetryLocalResult {
  return {
    status: "queued",
    reasonCode: "paper_local_retry_queued",
    safetyStatus: "local_dev_paper_retry",
    sourceSessionId: "paper-session-1",
    retrySessionId: "paper-session-retry-1",
    sourceStatus: "cancelled",
    retryStatus: "queued",
    idempotencyKey: "strategy-lab-retry:paper-session-1:1",
    details: { actor: "strategy-lab-local-paper-retry" },
    ...overrides,
  }
}

function createResumeReadiness(
  overrides: Partial<TradeLabPaperSessionResumeReadiness> = {},
): TradeLabPaperSessionResumeReadiness {
  return {
    sessionId: "paper-session-1",
    status: "cancelled",
    reasonCode: "paper_local_resume_readiness_ready",
    allowed: true,
    safetyStatus: "read_only_paper_resume_readiness",
    checkpoint: null,
    checkpointSource: "persisted",
    artifactIdentityStatus: "ready",
    resumeMode: "same_session",
    attemptNo: 1,
    blockingReasons: [],
    details: {},
    ...overrides,
  }
}

function createResumeResult(
  overrides: Partial<TradeLabPaperSessionResumeLocalResult> = {},
): TradeLabPaperSessionResumeLocalResult {
  return {
    status: "queued",
    reasonCode: "paper_local_resume_queued",
    safetyStatus: "local_dev_paper_resume",
    sourceSessionId: "paper-session-1",
    resumeSessionId: "paper-session-1",
    sourceStatus: "cancelled",
    resumeStatus: "queued",
    idempotencyKey: "strategy-lab-resume:paper-session-1:1",
    resumeCursor: {
      lastProcessedCandleId: "candle-1",
      nextCandleOpenTime: "2026-01-01T01:00:00Z",
      attemptNo: 1,
    },
    details: { actor: "strategy-lab-local-paper-resume" },
    ...overrides,
  }
}

function createObservabilityItem(
  overrides: Partial<TradeLabPaperSessionObservability["items"][number]> = {},
): TradeLabPaperSessionObservability["items"][number] {
  return {
    sessionId: "paper-session-1",
    status: "completed",
    reasonCode: "paper_engine_completed",
    safetyStatus: "read_only_paper_session_observability",
    strategyId: "strategy-1",
    strategyVersionId: "version-1",
    datasetKey: "binance:BTCUSDT:1h",
    exchange: "binance",
    symbol: "BTCUSDT",
    timeframe: "1h",
    startAt: "2026-01-01T00:00:00Z",
    endAt: "2026-01-02T00:00:00Z",
    createdAt: "2026-01-01T00:00:01Z",
    startedAt: "2026-01-01T00:00:02Z",
    finishedAt: "2026-01-01T00:00:05Z",
    errorMessage: null,
    artifactCounts: { orders: 2, fills: 1, positions: 1, portfolioSnapshots: 3, auditEvents: 4 },
    latestAudit: {
      auditEventId: "audit-1",
      eventAt: "2026-01-01T00:00:05Z",
      action: "paper_session_completed",
      reasonCode: "paper_engine_completed",
      newState: "completed",
      actor: "local-worker",
      metadata: {},
    },
    gateSummary: { failedGateCount: 0, failedGateReasons: [], blockedReasonCode: null },
    ...overrides,
  }
}

function createObservability(
  overrides: Partial<TradeLabPaperSessionObservability> = {},
): TradeLabPaperSessionObservability {
  return {
    safetyStatus: "read_only_paper_session_observability",
    hasMore: false,
    items: [createObservabilityItem()],
    ...overrides,
  }
}

describe("PaperSessionPanel", () => {
  it("shows setup required state and keeps start disabled", () => {
    render(<PaperSessionPanel setupReason={createSetupReason()} onRefresh={vi.fn()} />)

    expect(screen.getByText("Paper session")).toBeTruthy()
    expect(screen.getByText("Setup required")).toBeTruthy()
    expect(screen.getByText("Save a paper draft before previewing paper session readiness.")).toBeTruthy()
    expect(screen.getByText("Local/dev simulated paper runtime only. No exchange, testnet, or live route is contacted.")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Start paper session" })).toHaveProperty("disabled", true)
    expect(screen.getByRole("button", { name: "Refresh paper session readiness" })).toHaveProperty("disabled", true)
    expect(screen.getByText("No paper session has been started in this UI session.")).toBeTruthy()
    expect(screen.getByText("No audit evidence is available for this UI session.")).toBeTruthy()
  })

  it("shows loading state and disables refresh", () => {
    render(<PaperSessionPanel isLoading onRefresh={vi.fn()} />)

    expect(screen.getByText("Checking")).toBeTruthy()
    expect(screen.getByText("Checking paper session readiness...")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Refresh paper session readiness" })).toHaveProperty("disabled", true)
    expect(screen.getByRole("button", { name: "Start paper session" })).toHaveProperty("disabled", true)
  })

  it("shows ready preview and enables start when allowed", () => {
    const onRefresh = vi.fn()
    const onStartPaperSession = vi.fn()
    render(
      <PaperSessionPanel
        preview={createPreview()}
        canStart
        onRefresh={onRefresh}
        onStartPaperSession={onStartPaperSession}
      />,
    )

    expect(screen.getByText("Ready")).toBeTruthy()
    expect(screen.getByText("paper_preview_allowed")).toBeTruthy()
    expect(screen.getByText("binance:BTCUSDT:1h")).toBeTruthy()
    expect(screen.getByText("preview_only")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Start paper session" })).toHaveProperty("disabled", false)

    fireEvent.click(screen.getByRole("button", { name: "Refresh paper session readiness" }))
    fireEvent.click(screen.getByRole("button", { name: "Start paper session" }))
    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(onStartPaperSession).toHaveBeenCalledTimes(1)
  })

  it("shows blocked preview failed gates", () => {
    render(
      <PaperSessionPanel
        preview={createPreview({
          previewStatus: "blocked",
          allowed: false,
          reasonCode: "paper_dataset_not_ready",
          failedGates: [
            {
              gate: "dataset",
              reasonCode: "paper_dataset_not_ready",
              message: "Dataset preflight is blocked.",
              data: { outcome: "blocked" },
            },
          ],
        })}
        onRefresh={vi.fn()}
      />,
    )

    expect(screen.getByText("Blocked")).toBeTruthy()
    expect(screen.getAllByText("paper_dataset_not_ready").length).toBeGreaterThan(0)
    expect(screen.getByText("dataset")).toBeTruthy()
    expect(screen.getByText("Dataset preflight is blocked.")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Start paper session" })).toHaveProperty("disabled", true)
  })

  it("shows inline error and never renders Run paper", () => {
    render(<PaperSessionPanel errorMessage="Paper preview failed. (paper_dataset_not_ready)" onRefresh={vi.fn()} />)

    expect(screen.getByText("Error")).toBeTruthy()
    expect(screen.getByText("Paper preview failed. (paper_dataset_not_ready)")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Start paper session" })).toHaveProperty("disabled", true)
    expect(screen.queryByRole("button", { name: /run paper/i })).toBeNull()
  })

  it("loads paper session detail from inline lookup controls", () => {
    const onInputChange = vi.fn()
    const onLoadDetail = vi.fn()

    render(
      <PaperSessionPanel
        paperSessionDetailInput="paper-session-1"
        paperSessionDetail={createDetail()}
        onPaperSessionDetailInputChange={onInputChange}
        onLoadPaperSessionDetail={onLoadDetail}
      />,
    )

    expect(screen.getByText("Runtime detail lookup")).toBeTruthy()
    expect(screen.getByLabelText("Paper session ID")).toHaveProperty("value", "paper-session-1")
    expect(screen.getByText("paper-session-1")).toBeTruthy()
    expect(screen.getByText("completed")).toBeTruthy()
    expect(screen.getByText("read_only_paper_session_detail")).toBeTruthy()
    expect(screen.getByText("1,005.5")).toBeTruthy()
    expect(screen.getByText("paper_session_completed")).toBeTruthy()

    fireEvent.change(screen.getByLabelText("Paper session ID"), { target: { value: "paper-session-2" } })
    fireEvent.click(screen.getByRole("button", { name: "Load paper session detail" }))

    expect(onInputChange).toHaveBeenCalledWith("paper-session-2")
    expect(onLoadDetail).toHaveBeenCalledTimes(1)
  })

  it("shows validation and loading states for detail lookup", () => {
    render(
      <PaperSessionPanel
        paperSessionDetailError="Paste a paper session ID to inspect runtime artifacts."
        isPaperSessionDetailLoading
      />,
    )

    expect(screen.getByText("Paste a paper session ID to inspect runtime artifacts.")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Load paper session detail" })).toHaveProperty("disabled", true)
  })

  it("shows recent paper sessions and wires row actions", () => {
    const onRefreshRecent = vi.fn()
    const onLoadRecent = vi.fn()

    render(
      <PaperSessionPanel
        paperSessionObservability={createObservability()}
        onRefreshPaperSessions={onRefreshRecent}
        onLoadPaperSessionDetailFromSummary={onLoadRecent}
      />,
    )

    expect(screen.getByText("Recent paper sessions")).toBeTruthy()
    expect(screen.getByText("paper-session-1")).toBeTruthy()
    expect(screen.getByText("orders 2 / fills 1 / snapshots 3")).toBeTruthy()
    expect(screen.getByText(/paper_session_completed/)).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: "Refresh recent paper sessions" }))
    fireEvent.click(screen.getByRole("button", { name: "Load detail for paper session paper-session-1" }))

    expect(onRefreshRecent).toHaveBeenCalledTimes(1)
    expect(onLoadRecent).toHaveBeenCalledWith("paper-session-1")
    expect(screen.queryByRole("button", { name: /run paper/i })).toBeNull()
  })

  it("shows failed recent paper session evidence before detail load", () => {
    render(
      <PaperSessionPanel
        paperSessionObservability={createObservability({
          items: [
            createObservabilityItem({
              sessionId: "paper-session-failed-with-a-very-long-id-1234567890",
              status: "failed",
              reasonCode: null,
              errorMessage: "Strategy subprocess exited with code 1.",
              artifactCounts: { orders: 1, fills: 0, positions: 0, portfolioSnapshots: 2, auditEvents: 3 },
              latestAudit: {
                auditEventId: "audit-failed-1",
                eventAt: "2026-01-01T00:00:05Z",
                action: "paper_session_failed",
                reasonCode: "paper_strategy_runtime_failed",
                newState: "failed",
                actor: "local-worker",
                metadata: {},
              },
              gateSummary: { failedGateCount: 0, failedGateReasons: [], blockedReasonCode: null },
            }),
          ],
        })}
        onLoadPaperSessionDetailFromSummary={vi.fn()}
      />,
    )

    expect(screen.getByText("failed")).toBeTruthy()
    expect(screen.getByText("primary reason")).toBeTruthy()
    expect(screen.getByText("paper_strategy_runtime_failed")).toBeTruthy()
    expect(screen.getByText("latest audit")).toBeTruthy()
    expect(screen.getAllByText(/paper_session_failed/).length).toBeGreaterThan(0)
    expect(screen.getByText("Strategy subprocess exited with code 1.")).toBeTruthy()
    expect(screen.getByRole("button", { name: /Load detail for paper session paper-session-failed/ })).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Retry paper|Run paper|Run live/i })).toBeNull()
  })

  it("shows blocked recent paper session gate evidence before detail load", () => {
    render(
      <PaperSessionPanel
        paperSessionObservability={createObservability({
          items: [
            createObservabilityItem({
              sessionId: "paper-session-blocked-1",
              status: "blocked",
              reasonCode: null,
              latestAudit: null,
              gateSummary: {
                failedGateCount: 2,
                failedGateReasons: ["paper_dataset_not_ready", "paper_symbol_not_allowed"],
                blockedReasonCode: "paper_session_gate_failed",
              },
            }),
          ],
        })}
      />,
    )

    expect(screen.getByText("blocked")).toBeTruthy()
    expect(screen.getByText("paper_session_gate_failed")).toBeTruthy()
    expect(screen.getByText("failed gates")).toBeTruthy()
    expect(screen.getByText("2")).toBeTruthy()
    expect(screen.getByText("paper_dataset_not_ready")).toBeTruthy()
    expect(screen.getByText("paper_symbol_not_allowed")).toBeTruthy()
    expect(screen.getByText("latest audit: none / none")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Retry paper|Run paper|Run live/i })).toBeNull()
  })

  it("uses none fallback when recent row has no reason evidence", () => {
    render(
      <PaperSessionPanel
        paperSessionObservability={createObservability({
          items: [
            createObservabilityItem({
              status: "unknown",
              reasonCode: null,
              latestAudit: null,
              gateSummary: { failedGateCount: 0, failedGateReasons: [], blockedReasonCode: null },
            }),
          ],
        })}
      />,
    )

    expect(screen.getByText("unknown")).toBeTruthy()
    expect(screen.getByText("primary reason")).toBeTruthy()
    expect(screen.getByText("none")).toBeTruthy()
  })

  it("shows recent paper sessions empty and error states", () => {
    render(
      <PaperSessionPanel
        paperSessionObservability={{ safetyStatus: "read_only_paper_session_observability", items: [], hasMore: false }}
        paperSessionObservabilityError="Unable to load recent paper sessions."
      />,
    )

    expect(screen.getByText("No paper sessions for current strategy and dataset.")).toBeTruthy()
    expect(screen.getByText("Unable to load recent paper sessions.")).toBeTruthy()
  })

  it("shows no-artifact detail state and keeps locked controls absent", () => {
    render(
      <PaperSessionPanel
        paperSessionDetail={createDetail({
          auditEvents: [],
          artifacts: {
            orders: [],
            fills: [],
            positions: [],
            portfolioSnapshots: [],
            limits: {
              orders: 100,
              fills: 100,
              positions: 20,
              portfolioSnapshots: 100,
              auditEvents: 20,
            },
          },
        })}
      />,
    )

    expect(screen.getByText("No portfolio snapshot is available for this paper session.")).toBeTruthy()
    expect(screen.getByText("No audit evidence is available for this paper session.")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Start paper session" })).toHaveProperty("disabled", true)
    expect(screen.queryByRole("button", { name: /run paper/i })).toBeNull()
  })

  it("keeps Run local disabled until a queued detail is loaded", () => {
    render(
      <PaperSessionPanel
        runLocalDisabledReason="Load a queued paper session before running locally."
        onRunLocalPaperSession={vi.fn()}
      />,
    )

    expect(screen.getByRole("button", { name: "Run local paper session" })).toHaveProperty("disabled", true)
    expect(screen.getByText("Load a queued paper session before running locally.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /run paper/i })).toBeNull()
  })

  it("shows failed loaded session cannot-run evidence", () => {
    render(
      <PaperSessionPanel
        paperSessionDetail={createDetail({
          session: {
            ...createDetail().session,
            status: "failed",
            reasonCode: "paper_strategy_runtime_failed",
            errorMessage: "Strategy subprocess exited with code 1.",
          },
          auditEvents: [
            {
              ...createDetail().auditEvents[0],
              auditEventId: "audit-failed-1",
              action: "paper_session_failed",
              newState: "failed",
              reasonCode: "paper_strategy_runtime_failed",
            },
          ],
        })}
        runLocalDisabledReason="This paper session is failed and cannot run locally. Reason: paper_strategy_runtime_failed."
        onRunLocalPaperSession={vi.fn()}
      />,
    )

    expect(screen.getByRole("button", { name: "Run local paper session" })).toHaveProperty("disabled", true)
    expect(screen.getByText("Cannot run local")).toBeTruthy()
    expect(screen.getAllByText("paper_strategy_runtime_failed").length).toBeGreaterThan(0)
    expect(screen.getByText("Strategy subprocess exited with code 1.")).toBeTruthy()
    expect(screen.getAllByText(/paper_session_failed/).length).toBeGreaterThan(0)
    expect(screen.queryByRole("button", { name: /Retry paper|Run paper/i })).toBeNull()
  })

  it("shows blocked loaded session cannot-run gate evidence", () => {
    render(
      <PaperSessionPanel
        paperSessionDetail={createDetail({
          session: {
            ...createDetail().session,
            status: "blocked",
            reasonCode: "paper_session_gate_failed",
            errorMessage: null,
          },
          gateContext: {
            failedGates: [
              { gate: "dataset", reasonCode: "paper_dataset_not_ready", message: "Dataset preflight is blocked." },
            ],
          },
          auditEvents: [],
        })}
        runLocalDisabledReason="This paper session is blocked and cannot run locally. Reason: paper_session_gate_failed."
        onRunLocalPaperSession={vi.fn()}
      />,
    )

    expect(screen.getByText("Cannot run local")).toBeTruthy()
    expect(screen.getAllByText("paper_session_gate_failed").length).toBeGreaterThan(0)
    expect(screen.getByText("paper_dataset_not_ready")).toBeTruthy()
    expect(screen.getByText("Dataset preflight is blocked.")).toBeTruthy()
  })

  it("enables Run local for queued detail and calls handler once", () => {
    const onRunLocal = vi.fn()
    render(
      <PaperSessionPanel
        paperSessionDetail={createDetail({
          session: {
            ...createDetail().session,
            status: "queued",
            reasonCode: "paper_session_queued",
            finishedAt: null,
          },
          artifacts: {
            orders: [],
            fills: [],
            positions: [],
            portfolioSnapshots: [],
            limits: { orders: 100, fills: 100, positions: 20, portfolioSnapshots: 100, auditEvents: 20 },
          },
        })}
        canRunLocal
        onRunLocalPaperSession={onRunLocal}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Run local paper session" }))

    expect(onRunLocal).toHaveBeenCalledTimes(1)
    expect(screen.getByText("Run local")).toBeTruthy()
  })

  it("enables Cancel local for queued detail and calls handler once", () => {
    const onCancelLocalPaperSession = vi.fn()
    const detail = createDetail()
    detail.session.status = "queued"
    detail.session.sessionId = "paper-session-1"
    render(
      <PaperSessionPanel
        paperSessionDetail={detail}
        canCancelLocal
        onCancelLocalPaperSession={onCancelLocalPaperSession}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Cancel local paper session" }))

    expect(onCancelLocalPaperSession).toHaveBeenCalledTimes(1)
    expect(screen.getByText("Cancel local")).toBeTruthy()
  })

  it("shows disabled reason for completed detail and hides forbidden resume scheduler controls", () => {
    render(
      <PaperSessionPanel
        paperSessionDetail={createDetail()}
        canCancelLocal={false}
        cancelLocalDisabledReason="This paper session is completed and cannot be cancelled locally."
      />,
    )

    expect(screen.getByRole("button", { name: "Cancel local paper session" })).toHaveProperty("disabled", true)
    expect(screen.getByText("This paper session is completed and cannot be cancelled locally.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /scheduler|run paper|retry paper/i })).toBeNull()
  })

  it("enables Retry local for terminal detail and calls handler once", () => {
    const onRetryLocalPaperSession = vi.fn()
    render(
      <PaperSessionPanel
        paperSessionDetail={createDetail({
          session: { ...createDetail().session, status: "cancelled", reasonCode: "paper_local_cancelled" },
        })}
        canRetryLocal
        onRetryLocalPaperSession={onRetryLocalPaperSession}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Retry local paper session" }))

    expect(onRetryLocalPaperSession).toHaveBeenCalledTimes(1)
    expect(screen.getByText("Retry from terminal session")).toBeTruthy()
  })

  it("shows retry disabled reason and latest retry result inline", () => {
    render(
      <PaperSessionPanel
        canRetryLocal={false}
        retryLocalDisabledReason="Load a failed, blocked, or cancelled paper session before retrying locally."
        retryLocalResult={createRetryResult()}
        retryLocalError="Local paper retry failed. (paper_local_retry_gate_failed)"
      />,
    )

    expect(screen.getByRole("button", { name: "Retry local paper session" })).toHaveProperty("disabled", true)
    expect(screen.getByText("Load a failed, blocked, or cancelled paper session before retrying locally.")).toBeTruthy()
    expect(screen.getByText("Latest local retry")).toBeTruthy()
    expect(screen.getByText("paper_local_retry_queued")).toBeTruthy()
    expect(screen.getByText("Source: paper-session-1")).toBeTruthy()
    expect(screen.getByText("Retry: paper-session-retry-1")).toBeTruthy()
    expect(screen.getByText(/Local paper retry failed/)).toBeTruthy()
  })

  it("enables Resume local for cancelled detail and calls handler once", () => {
    const onResumeLocalPaperSession = vi.fn()
    render(
      <PaperSessionPanel
        paperSessionDetail={createDetail({
          session: { ...createDetail().session, status: "cancelled", reasonCode: "paper_local_cancelled" },
        })}
        paperSessionResumeReadiness={createResumeReadiness()}
        canResumeLocal
        onResumeLocalPaperSession={onResumeLocalPaperSession}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Resume local paper session" }))

    expect(onResumeLocalPaperSession).toHaveBeenCalledTimes(1)
    expect(screen.getByText("Local paper session resume")).toBeTruthy()
    expect(screen.getAllByText("local/dev only").length).toBeGreaterThan(0)
  })

  it("shows resume disabled reason, error, and latest result evidence", () => {
    render(
      <PaperSessionPanel
        canResumeLocal={false}
        resumeLocalDisabledReason="paper_local_resume_checkpoint_missing"
        resumeLocalResult={createResumeResult()}
        resumeLocalError="Local paper resume failed. (paper_local_resume_checkpoint_missing)"
      />,
    )

    expect(screen.getByRole("button", { name: "Resume local paper session" })).toHaveProperty("disabled", true)
    expect(screen.getByText("paper_local_resume_checkpoint_missing")).toBeTruthy()
    expect(screen.getByText("Latest local resume")).toBeTruthy()
    expect(screen.getByText("paper_local_resume_queued")).toBeTruthy()
    expect(screen.getByText("Source: paper-session-1")).toBeTruthy()
    expect(screen.getByText("Resume: paper-session-1")).toBeTruthy()
    expect(screen.getByText("Next candle: 2026-01-01T01:00:00Z")).toBeTruthy()
    expect(screen.getByText("Attempt: 1")).toBeTruthy()
    expect(screen.getByText(/Local paper resume failed/)).toBeTruthy()
  })

  it("shows latest local cancel result and cancel error inline", () => {
    render(
      <PaperSessionPanel
        cancelLocalResult={createCancelResult()}
        cancelLocalError="Local paper cancel failed. (paper_local_cancel_environment_not_allowed)"
      />,
    )

    expect(screen.getByText("Latest local cancel")).toBeTruthy()
    expect(screen.getByText("paper_local_cancelled")).toBeTruthy()
    expect(screen.getByText("Previous: queued")).toBeTruthy()
    expect(screen.getByText("Current: cancelled")).toBeTruthy()
    expect(screen.getByText(/Local paper cancel failed/)).toBeTruthy()
  })

  it("explains local/dev boundary near the run action", () => {
    render(
      <PaperSessionPanel
        paperSessionDetail={createDetail({
          session: { ...createDetail().session, status: "queued", reasonCode: "paper_session_queued", finishedAt: null },
        })}
        canRunLocal
        onRunLocalPaperSession={vi.fn()}
      />,
    )

    expect(screen.getByText("Local/dev simulated paper runtime only. No exchange, testnet, or live route is contacted.")).toBeTruthy()
  })

  it("shows terminal sessions cannot run locally again", () => {
    render(
      <PaperSessionPanel
        paperSessionDetail={createDetail()}
        runLocalDisabledReason="This paper session is completed and cannot be run again."
        onRunLocalPaperSession={vi.fn()}
      />,
    )

    expect(screen.getByRole("button", { name: "Run local paper session" })).toHaveProperty("disabled", true)
    expect(screen.getByText("This paper session is completed and cannot be run again.")).toBeTruthy()
    expect(screen.getByText("Load or start a queued session to run the local/dev engine.")).toBeTruthy()
  })

  it("shows latest local run result and run error inline", () => {
    render(
      <PaperSessionPanel
        runLocalResult={createRunResult()}
        runLocalError="Local paper run did not start because this environment is not allowed. (paper_local_run_environment_not_allowed)"
      />,
    )

    expect(screen.getByText("Latest local run")).toBeTruthy()
    expect(screen.getByText("paper_engine_completed")).toBeTruthy()
    expect(screen.getByText("Candles: 3")).toBeTruthy()
    expect(screen.getByText(/Local paper run did not start/)).toBeTruthy()
  })

  it("shows read-only kill switch status and disabled reason", () => {
    render(
      <PaperSessionPanel
        paperKillSwitchStatus={{
          enabled: true,
          reasonCode: "paper_kill_switch_enabled",
          safetyStatus: "read_only_paper_kill_switch_status",
          source: "config",
          updatedAt: null,
          updatedBy: null,
          details: { environment: "local", localDevOnly: true },
        }}
        paperKillSwitchStatusError={null}
        isPaperKillSwitchStatusLoading={false}
        runLocalDisabledReason="Paper kill switch is enabled. Reason: paper_kill_switch_enabled."
        startDisabledReason="Paper kill switch is enabled. Reason: paper_kill_switch_enabled."
        onRefresh={vi.fn()}
      />,
    )

    expect(screen.getByText("Paper kill switch")).toBeTruthy()
    expect(screen.getByText("enabled")).toBeTruthy()
    expect(screen.getByText("read_only_paper_kill_switch_status")).toBeTruthy()
    expect(screen.getByText("paper_kill_switch_enabled")).toBeTruthy()
    expect(screen.getAllByText("Paper kill switch is enabled. Reason: paper_kill_switch_enabled.").length).toBeGreaterThan(0)
    expect(screen.queryByRole("button", { name: /Run paper/i })).toBeNull()
  })
})
