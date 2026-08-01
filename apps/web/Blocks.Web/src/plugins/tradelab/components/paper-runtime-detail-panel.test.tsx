// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { PaperRuntimeDetailPanel } from "./paper-runtime-detail-panel"
import type { TradeLabPaperSessionDetail, TradeLabPaperSessionRunLocalResult } from "../types"

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
        metadata: { workerId: "strategy-lab-local-paper-run" },
        createdAt: "2026-01-02T00:00:05Z",
        createdBy: "local-worker",
      },
    ],
    artifacts: {
      orders: [
        {
          orderId: "order-1",
          side: "buy",
          orderType: "market",
          status: "accepted",
          quantity: 1,
          requestedPrice: null,
          requestedNotional: 100,
          submittedAt: null,
          finalizedAt: null,
          reasonCode: null,
          metadata: {},
        },
      ],
      fills: [
        {
          fillId: "fill-1",
          paperOrderId: "order-1",
          sourceCandleId: "candle-1",
          fillTime: "2026-01-02T00:00:02Z",
          side: "buy",
          price: 100,
          quantity: 1,
          notional: 100,
          feeAmount: 0,
          feeAsset: null,
          slippageAmount: 0,
          metadata: {},
        },
      ],
      positions: [],
      portfolioSnapshots: [
        {
          snapshotId: "snapshot-1",
          sourceCandleId: "candle-1",
          snapshotAt: "2026-01-02T00:00:04Z",
          cashBalance: 900,
          equity: 1005,
          realizedPnl: 0,
          unrealizedPnl: 5,
          feesPaid: 0,
          drawdownPct: 1.2,
          exposureNotional: 100,
          metadata: {},
        },
      ],
      limits: { orders: 100, fills: 100, positions: 20, portfolioSnapshots: 100, auditEvents: 20 },
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
    details: {},
    ...overrides,
  }
}

describe("PaperRuntimeDetailPanel", () => {
  it("renders queued detail empty state", () => {
    render(
      <PaperRuntimeDetailPanel
        detail={createDetail({
          session: { ...createDetail().session, status: "queued", reasonCode: "paper_session_queued", finishedAt: null },
          artifacts: {
            orders: [],
            fills: [],
            positions: [],
            portfolioSnapshots: [],
            limits: { orders: 100, fills: 100, positions: 20, portfolioSnapshots: 100, auditEvents: 20 },
          },
        })}
        runResult={null}
        errorMessage={null}
      />,
    )

    expect(screen.getByRole("heading", { name: "Paper Runtime Detail" })).toBeTruthy()
    expect(screen.getAllByText("queued").length).toBeGreaterThan(0)
    expect(screen.getByText("Session is queued and has not run locally yet.")).toBeTruthy()
  })

  it("renders completed artifacts and run counts", () => {
    render(<PaperRuntimeDetailPanel detail={createDetail()} runResult={createRunResult()} errorMessage={null} />)

    expect(screen.getAllByText("paper-session-1").length).toBeGreaterThan(0)
    expect(screen.getAllByText("paper_engine_completed").length).toBeGreaterThan(0)
    expect(screen.getByText("Candles processed")).toBeTruthy()
    expect(screen.getAllByText("3").length).toBeGreaterThan(0)
    expect(screen.getByText("Latest portfolio snapshot")).toBeTruthy()
    expect(screen.getAllByText("1,005").length).toBeGreaterThan(0)
    expect(screen.getAllByText("order-1").length).toBeGreaterThan(0)
    expect(screen.getAllByText("fill-1").length).toBeGreaterThan(0)
    expect(screen.getAllByText("paper_session_completed").length).toBeGreaterThan(0)
  })

  it("renders lifecycle evidence for queued sessions", () => {
    render(
      <PaperRuntimeDetailPanel
        detail={createDetail({
          session: {
            ...createDetail().session,
            status: "queued",
            reasonCode: "paper_session_queued",
            startedAt: null,
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
        runResult={null}
        errorMessage={null}
      />,
    )

    expect(screen.getByText("Lifecycle")).toBeTruthy()
    expect(screen.getAllByText("Queued").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Awaiting local/dev run").length).toBeGreaterThan(0)
    expect(screen.getByText("No orders have been persisted for this paper session.")).toBeTruthy()
    expect(screen.getByText("No fills have been persisted for this paper session.")).toBeTruthy()
  })

  it("renders completed lifecycle and artifact limits", () => {
    render(<PaperRuntimeDetailPanel detail={createDetail()} runResult={createRunResult()} errorMessage={null} />)

    expect(screen.getByText("Lifecycle")).toBeTruthy()
    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Local/dev run finished").length).toBeGreaterThan(0)
    expect(screen.getByText("Artifact limits")).toBeTruthy()
    expect(screen.getByText("orders 100 / fills 100 / snapshots 100")).toBeTruthy()
  })

  it("renders completed closeout summaries for scanability", () => {
    render(<PaperRuntimeDetailPanel detail={createDetail()} runResult={createRunResult()} errorMessage={null} />)

    expect(screen.getByLabelText("Paper runtime closeout summary")).toBeTruthy()
    expect(screen.getByText("Session summary")).toBeTruthy()
    expect(screen.getByText("Runtime evidence")).toBeTruthy()
    expect(screen.getByText("Portfolio summary")).toBeTruthy()
    expect(screen.getByText("Latest audit")).toBeTruthy()
    expect(screen.getAllByText("Status").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Completed").length).toBeGreaterThan(0)
    expect(screen.getByText("Dataset")).toBeTruthy()
    expect(screen.getByText("binance:BTCUSDT:1h")).toBeTruthy()
    expect(screen.getByText("Strategy version")).toBeTruthy()
    expect(screen.getAllByText("version-1").length).toBeGreaterThan(0)
    expect(screen.getByText("Runtime artifacts persisted for completed session.")).toBeTruthy()
    expect(screen.getByText("Orders 1 / fills 1 / positions 0 / snapshots 1")).toBeTruthy()
    expect(screen.getByText("Latest equity")).toBeTruthy()
    expect(screen.getAllByText("1,005").length).toBeGreaterThan(0)
    expect(screen.getAllByText("paper_session_completed").length).toBeGreaterThan(0)
  })

  it("renders failed detail non-happy-path evidence", () => {
    render(
      <PaperRuntimeDetailPanel
        detail={createDetail({
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
          artifacts: {
            orders: [],
            fills: [],
            positions: [],
            portfolioSnapshots: [],
            limits: { orders: 100, fills: 100, positions: 20, portfolioSnapshots: 100, auditEvents: 20 },
          },
        })}
        runResult={null}
        errorMessage={null}
      />,
    )

    expect(screen.getByText("Non-happy-path evidence")).toBeTruthy()
    expect(screen.getAllByText("failed").length).toBeGreaterThan(0)
    expect(screen.getAllByText("paper_strategy_runtime_failed").length).toBeGreaterThan(0)
    expect(screen.getByText("Strategy subprocess exited with code 1.")).toBeTruthy()
    expect(screen.getAllByText("No runtime artifacts have been persisted yet.").length).toBeGreaterThan(0)
    expect(screen.getAllByText(/paper_session_failed/).length).toBeGreaterThan(0)
  })

  it("renders blocked detail gate evidence", () => {
    render(
      <PaperRuntimeDetailPanel
        detail={createDetail({
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
          artifacts: {
            orders: [],
            fills: [],
            positions: [],
            portfolioSnapshots: [],
            limits: { orders: 100, fills: 100, positions: 20, portfolioSnapshots: 100, auditEvents: 20 },
          },
        })}
        runResult={null}
        errorMessage={null}
      />,
    )

    expect(screen.getByText("Non-happy-path evidence")).toBeTruthy()
    expect(screen.getAllByText("paper_session_gate_failed").length).toBeGreaterThan(0)
    expect(screen.getByText("Gate evidence")).toBeTruthy()
    expect(screen.getByText("dataset")).toBeTruthy()
    expect(screen.getByText("paper_dataset_not_ready")).toBeTruthy()
    expect(screen.getByText("Dataset preflight is blocked.")).toBeTruthy()
  })

  it("renders cannot-run closeout evidence without implying a local run happened", () => {
    render(
      <PaperRuntimeDetailPanel
        detail={createDetail({
          session: {
            ...createDetail().session,
            status: "cannot_run",
            reasonCode: "paper_session_not_queued",
            errorMessage: "Only queued sessions can run locally.",
          },
          gateContext: {
            failed_gates: [
              { gate: "session", reason_code: "paper_session_not_queued", message: "Loaded session is not queued." },
            ],
          },
          auditEvents: [],
          artifacts: {
            orders: [],
            fills: [],
            positions: [],
            portfolioSnapshots: [],
            limits: { orders: 100, fills: 100, positions: 20, portfolioSnapshots: 100, auditEvents: 20 },
          },
        })}
        runResult={null}
        errorMessage={null}
      />,
    )

    expect(screen.getAllByText("Cannot run").length).toBeGreaterThan(0)
    expect(screen.getAllByText("paper_session_not_queued").length).toBeGreaterThan(0)
    expect(screen.getByText("Only queued sessions can run locally.")).toBeTruthy()
    expect(screen.getAllByText("No local/dev run happened for this loaded paper session.").length).toBeGreaterThan(0)
    expect(screen.getAllByText("No runtime artifacts have been persisted yet.").length).toBeGreaterThan(0)
    expect(screen.getByText("Loaded session is not queued.")).toBeTruthy()
  })

  it("renders unknown non-happy-path detail with partial artifacts", () => {
    render(
      <PaperRuntimeDetailPanel
        detail={createDetail({
          session: {
            ...createDetail().session,
            status: "unknown",
            reasonCode: null,
            errorMessage: null,
          },
          auditEvents: [],
        })}
        runResult={null}
        errorMessage={null}
      />,
    )

    expect(screen.getByText("Non-happy-path evidence")).toBeTruthy()
    expect(screen.getAllByText("unknown").length).toBeGreaterThan(0)
    expect(screen.getAllByText("none").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Partial runtime artifacts are available for inspection.").length).toBeGreaterThan(0)
  })

  it("renders inline error while preserving run result", () => {
    render(
      <PaperRuntimeDetailPanel
        detail={null}
        runResult={createRunResult()}
        errorMessage="Paper session detail failed. (paper_detail_failed)"
      />,
    )

    expect(screen.getByText("Paper session detail failed. (paper_detail_failed)")).toBeTruthy()
    expect(screen.getAllByText("paper_engine_completed").length).toBeGreaterThan(0)
  })

  it("renders closeout guidance when no paper session is loaded", () => {
    render(<PaperRuntimeDetailPanel detail={null} runResult={null} errorMessage={null} />)

    expect(screen.getByLabelText("Paper runtime closeout summary")).toBeTruthy()
    expect(screen.getByText("Session summary")).toBeTruthy()
    expect(screen.getByText("No paper session loaded yet.")).toBeTruthy()
    expect(screen.getByText("Load a paper session from the Paper session panel to inspect runtime evidence.")).toBeTruthy()
    expect(screen.getByText("No runtime artifacts have been persisted yet.")).toBeTruthy()
    expect(screen.getByText("No portfolio snapshot has been persisted yet.")).toBeTruthy()
    expect(screen.getByText("No audit event is available yet.")).toBeTruthy()
  })

  it("renders runtime timeline evidence from detail artifacts", () => {
    render(<PaperRuntimeDetailPanel detail={createDetail()} runResult={createRunResult()} errorMessage={null} />)

    expect(screen.getByLabelText("Runtime timeline")).toBeTruthy()
    expect(screen.getByText("Runtime timeline")).toBeTruthy()
    expect(screen.getByText("Session completed")).toBeTruthy()
    expect(screen.getAllByText("paper_session_completed").length).toBeGreaterThan(0)
    expect(screen.getByText("Buy fill persisted")).toBeTruthy()
    expect(screen.getAllByText("fill-1").length).toBeGreaterThan(0)
    expect(screen.getAllByText("order-1").length).toBeGreaterThan(0)
    expect(screen.getByText("Portfolio checkpoint")).toBeTruthy()
    expect(screen.getAllByText("snapshot-1").length).toBeGreaterThan(0)
  })

  it("renders runtime timeline empty state when detail has no evidence", () => {
    render(
      <PaperRuntimeDetailPanel
        detail={createDetail({
          session: {
            ...createDetail().session,
            status: "queued",
            reasonCode: null,
            startedAt: null,
            finishedAt: null,
            cancelRequestedAt: null,
          },
          auditEvents: [],
          artifacts: {
            orders: [],
            fills: [],
            positions: [],
            portfolioSnapshots: [],
            limits: { orders: 100, fills: 100, positions: 20, portfolioSnapshots: 100, auditEvents: 20 },
          },
        })}
        runResult={null}
        errorMessage={null}
      />,
    )

    expect(screen.getByText("Runtime timeline")).toBeTruthy()
    expect(screen.getByText("No timeline evidence is available for this paper session.")).toBeTruthy()
  })

  it("renders missing-time timeline events with explicit fallback copy", () => {
    render(
      <PaperRuntimeDetailPanel
        detail={createDetail({
          artifacts: {
            ...createDetail().artifacts,
            orders: [
              {
                ...createDetail().artifacts.orders[0],
                orderId: "order-without-time",
                submittedAt: null,
                finalizedAt: null,
              },
            ],
          },
        })}
        runResult={null}
        errorMessage={null}
      />,
    )

    expect(screen.getAllByText("order-without-time").length).toBeGreaterThan(0)
    expect(screen.getByText("Time unavailable")).toBeTruthy()
  })
})
