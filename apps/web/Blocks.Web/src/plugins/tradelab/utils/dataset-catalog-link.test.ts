import { describe, expect, it } from "vitest"

import { buildDatasetCatalogHref } from "./dataset-catalog-link"
import type { TradeLabPreflightResult, TradeLabRuntimeConfig } from "../types"

const runtimeConfig: TradeLabRuntimeConfig = {
  exchange: "binance",
  symbol: "BTCUSDT",
  timeframe: "1h",
  startAt: "2026-01-01T00:00:00Z",
  endAt: "2026-01-02T00:00:00Z",
  initialEquity: 1000,
  feeBps: 0,
  slippageBps: 0,
}

function createPreflight(overrides: Partial<TradeLabPreflightResult> = {}): TradeLabPreflightResult {
  return {
    datasetKey: "binance:BTCUSDT:1h",
    exchange: "binance",
    symbol: "BTCUSDT",
    timeframe: "1h",
    requestedStartAt: "2026-01-01T00:00:00Z",
    requestedEndAt: "2026-01-02T00:00:00Z",
    outcome: "ready",
    action: null,
    reasons: [],
    coverage: null,
    missingSegments: [],
    repairStartAt: null,
    repairEndAt: null,
    activeJobId: null,
    activeJobType: null,
    sourceBlocked: false,
    sourceSummary: [],
    provenanceBlocked: false,
    provenanceReasonCode: null,
    ...overrides,
  }
}

describe("buildDatasetCatalogHref", () => {
  it("prefers preflight dataset key and includes preflight target range", () => {
    expect(buildDatasetCatalogHref(createPreflight(), runtimeConfig)).toBe(
      "/plugins/tradelab/datasets?datasetKey=binance%3ABTCUSDT%3A1h&requestedStartAt=2026-01-01T00%3A00%3A00Z&requestedEndAt=2026-01-02T00%3A00%3A00Z",
    )
  })

  it("falls back to symbol and timeframe before preflight exists and includes runtime target range", () => {
    expect(buildDatasetCatalogHref(null, runtimeConfig)).toBe(
      "/plugins/tradelab/datasets?symbol=BTCUSDT&timeframe=1h&requestedStartAt=2026-01-01T00%3A00%3A00Z&requestedEndAt=2026-01-02T00%3A00%3A00Z",
    )
  })

  it("returns null when symbol or timeframe is missing", () => {
    expect(buildDatasetCatalogHref(null, { ...runtimeConfig, symbol: "" })).toBeNull()
    expect(buildDatasetCatalogHref(null, { ...runtimeConfig, timeframe: "" })).toBeNull()
  })

  it("omits missing range params instead of adding empty values", () => {
    expect(
      buildDatasetCatalogHref(
        createPreflight({ requestedStartAt: " ", requestedEndAt: "" }),
        { ...runtimeConfig, startAt: "", endAt: "" },
      ),
    ).toBe("/plugins/tradelab/datasets?datasetKey=binance%3ABTCUSDT%3A1h")
  })

  it("trims values before building the URL", () => {
    expect(
      buildDatasetCatalogHref(
        createPreflight({
          datasetKey: "  binance:ETHUSDT:15m  ",
          requestedStartAt: "  2026-02-01T00:00:00Z  ",
          requestedEndAt: "  2026-02-07T00:00:00Z  ",
        }),
        { ...runtimeConfig, symbol: " ETHUSDT ", timeframe: " 15m " },
      ),
    ).toBe(
      "/plugins/tradelab/datasets?datasetKey=binance%3AETHUSDT%3A15m&requestedStartAt=2026-02-01T00%3A00%3A00Z&requestedEndAt=2026-02-07T00%3A00%3A00Z",
    )
  })
})
