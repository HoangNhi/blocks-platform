// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { JobVisibilityPanel } from "./job-visibility-panel"
import type { TradeLabJobVisibilityItem, TradeLabStrategyJobVisibility } from "../types"

function createItem(overrides: Partial<TradeLabJobVisibilityItem> = {}): TradeLabJobVisibilityItem {
  return {
    run: {
      id: "run-active-1234",
      botId: null,
      strategyId: "strategy-1",
      strategyVersionId: "version-1",
      runType: "backtest",
      status: "queued",
      pipelineStatus: "waiting_for_data",
      exchange: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      startAt: "2026-05-17T00:00:00Z",
      endAt: "2026-05-17T01:00:00Z",
      startedAt: null,
      finishedAt: null,
      dataJobId: "job-1",
      errorMessage: null,
      createdAt: "2026-05-17T00:00:00Z",
      createdBy: "codex",
    },
    preflight: null,
    dataJob: {
      id: "job-1",
      coverageId: null,
      datasetKey: "binance:BTCUSDT:1h",
      jobType: "fill",
      exchange: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      requestedStartAt: "2026-05-17T00:00:00Z",
      requestedEndAt: "2026-05-17T01:00:00Z",
      appliedStartAt: null,
      appliedEndAt: null,
      claimedAt: null,
      startedAt: "2026-05-17T00:00:00Z",
      finishedAt: null,
      workerId: null,
      status: "running",
      rowsImported: 0,
      errorMessage: null,
      metadata: {},
      createdAt: "2026-05-17T00:00:00Z",
      createdBy: "codex",
    },
    backtestJob: { id: "run-active-1234" },
    status: "waiting_for_data",
    message: null,
    isStale: false,
    staleReason: null,
    lastActivityAt: "2026-05-17T00:00:00Z",
    ...overrides,
  }
}

function createVisibility(overrides: Partial<TradeLabStrategyJobVisibility> = {}): TradeLabStrategyJobVisibility {
  return {
    strategyId: "strategy-1",
    active: [],
    recent: [],
    staleThresholdMinutes: 10,
    ...overrides,
  }
}

describe("JobVisibilityPanel", () => {
  it("shows empty state and refresh action", () => {
    const onRefresh = vi.fn()
    render(<JobVisibilityPanel visibility={createVisibility()} onRefresh={onRefresh} />)

    expect(screen.getByText("Job visibility")).toBeTruthy()
    expect(screen.getByText("No active or recent jobs for this strategy.")).toBeTruthy()

    fireEvent.click(screen.getByRole("button", { name: /refresh/i }))
    expect(onRefresh).toHaveBeenCalledTimes(1)
  })

  it("shows loading and disables refresh", () => {
    render(<JobVisibilityPanel visibility={null} isLoading onRefresh={vi.fn()} />)

    expect(screen.getByText("Loading job visibility...")).toBeTruthy()
    expect(screen.getByRole("button", { name: /refresh/i })).toHaveProperty("disabled", true)
  })

  it("shows active stale warning and recent jobs", () => {
    render(
      <JobVisibilityPanel
        visibility={createVisibility({
          active: [
            createItem({
              isStale: true,
              staleReason: "active_job_exceeded_stale_threshold",
            }),
          ],
          recent: [
            createItem({
              run: {
                ...createItem().run,
                id: "run-recent-1234",
                status: "completed",
                pipelineStatus: "completed",
                symbol: "ETHUSDT",
                finishedAt: "2026-05-17T01:00:00Z",
              },
              dataJob: null,
              status: "completed",
              isStale: false,
              staleReason: null,
              lastActivityAt: "2026-05-17T01:00:00Z",
            }),
          ],
        })}
      />,
    )

    expect(screen.getByText("1 active")).toBeTruthy()
    expect(screen.getByText("1 stale")).toBeTruthy()
    expect(screen.getByText("Active jobs")).toBeTruthy()
    expect(screen.getByText("Recent jobs")).toBeTruthy()
    expect(screen.getByText("BTCUSDT 1h")).toBeTruthy()
    expect(screen.getByText("ETHUSDT 1h")).toBeTruthy()
    expect(screen.getByText("active_job_exceeded_stale_threshold")).toBeTruthy()
  })

  it("shows load error without hiding existing visibility", () => {
    render(
      <JobVisibilityPanel
        visibility={createVisibility({ active: [createItem()] })}
        errorMessage="Cannot load job visibility."
      />,
    )

    expect(screen.getByText("Cannot load job visibility.")).toBeTruthy()
    expect(screen.getByText("BTCUSDT 1h")).toBeTruthy()
  })
})
