// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { DatasetCatalogPage } from "./dataset-catalog-page"
import type { TradeLabDatasetCoverageItem } from "../types"

function createCoverage(overrides: Partial<TradeLabDatasetCoverageItem> = {}): TradeLabDatasetCoverageItem {
  return {
    id: "coverage-1",
    datasetKey: "binance:BTCUSDT:1h",
    exchange: "binance",
    symbol: "BTCUSDT",
    timeframe: "1h",
    healthStatus: "healthy",
    earliestOpenTime: "2026-01-01T00:00:00Z",
    latestOpenTime: "2026-01-07T00:00:00Z",
    coveredStartAt: "2026-01-01T00:00:00Z",
    coveredEndAt: "2026-01-07T00:00:00Z",
    segmentCount: 1,
    gapCount: 0,
    lastCheckedAt: "2026-05-17T00:00:00Z",
    metadata: { source: "test" },
    segments: [
      {
        id: "segment-1",
        segmentIndex: 0,
        startAt: "2026-01-01T00:00:00Z",
        endAt: "2026-01-07T00:00:00Z",
        rowCount: 145,
      },
    ],
    ...overrides,
  }
}

function setCatalogUrl(search: string) {
  window.history.pushState({}, "", `/plugins/tradelab/datasets${search}`)
}

afterEach(() => {
  window.history.pushState({}, "", "/")
})

describe("DatasetCatalogPage", () => {
  it("shows loading state", () => {
    render(<DatasetCatalogPage loadCoverage={() => new Promise(() => undefined)} />)

    expect(screen.getByText("Loading dataset catalog...")).toBeTruthy()
  })

  it("shows empty state", async () => {
    render(<DatasetCatalogPage loadCoverage={vi.fn().mockResolvedValue({ items: [] })} />)

    expect(await screen.findByText("No datasets have been indexed yet.")).toBeTruthy()
  })

  it("shows error state and retries on refresh", async () => {
    const loadCoverage = vi
      .fn()
      .mockRejectedValueOnce(new Error("Catalog unavailable."))
      .mockResolvedValueOnce({ items: [createCoverage()] })

    render(<DatasetCatalogPage loadCoverage={loadCoverage} />)

    expect(await screen.findByText("Catalog unavailable.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: /refresh dataset catalog/i }))

    expect(await screen.findByText("Open details for binance:BTCUSDT:1h")).toBeTruthy()
    expect(loadCoverage).toHaveBeenCalledTimes(2)
  })

  it("renders rows, summary counts, filters, and detail sheet", async () => {
    render(
      <DatasetCatalogPage
        loadCoverage={vi.fn().mockResolvedValue({
          items: [
            createCoverage(),
            createCoverage({
              id: "coverage-2",
              datasetKey: "binance:ETHUSDT:15m",
              symbol: "ETHUSDT",
              timeframe: "15m",
              healthStatus: "suspect",
              segmentCount: 2,
              gapCount: 3,
              segments: [],
            }),
          ],
        })}
      />,
    )

    expect(await screen.findByText("2 datasets")).toBeTruthy()
    expect(screen.getByText("1 healthy")).toBeTruthy()
    expect(screen.getByText("3 total gaps")).toBeTruthy()
    expect(screen.getByText("Open details for binance:BTCUSDT:1h")).toBeTruthy()
    expect(screen.getByText("Open details for binance:ETHUSDT:15m")).toBeTruthy()

    fireEvent.change(screen.getByLabelText("Symbol filter"), { target: { value: "BTC" } })
    expect(screen.getByText("Open details for binance:BTCUSDT:1h")).toBeTruthy()
    expect(screen.queryByText("Open details for binance:ETHUSDT:15m")).toBeNull()

    fireEvent.click(screen.getByRole("button", { name: /open details for binance:BTCUSDT:1h/i }))
    expect(await screen.findByRole("dialog")).toBeTruthy()
    expect(screen.getByText("Coverage details")).toBeTruthy()
    expect(screen.getByText("segment-1")).toBeTruthy()
    expect(screen.getByText(/"source": "test"/)).toBeTruthy()
  })

  it("shows quality signals for healthy coverage in the detail sheet", async () => {
    render(<DatasetCatalogPage loadCoverage={vi.fn().mockResolvedValue({ items: [createCoverage()] })} />)

    await screen.findByText("Open details for binance:BTCUSDT:1h")
    fireEvent.click(screen.getByRole("button", { name: /open details for binance:BTCUSDT:1h/i }))

    expect(await screen.findByText("Quality signals")).toBeTruthy()
    expect(screen.getByText("Healthy")).toBeTruthy()
    expect(screen.getByText(/Dataset coverage is healthy/)).toBeTruthy()
    expect(screen.getByText("Range indexed")).toBeTruthy()
    expect(screen.getByText(/No gaps recorded across 1 active segment/)).toBeTruthy()
    expect(screen.getByText(/Catalog metadata is sanitized and read-only/)).toBeTruthy()
  })

  it("shows warning quality signals for suspect coverage with gaps", async () => {
    render(
      <DatasetCatalogPage
        loadCoverage={vi.fn().mockResolvedValue({
          items: [
            createCoverage({
              healthStatus: "suspect",
              coveredStartAt: null,
              segmentCount: 2,
              gapCount: 3,
            }),
          ],
        })}
      />,
    )

    await screen.findByText("Open details for binance:BTCUSDT:1h")
    fireEvent.click(screen.getByRole("button", { name: /open details for binance:BTCUSDT:1h/i }))

    expect(await screen.findByText("Quality signals")).toBeTruthy()
    expect(screen.getByText("Suspect")).toBeTruthy()
    expect(screen.getByText(/Dataset integrity needs attention/)).toBeTruthy()
    expect(screen.getByText("Range incomplete")).toBeTruthy()
    expect(screen.getByText(/Coverage range is missing start or end timestamps/)).toBeTruthy()
    expect(screen.getByText("Gaps present")).toBeTruthy()
    expect(screen.getByText("3 gaps across 2 active segments.")).toBeTruthy()
  })

  it("shows freshness and gap signals in the detail sheet", async () => {
    render(<DatasetCatalogPage loadCoverage={vi.fn().mockResolvedValue({ items: [createCoverage()] })} />)

    await screen.findByText("Open details for binance:BTCUSDT:1h")
    fireEvent.click(screen.getByRole("button", { name: /open details for binance:BTCUSDT:1h/i }))

    expect(await screen.findByText("Freshness & gaps")).toBeTruthy()
    expect(screen.getByText("Freshness")).toBeTruthy()
    expect(screen.getByText("Check age")).toBeTruthy()
    expect(screen.getByText("Gap severity")).toBeTruthy()
    expect(screen.getByText("Coverage end")).toBeTruthy()
    expect(screen.getByText("Reason: missing_freshness_timestamps")).toBeTruthy()
    expect(screen.getByText("Reason: no_gaps")).toBeTruthy()
    expect(screen.getByText("Reason: coverage_end_available")).toBeTruthy()
  })

  it("shows target context and target-aware freshness in the detail sheet", async () => {
    setCatalogUrl(
      "?datasetKey=binance%3ABTCUSDT%3A1h&requestedStartAt=2026-01-01T00%3A00%3A00Z&requestedEndAt=2026-01-07T00%3A00%3A00Z",
    )

    render(<DatasetCatalogPage loadCoverage={vi.fn().mockResolvedValue({ items: [createCoverage()] })} />)

    await screen.findByText("Open details for binance:BTCUSDT:1h")
    fireEvent.click(screen.getByRole("button", { name: /open details for binance:BTCUSDT:1h/i }))

    expect(await screen.findByText("Target context")).toBeTruthy()
    expect(screen.getByText("Requested range")).toBeTruthy()
    expect(screen.getByText("2026-01-01T00:00:00Z - 2026-01-07T00:00:00Z")).toBeTruthy()
    expect(screen.getByText("Source")).toBeTruthy()
    expect(screen.getByText("Strategy Lab link")).toBeTruthy()
    expect(screen.getByText("Reason: fresh")).toBeTruthy()
    expect(screen.queryByText("Reason: missing_freshness_timestamps")).toBeNull()
  })

  it("keeps unknown freshness for malformed target end without crashing", async () => {
    setCatalogUrl("?datasetKey=binance%3ABTCUSDT%3A1h&requestedStartAt=2026-01-01T00%3A00%3A00Z&requestedEndAt=not-a-date")

    render(<DatasetCatalogPage loadCoverage={vi.fn().mockResolvedValue({ items: [createCoverage()] })} />)

    await screen.findByText("Open details for binance:BTCUSDT:1h")
    fireEvent.click(screen.getByRole("button", { name: /open details for binance:BTCUSDT:1h/i }))

    expect(await screen.findByText("Target context")).toBeTruthy()
    expect(screen.getByText("2026-01-01T00:00:00Z - not-a-date")).toBeTruthy()
    expect(screen.getByText("Reason: missing_freshness_timestamps")).toBeTruthy()
  })

  it("renders partial target context with N/A for a missing requested start", async () => {
    setCatalogUrl("?datasetKey=binance%3ABTCUSDT%3A1h&requestedEndAt=2026-01-07T00%3A00%3A00Z")

    render(<DatasetCatalogPage loadCoverage={vi.fn().mockResolvedValue({ items: [createCoverage()] })} />)

    await screen.findByText("Open details for binance:BTCUSDT:1h")
    fireEvent.click(screen.getByRole("button", { name: /open details for binance:BTCUSDT:1h/i }))

    expect(await screen.findByText("Target context")).toBeTruthy()
    expect(screen.getByText("N/A - 2026-01-07T00:00:00Z")).toBeTruthy()
    expect(screen.getByText("Reason: fresh")).toBeTruthy()
  })

  it("shows stale check and many gaps in the detail sheet", async () => {
    render(
      <DatasetCatalogPage
        loadCoverage={vi.fn().mockResolvedValue({
          items: [
            createCoverage({
              gapCount: 5,
              segmentCount: 3,
              lastCheckedAt: "2000-01-01T00:00:00Z",
            }),
          ],
        })}
      />,
    )

    await screen.findByText("Open details for binance:BTCUSDT:1h")
    fireEvent.click(screen.getByRole("button", { name: /open details for binance:BTCUSDT:1h/i }))

    expect(await screen.findByText("Freshness & gaps")).toBeTruthy()
    expect(screen.getByText("Reason: check_stale")).toBeTruthy()
    expect(screen.getByText("Reason: many_gaps")).toBeTruthy()
  })

  it("refreshes without mutating page filters", async () => {
    const loadCoverage = vi
      .fn()
      .mockResolvedValueOnce({ items: [createCoverage()] })
      .mockResolvedValueOnce({ items: [createCoverage({ gapCount: 2 })] })

    render(<DatasetCatalogPage loadCoverage={loadCoverage} />)

    await screen.findByText("Open details for binance:BTCUSDT:1h")
    fireEvent.change(screen.getByLabelText("Dataset key filter"), { target: { value: "BTC" } })
    fireEvent.click(screen.getByRole("button", { name: /refresh dataset catalog/i }))

    await waitFor(() => expect(loadCoverage).toHaveBeenCalledTimes(2))
    expect(screen.getByLabelText("Dataset key filter")).toHaveProperty("value", "BTC")
    expect(await screen.findByText("2 total gaps")).toBeTruthy()
  })

  it("prefills dataset key filter from query params", async () => {
    setCatalogUrl("?datasetKey=binance%3ABTCUSDT%3A1h")

    render(
      <DatasetCatalogPage
        loadCoverage={vi.fn().mockResolvedValue({
          items: [
            createCoverage(),
            createCoverage({
              id: "coverage-2",
              datasetKey: "binance:ETHUSDT:15m",
              symbol: "ETHUSDT",
              timeframe: "15m",
            }),
          ],
        })}
      />,
    )

    const datasetKeyFilter = (await screen.findByLabelText("Dataset key filter")) as HTMLInputElement
    expect(datasetKeyFilter.value).toBe("binance:BTCUSDT:1h")
    expect(await screen.findByText("Open details for binance:BTCUSDT:1h")).toBeTruthy()
    expect(screen.queryByText("Open details for binance:ETHUSDT:15m")).toBeNull()

    fireEvent.change(datasetKeyFilter, { target: { value: "ETH" } })
    expect(await screen.findByText("Open details for binance:ETHUSDT:15m")).toBeTruthy()
  })

  it("prefills symbol and timeframe filters from query params", async () => {
    setCatalogUrl("?symbol=ETHUSDT&timeframe=15m")

    render(
      <DatasetCatalogPage
        loadCoverage={vi.fn().mockResolvedValue({
          items: [
            createCoverage(),
            createCoverage({
              id: "coverage-2",
              datasetKey: "binance:ETHUSDT:15m",
              symbol: "ETHUSDT",
              timeframe: "15m",
              healthStatus: "incomplete",
            }),
          ],
        })}
      />,
    )

    const symbolFilter = (await screen.findByLabelText("Symbol filter")) as HTMLInputElement
    expect(symbolFilter.value).toBe("ETHUSDT")

    await waitFor(() => {
      expect((screen.getByLabelText("Timeframe filter") as HTMLSelectElement).value).toBe("15m")
    })
    expect(screen.queryByText("Open details for binance:BTCUSDT:1h")).toBeNull()
    expect(screen.getByText("Open details for binance:ETHUSDT:15m")).toBeTruthy()

    fireEvent.change(screen.getByLabelText("Timeframe filter"), { target: { value: "" } })
    expect(await screen.findByText("Open details for binance:ETHUSDT:15m")).toBeTruthy()
  })
})
