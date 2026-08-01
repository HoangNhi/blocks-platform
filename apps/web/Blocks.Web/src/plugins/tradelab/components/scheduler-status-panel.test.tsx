// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { TradeLabFillSchedulerStatus } from "../types"
import { SchedulerStatusPanel } from "./scheduler-status-panel"

const status: TradeLabFillSchedulerStatus = {
  enabled: true,
  running: false,
  workerId: "trade-lab-local-scheduler",
  intervalSeconds: 60,
  lastTickStartedAt: "2026-05-19T10:00:00Z",
  lastTickCompletedAt: "2026-05-19T10:01:00Z",
  lastTickStatus: "processed",
  lastSkipReason: null,
  lastReasonCode: null,
  lastJobId: "job-1",
  lastDatasetKey: "binance:BTCUSDT:1h",
  staleJobsMarked: 1,
  consecutiveFailureCount: 0,
  safetyStatus: "read_only_scheduler_visibility",
}

describe("SchedulerStatusPanel", () => {
  it("renders scheduler status with read-only badge", () => {
    render(<SchedulerStatusPanel status={status} />)

    expect(screen.getByText("Scheduler status")).toBeTruthy()
    expect(screen.getByText("Read-only")).toBeTruthy()
    expect(screen.getByText("processed")).toBeTruthy()
    expect(screen.getByText("trade-lab-local-scheduler")).toBeTruthy()
    expect(screen.getByText("binance:BTCUSDT:1h")).toBeTruthy()
    expect(screen.getByText("read_only_scheduler_visibility")).toBeTruthy()
  })

  it("renders loading error and empty states", () => {
    const { rerender } = render(<SchedulerStatusPanel status={null} isLoading />)
    expect(screen.getByText("Loading scheduler status...")).toBeTruthy()

    rerender(<SchedulerStatusPanel status={null} errorMessage="Unable to load scheduler status." />)
    expect(screen.getByText("Unable to load scheduler status.")).toBeTruthy()

    rerender(<SchedulerStatusPanel status={null} />)
    expect(screen.getByText("No scheduler status available.")).toBeTruthy()
  })

  it("calls refresh and has no mutation actions", () => {
    const onRefresh = vi.fn()
    render(<SchedulerStatusPanel status={status} onRefresh={onRefresh} />)

    fireEvent.click(screen.getByRole("button", { name: "Refresh scheduler status" }))

    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("button", { name: /Start scheduler|Stop scheduler|Run scheduler tick|Enable scheduler|Disable scheduler/i })).toBeNull()
    expect(screen.queryByRole("button", { name: /Cancel|Retry|Recover|Requeue|Repair|Replace/i })).toBeNull()
  })
})
