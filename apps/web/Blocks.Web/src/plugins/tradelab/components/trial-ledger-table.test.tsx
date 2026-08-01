// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { TrialLedgerTable } from "./trial-ledger-table"
import type { ResearchTrial } from "../utils/research-session"

const runtime = {
  exchange: "binance",
  symbol: "BTCUSDT",
  timeframe: "1h",
  startAt: "2026-01-01T00:00:00Z",
  endAt: "2026-02-01T00:00:00Z",
  initialEquity: 100,
  feeBps: 10,
  slippageBps: 5,
}

const risk = {
  maxOrderPercent: 25,
  maxPositionPercent: 50,
  maxDrawdownPercent: 15,
  minNotional: 5,
  stepSize: 0.00001,
  tickSize: 0.01,
}

const trials: ResearchTrial[] = [
  {
    id: "trial-1",
    trialNumber: 1,
    phase: "in_sample",
    hypothesis: "Trend follows breakout.",
    strategyFamily: "trend",
    runtime,
    risk,
    strategyVersionLabel: "v1 abc12345",
    configHash: "cfg-1",
    runId: "run-1",
    result: { totalReturnPct: 2, monthlyReturnPct: 2, maxDrawdownPct: 4, profitFactor: 1.1, tradeCount: 8, averageTradePct: 0.1 },
    decision: "unreviewed",
    decisionReason: "",
    createdAt: "2026-02-01T00:00:00Z",
  },
  {
    id: "trial-2",
    trialNumber: 2,
    phase: "validation",
    hypothesis: "Pullback survives validation.",
    strategyFamily: "mean_reversion",
    runtime: { ...runtime, timeframe: "15m" },
    risk,
    strategyVersionLabel: "v2 def67890",
    configHash: "cfg-2",
    runId: "run-2",
    result: { totalReturnPct: 7, monthlyReturnPct: 5.4, maxDrawdownPct: 7, profitFactor: 1.35, tradeCount: 24, averageTradePct: 0.22 },
    decision: "candidate",
    decisionReason: "Validation passed.",
    createdAt: "2026-02-02T00:00:00Z",
  },
]

describe("TrialLedgerTable", () => {
  it("filters by phase and triggers decisions", async () => {
    const onDecision = vi.fn()
    render(<TrialLedgerTable trials={trials} onOpenRun={vi.fn()} onDecision={onDecision} onPromote={vi.fn()} onLockOos={vi.fn()} />)

    expect(screen.getByText("Trial 1")).toBeTruthy()
    expect(screen.getAllByText("in sample").length).toBeGreaterThan(0)
    expect(screen.getByText("run-1")).toBeTruthy()

    await userEvent.selectOptions(screen.getByLabelText("Phase filter"), "validation")
    expect(screen.queryByText("Trial 1")).toBeNull()
    expect(screen.getByText("Trial 2")).toBeTruthy()

    await userEvent.click(screen.getByRole("button", { name: /keep trial 2/i }))
    expect(onDecision).toHaveBeenCalledWith(2, "keep")
  })

  it("filters by decision and runs row actions", async () => {
    const onOpenRun = vi.fn()
    const onPromote = vi.fn()
    const onLockOos = vi.fn()
    render(<TrialLedgerTable trials={trials} onOpenRun={onOpenRun} onDecision={vi.fn()} onPromote={onPromote} onLockOos={onLockOos} />)

    await userEvent.selectOptions(screen.getByLabelText("Decision filter"), "candidate")
    expect(screen.queryByText("Trial 1")).toBeNull()
    await userEvent.click(screen.getByRole("button", { name: /open run run-2/i }))
    await userEvent.click(screen.getByRole("button", { name: /promote trial 2 to validation/i }))
    await userEvent.click(screen.getByRole("button", { name: /lock trial 2 for final oos/i }))

    expect(onOpenRun).toHaveBeenCalledWith("run-2")
    expect(onPromote).toHaveBeenCalledWith(2, "validation")
    expect(onLockOos).toHaveBeenCalledWith(2)
  })

  it("shows empty state", () => {
    render(<TrialLedgerTable trials={[]} onOpenRun={vi.fn()} onDecision={vi.fn()} onPromote={vi.fn()} onLockOos={vi.fn()} />)
    expect(screen.getByText("No trials recorded.")).toBeTruthy()
  })
})
