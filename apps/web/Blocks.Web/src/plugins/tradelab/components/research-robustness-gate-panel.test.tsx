// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { ResearchRobustnessGatePanel } from "./research-robustness-gate-panel"
import type { TradeLabResearchRobustnessGate, TradeLabRunAnalysis } from "../types"

const analysis = { run: { status: "completed" } } as TradeLabRunAnalysis
const gate: TradeLabResearchRobustnessGate = {
  robustnessGateId: "gate-1",
  sourceRunId: "run-1",
  strategyId: "strategy-1",
  strategyVersionId: "version-1",
  strategyName: "Baseline SMA",
  exchange: "binance",
  symbol: "BTCUSDT",
  timeframe: "1h",
  generatedAt: "2026-05-30T00:00:00Z",
  candidateLabel: "research_candidate",
  liveReadinessStatus: "not_live_ready",
  safetyStatus: "research_robustness_gate_only",
  datasetKey: "binance:BTCUSDT:1h",
  gates: {
    tradeCount: { status: "pass", reasonCode: "trade_count_sufficient", summary: "Enough trades" },
    drawdown: { status: "pass", reasonCode: "drawdown_within_limit", summary: "Drawdown within limit" },
  },
  warnings: ["parameter_sensitivity_requires_rerun_evidence"],
  limitations: ["Research evidence only."],
  sourceMetrics: {},
  sourceTradeSummary: {},
}

describe("ResearchRobustnessGatePanel", () => {
  it("requires a completed run", () => {
    render(<ResearchRobustnessGatePanel analysis={null} gate={null} isCreating={false} error={null} onCreate={vi.fn()} />)
    expect(screen.getByText("Load a completed run to generate robustness evidence.")).toBeTruthy()
    expect((screen.getByRole("button", { name: /generate robustness evidence/i }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("renders gate evidence without live trading controls", () => {
    render(<ResearchRobustnessGatePanel analysis={analysis} gate={gate} isCreating={false} error={null} onCreate={vi.fn()} />)
    expect(screen.getByText("Research robustness")).toBeTruthy()
    expect(screen.getByText("research_robustness_gate_only")).toBeTruthy()
    expect(screen.getByText("research_candidate")).toBeTruthy()
    expect(screen.getByText("not_live_ready")).toBeTruthy()
    expect(screen.queryByText(/Submit order|Connect exchange/i)).toBeNull()
  })

  it("calls create handler", async () => {
    const user = userEvent.setup()
    const onCreate = vi.fn()
    render(<ResearchRobustnessGatePanel analysis={analysis} gate={null} isCreating={false} error={null} onCreate={onCreate} />)
    await user.click(screen.getByRole("button", { name: /generate robustness evidence/i }))
    expect(onCreate).toHaveBeenCalledTimes(1)
  })
})
