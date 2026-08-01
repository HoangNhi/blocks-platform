// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { ExecutionJournalPanel } from "./execution-journal-panel"

const completedAnalysis = {
  run: { id: "run-1", status: "completed" },
  datasetContext: { datasetKey: "binance:BTCUSDT:1h" },
} as never

describe("ExecutionJournalPanel", () => {
  it("disables add action without completed run", () => {
    render(
      <ExecutionJournalPanel
        analysis={null}
        journal={null}
        isLoading={false}
        isSaving={false}
        error={null}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByText("Execution journal")).toBeTruthy()
    expect((screen.getByRole("button", { name: /add journal entry/i }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("opens create form for completed run", async () => {
    const user = userEvent.setup()
    render(
      <ExecutionJournalPanel
        analysis={completedAnalysis}
        journal={{ items: [] }}
        isLoading={false}
        isSaving={false}
        error={null}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    await user.click(screen.getByRole("button", { name: /add journal entry/i }))

    expect(screen.getByRole("dialog")).toBeTruthy()
    expect(screen.getByLabelText(/entry price/i)).toBeTruthy()
    expect(screen.getByLabelText(/exit price/i)).toBeTruthy()
  })

  it("shows assisted testnet and live source badges", () => {
    render(
      <ExecutionJournalPanel
        analysis={completedAnalysis}
        journal={{
          items: [{
            entryId: "entry-1",
            sourceRunId: "run-1",
            strategyId: null,
            strategyVersionId: null,
            symbol: "BTCUSDT",
            timeframe: "1h",
            side: "long",
            plannedSnapshot: { source: "assisted_testnet_order", testnetOrderIntentId: "intent-1" },
            comparisonSummary: {
              averageEntryPrice: 1,
              averageExitPrice: null,
              entryQuantity: 25,
              exitQuantity: 0,
              totalFees: 0,
              realizedGrossPnl: null,
              realizedNetPnl: null,
              slippageBps: null,
              rMultiple: null,
              disciplineStatus: "not_recorded",
              outcomeStatus: "open",
              safetyStatus: "observed_execution_evidence_only",
              liveReadinessStatus: "not_live_ready",
            },
            outcomeStatus: "open",
            disciplineStatus: "not_recorded",
            safetyStatus: "observed_execution_evidence_only",
            liveReadinessStatus: "not_live_ready",
            notes: null,
            fills: [],
            createdAt: null,
            updatedAt: null,
          }, {
            entryId: "entry-2",
            sourceRunId: "run-1",
            strategyId: null,
            strategyVersionId: null,
            symbol: "BTCUSDT",
            timeframe: "1h",
            side: "long",
            plannedSnapshot: { source: "assisted_live_order", liveOrderIntentId: "intent-2" },
            comparisonSummary: {
              averageEntryPrice: 1,
              averageExitPrice: null,
              entryQuantity: 25,
              exitQuantity: 0,
              totalFees: 0,
              realizedGrossPnl: null,
              realizedNetPnl: null,
              slippageBps: null,
              rMultiple: null,
              disciplineStatus: "not_recorded",
              outcomeStatus: "open",
              safetyStatus: "observed_execution_evidence_only",
              liveReadinessStatus: "not_live_ready",
            },
            outcomeStatus: "open",
            disciplineStatus: "not_recorded",
            safetyStatus: "observed_execution_evidence_only",
            liveReadinessStatus: "not_live_ready",
            notes: null,
            fills: [],
            createdAt: null,
            updatedAt: null,
          }],
        }}
        isLoading={false}
        isSaving={false}
        error={null}
        onCreate={vi.fn()}
        onUpdate={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByText("Assisted testnet")).toBeTruthy()
    expect(screen.getByText("Assisted live")).toBeTruthy()
  })
})
