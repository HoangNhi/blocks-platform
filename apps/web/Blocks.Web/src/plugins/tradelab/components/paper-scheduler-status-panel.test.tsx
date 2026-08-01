// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { TradeLabPaperSchedulerStatus } from "../types"
import { PaperSchedulerStatusPanel } from "./paper-scheduler-status-panel"

const status: TradeLabPaperSchedulerStatus = {
  enabled: true,
  running: false,
  workerId: "tradelab-local-paper-scheduler",
  intervalSeconds: 60,
  lastTickStartedAt: "2026-05-29T10:00:00Z",
  lastTickCompletedAt: "2026-05-29T10:01:00Z",
  lastTickStatus: "processed",
  lastSkipReason: null,
  lastReasonCode: "paper_engine_completed",
  lastSessionId: "paper-session-1",
  candlesProcessed: 100,
  ordersCreated: 1,
  fillsCreated: 1,
  snapshotsCreated: 100,
  consecutiveFailureCount: 0,
  safetyStatus: "read_only_paper_scheduler_visibility",
}

describe("PaperSchedulerStatusPanel", () => {
  it("renders paper scheduler status with read-only badge", () => {
    render(<PaperSchedulerStatusPanel status={status} />)

    expect(screen.getByText("Paper scheduler")).toBeTruthy()
    expect(screen.getByText("Read-only")).toBeTruthy()
    expect(screen.getByText("processed")).toBeTruthy()
    expect(screen.getByText("tradelab-local-paper-scheduler")).toBeTruthy()
    expect(screen.getByText("paper-session-1")).toBeTruthy()
    expect(screen.getByText("read_only_paper_scheduler_visibility")).toBeTruthy()
  })

  it("renders loading error and empty states", () => {
    const { rerender } = render(<PaperSchedulerStatusPanel status={null} isLoading />)
    expect(screen.getByText("Loading paper scheduler status...")).toBeTruthy()

    rerender(<PaperSchedulerStatusPanel status={null} errorMessage="Unable to load paper scheduler status." />)
    expect(screen.getByText("Unable to load paper scheduler status.")).toBeTruthy()

    rerender(<PaperSchedulerStatusPanel status={null} />)
    expect(screen.getByText("No paper scheduler status available.")).toBeTruthy()
  })

  it("calls refresh and has no mutation actions", () => {
    const onRefresh = vi.fn()
    render(<PaperSchedulerStatusPanel status={status} onRefresh={onRefresh} />)

    fireEvent.click(screen.getByRole("button", { name: "Refresh paper scheduler status" }))

    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("button", { name: /Start scheduler|Stop scheduler|Run scheduler tick|Enable scheduler|Disable scheduler/i })).toBeNull()
    expect(screen.queryByRole("button", { name: /Run paper|Retry paper/i })).toBeNull()
  })
})
