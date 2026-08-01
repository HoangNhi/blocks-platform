import { describe, expect, it } from "vitest"

import { buildDatasetReadinessGate } from "./dataset-readiness-gate"
import type { TradeLabPreflightResult, TradeLabRunPipeline } from "../types"

function createPreflight(overrides: Partial<TradeLabPreflightResult> = {}): TradeLabPreflightResult {
  return {
    datasetKey: "binance:BTCUSDT:1h",
    exchange: "binance",
    symbol: "BTCUSDT",
    timeframe: "1h",
    requestedStartAt: "2026-01-01T00:00:00Z",
    requestedEndAt: "2026-01-07T00:00:00Z",
    outcome: "ready",
    action: null,
    reasons: [],
    coverage: {
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
      segments: [],
      metadata: {},
    },
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

function createPipeline(overrides: Partial<TradeLabRunPipeline> = {}): TradeLabRunPipeline {
  return {
    run: {
      id: "run-1",
      botId: "bot-1",
      strategyId: "strategy-1",
      strategyVersionId: "version-1",
      runType: "backtest",
      status: "running",
      pipelineStatus: "running",
      exchange: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      startAt: "2026-01-01T00:00:00Z",
      endAt: "2026-01-07T00:00:00Z",
      startedAt: "2026-01-01T00:00:00Z",
      finishedAt: null,
      dataJobId: null,
      errorMessage: null,
      createdAt: "2026-01-01T00:00:00Z",
      createdBy: "codex",
    },
    preflight: null,
    dataJob: null,
    backtestJob: null,
    status: "running",
    message: null,
    ...overrides,
  }
}

describe("buildDatasetReadinessGate", () => {
  it("marks missing preflight as not checked with no signals", () => {
    const result = buildDatasetReadinessGate({ preflight: null, pipeline: null })

    expect(result).toMatchObject({
      status: "not_checked",
      label: "Not checked",
      tone: "info",
      reason: "not_checked",
      description: "Run preflight first.",
    })
    expect(result.signals).toEqual([])
  })

  it("marks ready preflight as ready and includes quality signals", () => {
    const result = buildDatasetReadinessGate({ preflight: createPreflight(), pipeline: null })

    expect(result).toMatchObject({
      status: "ready",
      label: "Ready",
      tone: "ok",
      reason: "ready",
      description: "Dataset coverage and quality signals are ready for the current target.",
    })
    expect(result.signals.map((signal) => signal.id)).toEqual([
      "health",
      "coverageRange",
      "gapsSegments",
      "metadataSafety",
    ])
  })

  it("prioritizes runtime error as blocked", () => {
    const result = buildDatasetReadinessGate({
      preflight: createPreflight({ outcome: "blocked" }),
      pipeline: createPipeline({ status: "failed", message: "Pipeline failed." }),
      runtimeErrorMessage: "Data job failed.",
    })

    expect(result).toMatchObject({
      status: "blocked",
      label: "Blocked",
      tone: "danger",
      reason: "runtime_error",
      description: "Runtime error blocks reliable dataset use.",
    })
  })

  it("marks failed pipeline as blocked", () => {
    const result = buildDatasetReadinessGate({
      preflight: createPreflight(),
      pipeline: createPipeline({ status: "failed", message: "Pipeline failed." }),
    })

    expect(result).toMatchObject({
      status: "blocked",
      reason: "pipeline_failed",
      description: "The latest run pipeline failed before dataset readiness could be trusted.",
    })
  })

  it("marks blocked preflight as blocked", () => {
    const result = buildDatasetReadinessGate({
      preflight: createPreflight({ outcome: "blocked" }),
      pipeline: null,
    })

    expect(result).toMatchObject({
      status: "blocked",
      reason: "preflight_blocked",
    })
  })

  it("marks blocked coverage as blocked", () => {
    const result = buildDatasetReadinessGate({
      preflight: createPreflight({
        coverage: {
          ...createPreflight().coverage!,
          healthStatus: "blocked",
        },
      }),
      pipeline: null,
    })

    expect(result).toMatchObject({
      status: "blocked",
      reason: "coverage_blocked",
    })
  })

  it("marks missing segments as attention", () => {
    const result = buildDatasetReadinessGate({
      preflight: createPreflight({
        missingSegments: [{ startAt: "2026-01-02T00:00:00Z", endAt: "2026-01-02T01:00:00Z", kind: "internal" }],
      }),
      pipeline: null,
    })

    expect(result).toMatchObject({
      status: "attention",
      label: "Attention",
      tone: "warning",
      reason: "missing_segments",
      description: "Dataset has missing windows before the current target can be treated as fully ready.",
    })
  })

  it("marks preflight needs fill as attention", () => {
    const result = buildDatasetReadinessGate({
      preflight: createPreflight({ outcome: "needs_fill" }),
      pipeline: null,
    })

    expect(result).toMatchObject({
      status: "attention",
      reason: "preflight_needs_fill",
    })
  })

  it("marks preflight needs repair as attention", () => {
    const result = buildDatasetReadinessGate({
      preflight: createPreflight({ outcome: "needs_repair" }),
      pipeline: null,
    })

    expect(result).toMatchObject({
      status: "attention",
      reason: "preflight_needs_repair",
    })
  })

  it("marks warning quality signals as attention", () => {
    const result = buildDatasetReadinessGate({
      preflight: createPreflight({
        coverage: {
          ...createPreflight().coverage!,
          healthStatus: "incomplete",
        },
      }),
      pipeline: null,
    })

    expect(result).toMatchObject({
      status: "attention",
      reason: "quality_signal_warning",
      description: "Dataset quality signals need attention before relying on this run.",
    })
  })

  it("keeps signals empty when coverage is null", () => {
    const result = buildDatasetReadinessGate({
      preflight: createPreflight({ coverage: null }),
      pipeline: null,
    })

    expect(result).toMatchObject({
      status: "ready",
      reason: "ready",
    })
    expect(result.signals).toEqual([])
  })
})
