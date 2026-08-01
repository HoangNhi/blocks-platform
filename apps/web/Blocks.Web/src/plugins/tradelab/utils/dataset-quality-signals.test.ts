import { describe, expect, it } from "vitest"

import { buildDatasetQualitySignals, type DatasetQualitySignalCoverageInput } from "./dataset-quality-signals"
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

function signal(
  item: TradeLabDatasetCoverageItem,
  id: "health" | "coverageRange" | "gapsSegments" | "metadataSafety",
) {
  const result = buildDatasetQualitySignals(item).find((candidate) => candidate.id === id)
  expect(result).toBeTruthy()
  return result!
}

describe("buildDatasetQualitySignals", () => {
  it("marks healthy coverage as ok", () => {
    const result = signal(createCoverage(), "health")

    expect(result.label).toBe("Health")
    expect(result.status).toBe("Healthy")
    expect(result.tone).toBe("ok")
    expect(result.description).toContain("Dataset coverage is healthy")
  })

  it("marks incomplete and suspect health as warning", () => {
    expect(signal(createCoverage({ healthStatus: "incomplete" }), "health")).toMatchObject({
      status: "Incomplete",
      tone: "warning",
    })
    expect(signal(createCoverage({ healthStatus: "suspect" }), "health")).toMatchObject({
      status: "Suspect",
      tone: "warning",
    })
  })

  it("marks blocked health as danger", () => {
    expect(signal(createCoverage({ healthStatus: "blocked" }), "health")).toMatchObject({
      status: "Blocked",
      tone: "danger",
    })
  })

  it("falls back safely for unknown health values", () => {
    const result = signal(
      createCoverage({ healthStatus: "unknown" as TradeLabDatasetCoverageItem["healthStatus"] }),
      "health",
    )

    expect(result.status).toBe("Unknown")
    expect(result.tone).toBe("warning")
    expect(result.description).toContain("Unknown dataset health")
  })

  it("warns when coverage range is missing start or end", () => {
    const result = signal(createCoverage({ coveredStartAt: null }), "coverageRange")

    expect(result.status).toBe("Range incomplete")
    expect(result.tone).toBe("warning")
    expect(result.description).toContain("Coverage range is missing start or end timestamps")
    expect(result.description).toContain("N/A")
  })

  it("marks complete coverage range as ok", () => {
    const result = signal(createCoverage(), "coverageRange")

    expect(result.status).toBe("Range indexed")
    expect(result.tone).toBe("ok")
    expect(result.description).toContain("2026-01-01T00:00:00Z")
    expect(result.description).toContain("2026-01-07T00:00:00Z")
  })

  it("warns when gaps are present", () => {
    const result = signal(createCoverage({ gapCount: 3, segmentCount: 2 }), "gapsSegments")

    expect(result.status).toBe("Gaps present")
    expect(result.tone).toBe("warning")
    expect(result.description).toBe("3 gaps across 2 active segments.")
  })

  it("warns when no active segments are recorded", () => {
    const result = signal(createCoverage({ gapCount: 0, segmentCount: 0, segments: [] }), "gapsSegments")

    expect(result.status).toBe("No segments")
    expect(result.tone).toBe("warning")
    expect(result.description).toBe("No active coverage segments are recorded; gaps: 0.")
  })

  it("always includes metadata safety as info", () => {
    const result = signal(createCoverage({ metadata: {} }), "metadataSafety")

    expect(result.status).toBe("Sanitized")
    expect(result.tone).toBe("info")
    expect(result.description).toContain("Catalog metadata is sanitized and read-only")
  })

  it("accepts the common preflight coverage shape", () => {
    const coverage: DatasetQualitySignalCoverageInput = {
      healthStatus: "healthy",
      coveredStartAt: "2026-01-01T00:00:00Z",
      coveredEndAt: "2026-01-07T00:00:00Z",
      segmentCount: 1,
      gapCount: 0,
    }

    const result = buildDatasetQualitySignals(coverage)

    expect(result.map((candidate) => candidate.id)).toEqual([
      "health",
      "coverageRange",
      "gapsSegments",
      "metadataSafety",
    ])
    expect(result.find((candidate) => candidate.id === "health")).toMatchObject({
      status: "Healthy",
      tone: "ok",
    })
  })
})
