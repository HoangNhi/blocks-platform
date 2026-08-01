import { describe, expect, it } from "vitest"

import { buildFuturesEvidenceSummary } from "./tradelab-futures-evidence"

describe("buildFuturesEvidenceSummary", () => {
  it("builds a passing summary from a completed futures run payload set", () => {
    const summary = buildFuturesEvidenceSummary({
      fixtureName: "TradeLab Local Fill Smoke",
      expectedDefaultLeverage: 10,
      startHttpStatus: 201,
      runHttpStatus: 200,
      analysisHttpStatus: 200,
      startRequestBody: {
        exchange: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        start_at: "2026-01-01T00:00:00Z",
        end_at: "2026-01-02T00:00:00Z",
        initial_equity: 1000,
        fee_bps: 0,
        slippage_bps: 0,
      },
      startResponseBody: {
        Success: true,
        Data: {
          run: {
            id: "run-123",
            status: "queued",
            pipeline_status: "queued",
          },
          status: "queued",
        },
      },
      runPayload: {
        Success: true,
        Data: {
          id: "run-123",
          status: "completed",
          pipeline_status: "completed",
          runtime_config: {
            marketType: "USD_M_FUTURES",
            defaultLeverage: 10,
            symbol: "BTCUSDT",
            timeframe: "1h",
          },
        },
      },
      analysisPayload: {
        Success: true,
        Data: {
          runtimeConfig: {
            marketType: "USD_M_FUTURES",
            defaultLeverage: 10,
            symbol: "BTCUSDT",
            timeframe: "1h",
          },
          datasetContext: {
            datasetKey: "binance:BTCUSDT:1h",
          },
          positions: [
            {
              id: "pos-1",
              symbol: "BTCUSDT",
              side: "LONG",
              leverage: 10,
              status: "CLOSED",
            },
          ],
          totalFundingFeePaid: 12.5,
          futuresSummary: {
            liquidationCount: 1,
            maxMarginUsagePct: 72,
            maxMaintenanceMarginPct: 19.5,
          },
        },
      },
      screenshotPaths: [
        "smoke-artifacts/tradelab-futures-e2e/01-futures-configured.png",
        "smoke-artifacts/tradelab-futures-e2e/02-futures-run-completed.png",
      ],
    })

    expect(summary.pass).toBe(true)
    expect(summary.runId).toBe("run-123")
    expect(summary.finalRunStatus).toBe("completed")
    expect(summary.finalPipelineStatus).toBe("completed")
    expect(summary.fixtureName).toBe("TradeLab Local Fill Smoke")
    expect(summary.persistedRuntimeConfig.marketType).toBe("USD_M_FUTURES")
    expect(summary.persistedRuntimeConfig.defaultLeverage).toBe(10)
    expect(summary.positionsCount).toBe(1)
    expect(summary.hasFuturesSummary).toBe(true)
    expect(summary.issues).toEqual([])
  })

  it("flags spot fallback when the analysis payload lacks futures markers", () => {
    const summary = buildFuturesEvidenceSummary({
      fixtureName: "TradeLab Local Fill Smoke",
      expectedDefaultLeverage: 10,
      startHttpStatus: 201,
      runHttpStatus: 200,
      analysisHttpStatus: 200,
      startRequestBody: {
        exchange: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        start_at: "2026-01-01T00:00:00Z",
        end_at: "2026-01-02T00:00:00Z",
        initial_equity: 1000,
        fee_bps: 0,
        slippage_bps: 0,
      },
      startResponseBody: {
        Success: true,
        Data: {
          run: {
            id: "run-spot-fallback",
            status: "queued",
            pipeline_status: "queued",
          },
        },
      },
      runPayload: {
        Success: true,
        Data: {
          id: "run-spot-fallback",
          status: "completed",
          pipeline_status: "completed",
          runtime_config: {
            marketType: "SPOT",
            defaultLeverage: 1,
            symbol: "BTCUSDT",
            timeframe: "1h",
          },
        },
      },
      analysisPayload: {
        Success: true,
        Data: {
          datasetContext: {
            datasetKey: "binance:BTCUSDT:1h",
          },
          positions: [],
          futuresSummary: null,
        },
      },
      screenshotPaths: [],
    })

    expect(summary.pass).toBe(false)
    expect(summary.issues).toContain("persisted runtimeConfig.marketType is not USD_M_FUTURES")
    expect(summary.issues).toContain("analysis payload does not expose futures positions or futures summary")
  })

  it("accepts the current backend start response contract when the launch returns HTTP 200", () => {
    const summary = buildFuturesEvidenceSummary({
      fixtureName: "TradeLab Local Fill Smoke",
      expectedDefaultLeverage: 10,
      startHttpStatus: 200,
      runHttpStatus: 200,
      analysisHttpStatus: 200,
      startRequestBody: {
        exchange: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        start_at: "2026-01-01T00:00:00Z",
        end_at: "2026-01-01T06:00:00Z",
        initial_equity: 1000,
        fee_bps: 10,
        slippage_bps: 1,
      },
      startResponseBody: {
        Success: true,
        Data: {
          run: {
            id: "run-200",
            status: "queued",
            pipeline_status: "queued",
          },
        },
      },
      runPayload: {
        Success: true,
        Data: {
          id: "run-200",
          status: "completed",
          pipeline_status: "completed",
          runtime_config: {
            marketType: "USD_M_FUTURES",
            defaultLeverage: 10,
            symbol: "BTCUSDT",
            timeframe: "1h",
          },
        },
      },
      analysisPayload: {
        Success: true,
        Data: {
          datasetContext: {
            datasetKey: "binance:BTCUSDT:1h",
          },
          positions: [],
          futuresSummary: {
            total_funding_fee_paid: 0,
          },
        },
      },
      screenshotPaths: [],
    })

    expect(summary.pass).toBe(true)
    expect(summary.issues).toEqual([])
  })

  it("flags persisted leverage mismatches against the configured futures run", () => {
    const summary = buildFuturesEvidenceSummary({
      fixtureName: "TradeLab Local Fill Smoke",
      expectedDefaultLeverage: 10,
      startHttpStatus: 200,
      runHttpStatus: 200,
      analysisHttpStatus: 200,
      startRequestBody: {
        exchange: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        start_at: "2026-01-01T00:00:00Z",
        end_at: "2026-01-01T06:00:00Z",
        initial_equity: 1000,
        fee_bps: 10,
        slippage_bps: 1,
      },
      startResponseBody: {
        Success: true,
        Data: {
          run: {
            id: "run-leverage-mismatch",
            status: "queued",
            pipeline_status: "queued",
          },
        },
      },
      runPayload: {
        Success: true,
        Data: {
          id: "run-leverage-mismatch",
          status: "completed",
          pipeline_status: "completed",
          runtime_config: {
            marketType: "USD_M_FUTURES",
            defaultLeverage: 1,
            symbol: "BTCUSDT",
            timeframe: "1h",
          },
        },
      },
      analysisPayload: {
        Success: true,
        Data: {
          datasetContext: {
            datasetKey: "binance:BTCUSDT:1h",
          },
          positions: [],
          futuresSummary: {
            total_funding_fee_paid: 0,
          },
        },
      },
      screenshotPaths: [],
    })

    expect(summary.pass).toBe(false)
    expect(summary.issues).toContain("persisted runtimeConfig.defaultLeverage 1 does not match expected 10")
  })
})
