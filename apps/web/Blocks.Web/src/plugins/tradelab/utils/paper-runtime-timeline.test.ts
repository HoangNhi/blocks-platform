import { describe, expect, it } from "vitest"

import { buildPaperRuntimeTimeline } from "./paper-runtime-timeline"
import type { TradeLabPaperSessionDetail } from "../types"

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
          submittedAt: "2026-01-02T00:00:02Z",
          finalizedAt: "2026-01-02T00:00:03Z",
          reasonCode: "paper_order_accepted",
          metadata: {},
        },
      ],
      fills: [
        {
          fillId: "fill-1",
          paperOrderId: "order-1",
          sourceCandleId: "candle-1",
          fillTime: "2026-01-02T00:00:04Z",
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
          snapshotId: "snapshot-first",
          sourceCandleId: "candle-1",
          snapshotAt: "2026-01-02T00:00:01Z",
          cashBalance: 1000,
          equity: 1000,
          realizedPnl: 0,
          unrealizedPnl: 0,
          feesPaid: 0,
          drawdownPct: 0,
          exposureNotional: 0,
          metadata: {},
        },
        {
          snapshotId: "snapshot-drawdown",
          sourceCandleId: "candle-2",
          snapshotAt: "2026-01-02T00:00:03Z",
          cashBalance: 900,
          equity: 980,
          realizedPnl: 0,
          unrealizedPnl: -20,
          feesPaid: 0,
          drawdownPct: 2,
          exposureNotional: 100,
          metadata: {},
        },
        {
          snapshotId: "snapshot-last",
          sourceCandleId: "candle-3",
          snapshotAt: "2026-01-02T00:00:06Z",
          cashBalance: 1100,
          equity: 1100,
          realizedPnl: 100,
          unrealizedPnl: 0,
          feesPaid: 0,
          drawdownPct: 0.5,
          exposureNotional: 0,
          metadata: {},
        },
      ],
      limits: { orders: 100, fills: 100, positions: 20, portfolioSnapshots: 100, auditEvents: 20 },
    },
    safetyStatus: "read_only_paper_session_detail",
    ...overrides,
  }
}

describe("buildPaperRuntimeTimeline", () => {
  it("orders session, audit, order, fill, and portfolio events by time", () => {
    const events = buildPaperRuntimeTimeline(createDetail())

    expect(events.map((event) => event.primaryId)).toContain("paper-session-1")
    expect(events.map((event) => event.primaryId)).toContain("audit-1")
    expect(events.map((event) => event.primaryId)).toContain("order-1")
    expect(events.map((event) => event.primaryId)).toContain("fill-1")
    expect(events.map((event) => event.primaryId)).toContain("snapshot-first")
    expect(events.map((event) => event.primaryId)).toContain("snapshot-drawdown")
    expect(events.map((event) => event.primaryId)).toContain("snapshot-last")
    expect(events.map((event) => event.occurredAt)).toEqual([
      "2026-01-02T00:00:01Z",
      "2026-01-02T00:00:02Z",
      "2026-01-02T00:00:03Z",
      "2026-01-02T00:00:04Z",
      "2026-01-02T00:00:05Z",
      "2026-01-02T00:00:05Z",
      "2026-01-02T00:00:06Z",
    ])
  })

  it("keeps reason codes and linked ids for debug evidence", () => {
    const events = buildPaperRuntimeTimeline(createDetail())

    expect(events.find((event) => event.primaryId === "audit-1")).toMatchObject({
      kind: "audit",
      reasonCode: "paper_engine_completed",
      secondaryId: "paper-session-1",
    })
    expect(events.find((event) => event.primaryId === "order-1")).toMatchObject({
      kind: "order",
      reasonCode: "paper_order_accepted",
      status: "accepted",
    })
    expect(events.find((event) => event.primaryId === "fill-1")).toMatchObject({
      kind: "fill",
      secondaryId: "order-1",
    })
  })

  it("limits portfolio checkpoints to first max drawdown and last snapshots", () => {
    const portfolioEvents = buildPaperRuntimeTimeline(createDetail()).filter((event) => event.kind === "portfolio")

    expect(portfolioEvents.map((event) => event.primaryId)).toEqual([
      "snapshot-first",
      "snapshot-drawdown",
      "snapshot-last",
    ])
    expect(portfolioEvents.map((event) => event.title)).toEqual([
      "Portfolio checkpoint",
      "Max drawdown checkpoint",
      "Portfolio checkpoint",
    ])
  })

  it("deduplicates portfolio checkpoints when one snapshot is first max drawdown and last", () => {
    const detail = createDetail({
      artifacts: {
        ...createDetail().artifacts,
        portfolioSnapshots: [createDetail().artifacts.portfolioSnapshots[0]],
      },
    })

    const portfolioEvents = buildPaperRuntimeTimeline(detail).filter((event) => event.kind === "portfolio")

    expect(portfolioEvents).toHaveLength(1)
    expect(portfolioEvents[0].primaryId).toBe("snapshot-first")
  })

  it("keeps events with missing timestamps after timestamped events", () => {
    const detail = createDetail({
      artifacts: {
        ...createDetail().artifacts,
        orders: [
          {
            ...createDetail().artifacts.orders[0],
            orderId: "order-missing-time",
            submittedAt: null,
            finalizedAt: null,
          },
        ],
      },
    })

    const events = buildPaperRuntimeTimeline(detail)

    expect(events.at(-1)).toMatchObject({
      kind: "order",
      occurredAt: null,
      primaryId: "order-missing-time",
    })
  })

  it("returns an empty list when no detail is loaded", () => {
    expect(buildPaperRuntimeTimeline(null)).toEqual([])
  })

  it("returns an empty list when detail has no timeline evidence", () => {
    const detail = createDetail({
      session: {
        ...createDetail().session,
        startedAt: null,
        finishedAt: null,
        cancelRequestedAt: null,
        reasonCode: null,
      },
      auditEvents: [],
      artifacts: {
        orders: [],
        fills: [],
        positions: [],
        portfolioSnapshots: [],
        limits: { orders: 100, fills: 100, positions: 20, portfolioSnapshots: 100, auditEvents: 20 },
      },
    })

    expect(buildPaperRuntimeTimeline(detail)).toEqual([])
  })
})
