// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { DatasetCoverageTable } from "./dataset-coverage-table"

const coverage = [{
  id: "cov-1",
  datasetKey: "binance:BTCUSDT:1h",
  exchange: "binance",
  symbol: "BTCUSDT",
  timeframe: "1h",
  healthStatus: "healthy" as const,
  earliestOpenTime: "2026-01-01T00:00:00Z",
  latestOpenTime: "2026-04-01T00:00:00Z",
  coveredStartAt: "2026-01-01T00:00:00Z",
  coveredEndAt: "2026-04-01T00:00:00Z",
  segmentCount: 1,
  gapCount: 0,
  lastCheckedAt: "2026-04-01T00:00:00Z",
  metadata: {},
  segments: [],
}]

describe("DatasetCoverageTable", () => {
  it("shows coverage rows and selects a universe", async () => {
    const onSelect = vi.fn()
    render(<DatasetCoverageTable items={coverage} isLoading={false} errorMessage={null} selectedDatasetKey={null} onSelectUniverse={onSelect} onRefresh={vi.fn()} />)

    expect(screen.getByText("BTCUSDT")).toBeTruthy()
    expect(screen.getByText("1h")).toBeTruthy()
    await userEvent.click(screen.getByRole("button", { name: /select btcusdt 1h/i }))
    expect(onSelect).toHaveBeenCalledWith(coverage[0])
  })

  it("shows selected state and empty state", () => {
    const { rerender } = render(<DatasetCoverageTable items={coverage} isLoading={false} errorMessage={null} selectedDatasetKey="binance:BTCUSDT:1h" onSelectUniverse={vi.fn()} onRefresh={vi.fn()} />)
    expect(screen.getByText("Selected")).toBeTruthy()

    rerender(<DatasetCoverageTable items={[]} isLoading={false} errorMessage={null} selectedDatasetKey={null} onSelectUniverse={vi.fn()} onRefresh={vi.fn()} />)
    expect(screen.getByText("No dataset coverage found.")).toBeTruthy()
  })

  it("shows loading and error states", () => {
    const { rerender } = render(<DatasetCoverageTable items={[]} isLoading errorMessage={null} selectedDatasetKey={null} onSelectUniverse={vi.fn()} onRefresh={vi.fn()} />)
    expect(screen.getByText("Loading dataset coverage...")).toBeTruthy()

    rerender(<DatasetCoverageTable items={[]} isLoading={false} errorMessage="Coverage failed" selectedDatasetKey={null} onSelectUniverse={vi.fn()} onRefresh={vi.fn()} />)
    expect(screen.getByText("Coverage failed")).toBeTruthy()
  })
})


