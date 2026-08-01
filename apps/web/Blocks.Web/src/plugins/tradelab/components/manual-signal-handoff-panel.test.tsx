// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { ManualSignalHandoffPanel } from "./manual-signal-handoff-panel"
import type { TradeLabRunAnalysis } from "../types"

const completedAnalysis = { run: { status: "completed" } } as Pick<TradeLabRunAnalysis, "run">

const packageResult = {
  signalPackageId: "pkg-1",
  sourceRunId: "run-1",
  strategyId: "strategy-1",
  strategyVersionId: "version-1",
  strategyName: "Breakout Lab",
  exchange: "binance",
  symbol: "BTCUSDT",
  timeframe: "1h",
  datasetKey: "binance:BTCUSDT:1h",
  runStartAt: "2026-01-01T00:00:00Z",
  runEndAt: "2026-01-31T00:00:00Z",
  generatedAt: "2026-05-30T00:00:00Z",
  action: "watch",
  entryRule: "Manual setup only",
  stopRule: "Use risk guard",
  takeProfitRule: null,
  exitRule: "Use strategy exit",
  positionSizingRule: "maxOrderPercent=10",
  maxRiskPerTrade: "10",
  invalidationRule: "Mismatch invalidates",
  manualExecutionNotes: ["Manual only"],
  limitations: ["Historical evidence"],
  warnings: ["robustness_not_available"],
  sourceMetrics: { totalReturnPct: "12.5" },
  sourceTradeSummary: { totalTrades: 24 },
  datasetEvidence: { datasetKey: "binance:BTCUSDT:1h" },
  riskEvidence: { maxOrderPercent: 10 },
  robustnessEvidenceStatus: "not_available",
  liveReadinessStatus: "manual_handoff_only",
  safetyStatus: "manual_live_signal_handoff_only",
  markdown: "# TradeLab Manual Signal Handoff",
}

describe("ManualSignalHandoffPanel", () => {
  it("renders blocked empty state without a completed run", () => {
    render(<ManualSignalHandoffPanel analysis={null} packageResult={null} isCreating={false} error={null} onCreate={vi.fn()} />)
    expect(screen.getByText("Load a completed run to create a manual signal package.")).toBeTruthy()
    expect(screen.getByRole<HTMLButtonElement>("button", { name: /Generate signal package/i }).disabled).toBe(true)
  })

  it("renders generated package evidence and no order controls", () => {
    render(
      <ManualSignalHandoffPanel
        analysis={completedAnalysis as TradeLabRunAnalysis}
        packageResult={packageResult}
        isCreating={false}
        error={null}
        onCreate={vi.fn()}
      />,
    )
    expect(screen.getByText("Signal handoff")).toBeTruthy()
    expect(screen.getByText("manual_live_signal_handoff_only")).toBeTruthy()
    expect(screen.getByText("BTCUSDT · 1h")).toBeTruthy()
    expect(screen.getByText("robustness_not_available")).toBeTruthy()
    expect(screen.queryByText(/Submit order/i)).toBeNull()
    expect(screen.queryByText(/Connect exchange/i)).toBeNull()
  })

  it("copies markdown when copy is clicked", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(
      <ManualSignalHandoffPanel
        analysis={completedAnalysis as TradeLabRunAnalysis}
        packageResult={packageResult}
        isCreating={false}
        error={null}
        onCreate={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByRole("button", { name: /Copy package/i }))
    expect(writeText).toHaveBeenCalledWith("# TradeLab Manual Signal Handoff")
  })
})
