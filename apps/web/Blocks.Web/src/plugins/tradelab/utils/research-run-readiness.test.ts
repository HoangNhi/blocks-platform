import { describe, expect, it } from "vitest"

import type { TradeLabRunHistoryEntry } from "../types"
import {
  buildResearchRangeGuidance,
  calculateOrderFeasibility,
  filterResearchRunHistory,
  type ResearchRiskLike,
  type ResearchRuntimeLike,
} from "./research-run-readiness"

const runtime: ResearchRuntimeLike = {
  exchange: "binance",
  symbol: "BTCUSDT",
  timeframe: "1h",
  startAt: "2024-01-01T00:00:00Z",
  endAt: "2024-02-01T00:00:00Z",
  initialEquity: 100,
  feeBps: 10,
  slippageBps: 5,
}

const risk: ResearchRiskLike = {
  maxOrderPercent: 10,
  maxPositionPercent: 100,
  maxDrawdownPercent: 25,
  minNotional: 10,
  stepSize: 0.001,
  tickSize: 0.01,
}

function run(id: string, overrides: Partial<TradeLabRunHistoryEntry> = {}): TradeLabRunHistoryEntry {
  return {
    id,
    botId: null,
    strategyId: "strategy-1",
    strategyVersionId: "version-1",
    runType: "backtest",
    status: "completed",
    pipelineStatus: "completed",
    exchange: "binance",
    symbol: "BTCUSDT",
    timeframe: "1h",
    startAt: "2024-01-01T00:00:00Z",
    endAt: "2024-02-01T00:00:00Z",
    startedAt: "2024-01-01T00:00:00Z",
    finishedAt: "2024-01-01T00:01:00Z",
    dataJobId: null,
    errorMessage: null,
    createdAt: "2024-01-01T00:00:00Z",
    createdBy: null,
    ...overrides,
  }
}

describe("calculateOrderFeasibility", () => {
  it("blocks when rounded notional falls below minNotional", () => {
    const result = calculateOrderFeasibility(runtime, risk, 60_000)

    expect(result.level).toBe("blocked")
    expect(result.maxOrderNotional).toBe(10)
    expect(result.roundedQuantity).toBe(0)
    expect(result.messages).toContain("Rounded quantity is zero. Increase max order size, lower step size, or choose a lower-priced symbol.")
  })

  it("warns but does not block when max order uses all capital", () => {
    const result = calculateOrderFeasibility(
      runtime,
      { ...risk, maxOrderPercent: 100, stepSize: 0.00001 },
      60_000,
    )

    expect(result.level).toBe("warning")
    expect(result.messages).toContain("Max order uses 100% of capital; spot research can overstate fill quality.")
  })

  it("reports unknown when no representative price is available", () => {
    const result = calculateOrderFeasibility(runtime, risk, null)

    expect(result.level).toBe("warning")
    expect(result.estimatedQuantity).toBeNull()
    expect(result.messages).toContain("Representative price is unavailable; order feasibility cannot be fully checked before preflight.")
  })
})

describe("buildResearchRangeGuidance", () => {
  it("labels short ranges as smoke tests", () => {
    const result = buildResearchRangeGuidance({
      ...runtime,
      startAt: "2024-01-01T00:00:00Z",
      endAt: "2024-01-08T00:00:00Z",
    })

    expect(result.level).toBe("warning")
    expect(result.label).toBe("1 week smoke")
  })
})

describe("filterResearchRunHistory", () => {
  it("hides fixture runs and keeps current config runs", () => {
    const result = filterResearchRunHistory(
      [run("fixture-run", { errorMessage: "fixture" }), run("current-run")],
      {
        completedOnly: true,
        hideFixtures: true,
        currentConfigOnly: false,
        currentRunIds: new Set(["current-run"]),
      },
    )

    expect(result.map((entry) => entry.id)).toEqual(["current-run"])
  })
})
