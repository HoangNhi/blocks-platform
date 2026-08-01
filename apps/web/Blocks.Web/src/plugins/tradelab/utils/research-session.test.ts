import { describe, expect, it } from "vitest"

import {
  addResearchTrial,
  contaminateOosIfConfigChanged,
  createResearchSession,
  filterResearchTrials,
  lockOosCandidate,
  promoteTrial,
  updateTrialDecision,
} from "./research-session"

const baseRuntime = {
  exchange: "binance",
  symbol: "BTCUSDT",
  timeframe: "1h",
  startAt: "2026-01-01T00:00:00Z",
  endAt: "2026-02-01T00:00:00Z",
  initialEquity: 100,
  feeBps: 10,
  slippageBps: 5,
}

const baseRisk = {
  maxOrderPercent: 25,
  maxPositionPercent: 50,
  maxDrawdownPercent: 15,
  minNotional: 5,
  stepSize: 0.00001,
  tickSize: 0.01,
}

describe("research session", () => {
  it("creates a strategy-scoped session with clean OOS state", () => {
    const session = createResearchSession({ strategyId: "strategy-1", strategyName: "Mean Revert" })

    expect(session.strategyId).toBe("strategy-1")
    expect(session.oos.status).toBe("not_started")
    expect(session.trials).toHaveLength(0)
  })

  it("numbers trials and records required metadata", () => {
    const session = createResearchSession({ strategyId: "strategy-1", strategyName: "Mean Revert" })
    const next = addResearchTrial(session, {
      phase: "in_sample",
      hypothesis: "Pullbacks recover after volatility compression.",
      strategyFamily: "mean_reversion",
      runtime: baseRuntime,
      risk: baseRisk,
      strategyVersionLabel: "v3 abc12345",
      configHash: "cfg-1",
      runId: "run-1",
      result: { totalReturnPct: 6, monthlyReturnPct: 5.8, maxDrawdownPct: 8, profitFactor: 1.4, tradeCount: 22, averageTradePct: 0.21 },
    })

    expect(next.trials[0].trialNumber).toBe(1)
    expect(next.trials[0].phase).toBe("in_sample")
    expect(next.trials[0].runId).toBe("run-1")
  })

  it("records keep/drop decisions", () => {
    let session = createResearchSession({ strategyId: "strategy-1", strategyName: "Mean Revert" })
    session = addResearchTrial(session, {
      phase: "in_sample",
      hypothesis: "A",
      strategyFamily: "trend",
      runtime: baseRuntime,
      risk: baseRisk,
      strategyVersionLabel: "v1",
      configHash: "a",
      runId: "run-a",
      result: null,
    })

    session = updateTrialDecision(session, 1, "keep", "Enough trades.")

    expect(session.trials[0].decision).toBe("keep")
    expect(session.trials[0].decisionReason).toBe("Enough trades.")
  })

  it("filters by phase and decision", () => {
    let session = createResearchSession({ strategyId: "strategy-1", strategyName: "Mean Revert" })
    session = addResearchTrial(session, { phase: "in_sample", hypothesis: "A", strategyFamily: "trend", runtime: baseRuntime, risk: baseRisk, strategyVersionLabel: "v1", configHash: "a", runId: "run-a", result: null })
    session = addResearchTrial(session, { phase: "validation", hypothesis: "B", strategyFamily: "trend", runtime: baseRuntime, risk: baseRisk, strategyVersionLabel: "v1", configHash: "b", runId: "run-b", result: null })
    session = updateTrialDecision(session, 2, "candidate", "Validation passed base gates.")

    expect(filterResearchTrials(session.trials, { phase: "validation", decision: "candidate" }).map((trial) => trial.runId)).toEqual(["run-b"])
  })

  it("promotes kept trial and locks OOS candidate", () => {
    let session = createResearchSession({ strategyId: "strategy-1", strategyName: "Mean Revert" })
    session = addResearchTrial(session, { phase: "in_sample", hypothesis: "A", strategyFamily: "trend", runtime: baseRuntime, risk: baseRisk, strategyVersionLabel: "v1", configHash: "a", runId: "run-a", result: null })
    session = updateTrialDecision(session, 1, "keep", "Enough trades.")
    session = promoteTrial(session, 1, "validation")
    session = lockOosCandidate(session, { trialNumber: 1, configHash: "a", startAt: "2026-03-01T00:00:00Z", endAt: "2026-04-01T00:00:00Z" })

    expect(session.trials[0].decision).toBe("candidate")
    expect(session.oos.status).toBe("locked")
    expect(session.oos.lockedTrialNumber).toBe(1)
  })

  it("marks OOS contaminated when config changes after evaluation", () => {
    let session = createResearchSession({ strategyId: "strategy-1", strategyName: "Mean Revert" })
    session = lockOosCandidate(session, { trialNumber: 3, configHash: "before", startAt: "2026-03-01T00:00:00Z", endAt: "2026-04-01T00:00:00Z" })
    session = { ...session, oos: { ...session.oos, status: "evaluated" } }

    const contaminated = contaminateOosIfConfigChanged(session, "after")

    expect(contaminated.oos.status).toBe("contaminated")
  })
})
