// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { TradeLabRunHistoryEntry } from "../types"
import { RunHistoryList } from "./run-history-list"

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

describe("RunHistoryList", () => {
  it("shows latest current config badge and hides fixture runs by default", () => {
    render(
      <RunHistoryList
        runs={[run("fixture-run", { errorMessage: "fixture" }), run("current-run")]}
        selectedRunId="current-run"
        latestCurrentRunId="current-run"
        currentRunIds={new Set(["current-run"])}
        onOpenRun={vi.fn()}
      />,
    )

    expect(screen.getByText("Latest current config")).toBeTruthy()
    expect(screen.queryByText("fixture-run")).toBeNull()
  })
})
