// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { TradeLabDatasetFillJobVisibility } from "../types"
import { BackgroundFillJobsPanel } from "./background-fill-jobs-panel"

const visibility: TradeLabDatasetFillJobVisibility = {
  datasetKey: "binance:BTCUSDT:1h",
  exchange: "binance",
  symbol: "BTCUSDT",
  timeframe: "1h",
  safetyStatus: "read_only",
  active: [
    {
      jobId: "job-active",
      datasetKey: "binance:BTCUSDT:1h",
      jobType: "fill",
      status: "running",
      requestedRange: { startAt: "2026-01-01T00:00:00Z", endAt: "2026-01-01T06:00:00Z" },
      appliedRange: { startAt: "2026-01-01T01:00:00Z", endAt: "2026-01-01T02:00:00Z" },
      rowsImported: 2,
      rowsFetched: 3,
      rowsInserted: 2,
      rowsSkippedExisting: 1,
      reasonCode: null,
      providerStatus: null,
      attemptCount: 1,
      workerId: "worker-a",
      createdAt: "2026-01-01T00:00:00Z",
      startedAt: "2026-01-01T00:01:00Z",
      finishedAt: null,
      heartbeatAt: "2026-01-01T00:02:00Z",
      metadata: { source: "strategy_lab_local_fill", requestFingerprint: "fingerprint-1" },
    },
  ],
  recent: [
    {
      jobId: "job-recent",
      datasetKey: "binance:BTCUSDT:1h",
      jobType: "fill",
      status: "failed",
      requestedRange: { startAt: "2026-01-01T00:00:00Z", endAt: "2026-01-01T06:00:00Z" },
      appliedRange: { startAt: null, endAt: null },
      rowsImported: 0,
      rowsFetched: 0,
      rowsInserted: 0,
      rowsSkippedExisting: 0,
      reasonCode: "dataset_fill_provider_rate_limited",
      providerStatus: "429",
      attemptCount: 3,
      workerId: null,
      createdAt: "2026-01-01T00:00:00Z",
      startedAt: "2026-01-01T00:01:00Z",
      finishedAt: "2026-01-01T00:03:00Z",
      heartbeatAt: null,
      metadata: {},
    },
  ],
}

describe("BackgroundFillJobsPanel", () => {
  it("renders active and recent fill jobs with read-only badge", () => {
    render(<BackgroundFillJobsPanel visibility={visibility} />)

    expect(screen.getByText("Background fill jobs")).toBeTruthy()
    expect(screen.getByText("Read-only")).toBeTruthy()
    expect(screen.getByLabelText("Active background fill jobs").textContent).toContain("running")
    expect(screen.getByLabelText("Recent background fill jobs").textContent).toContain("failed")
    expect(screen.getByLabelText("Recent background fill jobs").textContent).toContain("dataset_fill_provider_rate_limited")
    expect(screen.getByLabelText("Recent background fill jobs").textContent).toContain("providerStatus=429")
  })

  it("renders loading error and empty states", () => {
    const { rerender } = render(<BackgroundFillJobsPanel visibility={null} isLoading />)
    expect(screen.getByText("Loading background fill jobs...")).toBeTruthy()

    rerender(<BackgroundFillJobsPanel visibility={null} errorMessage="Unable to load background fill jobs." />)
    expect(screen.getByText("Unable to load background fill jobs.")).toBeTruthy()

    rerender(<BackgroundFillJobsPanel visibility={{ ...visibility, active: [], recent: [] }} />)
    expect(screen.getByText("No background fill jobs for this dataset.")).toBeTruthy()
  })

  it("calls refresh and has no mutation actions", () => {
    const onRefresh = vi.fn()
    render(<BackgroundFillJobsPanel visibility={visibility} onRefresh={onRefresh} />)

    fireEvent.click(screen.getByRole("button", { name: "Refresh background fill jobs" }))

    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("button", { name: /Enqueue|Cancel|Retry|Repair|Recover|Replace|Run paper|Order/i })).toBeNull()
  })

  it("expands metadata detail", () => {
    render(<BackgroundFillJobsPanel visibility={visibility} />)

    fireEvent.click(screen.getByRole("button", { name: "Toggle background fill job job-active" }))

    expect(screen.getByText(/requestFingerprint/)).toBeTruthy()
  })
})
