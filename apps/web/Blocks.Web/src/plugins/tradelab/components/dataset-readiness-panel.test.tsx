// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { describe, expect, it, vi } from "vitest"

import { DatasetReadinessPanel } from "./dataset-readiness-panel"
import type { TradeLabDatasetFillPreview, TradeLabPreflightResult, TradeLabRunPipeline, TradeLabRuntimeConfig } from "../types"

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
    coverage: {
      datasetKey: "binance:BTCUSDT:1h",
      exchange: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      healthStatus: "healthy",
      earliestOpenTime: "2026-01-01T00:00:00Z",
      latestOpenTime: "2026-01-02T00:00:00Z",
      coveredStartAt: "2026-01-01T00:00:00Z",
      coveredEndAt: "2026-01-02T00:00:00Z",
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
      endAt: "2026-01-02T00:00:00Z",
      startedAt: "2026-01-02T00:00:00Z",
      finishedAt: null,
      dataJobId: "job-12345678",
      errorMessage: null,
      createdAt: "2026-01-02T00:00:00Z",
      createdBy: "codex",
    },
    preflight: null,
    dataJob: null,
    backtestJob: {},
    status: "running",
    message: "Running",
    ...overrides,
  }
}

function createFillPreview(overrides: Partial<TradeLabDatasetFillPreview> = {}): TradeLabDatasetFillPreview {
  return {
    previewId: "preview-1",
    generatedAt: "2026-05-17T00:00:00Z",
    requestFingerprint: "fingerprint-1",
    datasetKey: "binance:BTCUSDT:1h",
    exchange: "binance",
    symbol: "BTCUSDT",
    timeframe: "1h",
    requestedRange: {
      startAt: "2026-01-01T00:00:00Z",
      endAt: "2026-01-02T00:00:00Z",
    },
    coverageStatus: "partial",
    gapCount: 1,
    estimatedRows: 24,
    blockedReasons: [],
    safetyStatus: "preview_only",
    missingRanges: [],
    activeJobId: null,
    activeJobType: null,
    ...overrides,
  }
}

describe("DatasetReadinessPanel", () => {
  it("shows runtime target and not checked state before preflight", () => {
    render(<DatasetReadinessPanel preflight={null} pipeline={null} runtimeConfig={runtimeConfig} />)

    expect(screen.getByText("Dataset readiness")).toBeTruthy()
    expect(screen.getAllByText("Not checked").length).toBeGreaterThan(0)
    expect(screen.getByText("Run preflight to inspect dataset coverage.")).toBeTruthy()
    expect(screen.getByText("BTCUSDT")).toBeTruthy()
    expect(screen.getByText("1h")).toBeTruthy()
    expect(screen.getAllByText("N/A").length).toBeGreaterThan(0)
  })

  it("shows ready state with coverage summary", () => {
    render(<DatasetReadinessPanel preflight={createPreflight()} pipeline={null} runtimeConfig={runtimeConfig} />)

    expect(screen.getAllByText("Ready").length).toBeGreaterThan(0)
    expect(screen.getByText("binance:BTCUSDT:1h")).toBeTruthy()
    expect(screen.getByText("healthy")).toBeTruthy()
    expect(screen.getByText("1")).toBeTruthy()
    expect(screen.getAllByText("0").length).toBeGreaterThan(0)
  })

  it("shows needs fill with only the first three missing windows", () => {
    render(
      <DatasetReadinessPanel
        runtimeConfig={runtimeConfig}
        pipeline={null}
        preflight={createPreflight({
          outcome: "needs_fill",
          action: "fill",
          missingSegments: [
            { startAt: "2026-01-01T00:00:00Z", endAt: "2026-01-01T01:00:00Z", kind: "head" },
            { startAt: "2026-01-01T03:00:00Z", endAt: "2026-01-01T04:00:00Z", kind: "internal" },
            { startAt: "2026-01-01T06:00:00Z", endAt: "2026-01-01T07:00:00Z", kind: "internal" },
            { startAt: "2026-01-01T09:00:00Z", endAt: "2026-01-01T10:00:00Z", kind: "tail" },
          ],
        })}
      />,
    )

    expect(screen.getByText("Needs fill")).toBeTruthy()
    expect(screen.getByText("4")).toBeTruthy()
    expect(screen.getByText(/head:/)).toBeTruthy()
    expect(screen.getAllByText(/internal:/).length).toBe(2)
    expect(screen.queryByText(/tail:/)).toBeNull()
    expect(screen.getByText("+1 more")).toBeTruthy()
  })

  it("shows needs repair for suspect coverage", () => {
    render(
      <DatasetReadinessPanel
        runtimeConfig={runtimeConfig}
        pipeline={null}
        preflight={createPreflight({
          outcome: "ready",
          coverage: {
            ...createPreflight().coverage!,
            healthStatus: "suspect",
            gapCount: 2,
          },
        })}
      />,
    )

    expect(screen.getByText("Needs repair")).toBeTruthy()
    expect(screen.getByText("suspect")).toBeTruthy()
    expect(screen.getByText("2")).toBeTruthy()
  })

  it("shows blocked when runtime error is present", () => {
    render(
      <DatasetReadinessPanel
        runtimeConfig={runtimeConfig}
        preflight={createPreflight()}
        pipeline={createPipeline()}
        runtimeErrorMessage="Data job failed."
      />,
    )

    expect(screen.getAllByText("Blocked").length).toBeGreaterThan(0)
    expect(screen.getByText("Data job failed.")).toBeTruthy()
  })

  it("shows active job from preflight", () => {
    render(
      <DatasetReadinessPanel
        runtimeConfig={runtimeConfig}
        pipeline={null}
        preflight={createPreflight({
          activeJobId: "12345678-90ab-cdef-1234-567890abcdef",
          activeJobType: "fill",
        })}
      />,
    )

    expect(screen.getByText("fill - 12345678")).toBeTruthy()
  })

  it("links to Dataset Catalog when catalog href is available", () => {
    render(
      <MemoryRouter>
        <DatasetReadinessPanel
          preflight={createPreflight()}
          pipeline={null}
          runtimeConfig={runtimeConfig}
          datasetCatalogHref="/plugins/tradelab/datasets?datasetKey=binance%3ABTCUSDT%3A1h"
        />
      </MemoryRouter>,
    )

    const link = screen.getByRole("link", { name: /open in dataset catalog/i })
    expect(link.getAttribute("href")).toBe("/plugins/tradelab/datasets?datasetKey=binance%3ABTCUSDT%3A1h")
  })

  it("shows a disabled Dataset Catalog action when catalog href is unavailable", () => {
    render(
      <DatasetReadinessPanel
        preflight={null}
        pipeline={null}
        runtimeConfig={{ ...runtimeConfig, symbol: "", timeframe: "" }}
        datasetCatalogHref={null}
      />,
    )

    const button = screen.getByRole("button", { name: /open in dataset catalog unavailable/i }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(button.getAttribute("title")).toBe("Dataset catalog needs symbol and timeframe.")
  })

  it("shows readiness gate and quality signals for ready coverage", () => {
    render(<DatasetReadinessPanel preflight={createPreflight()} pipeline={null} runtimeConfig={runtimeConfig} />)

    const gate = screen.getByLabelText("Readiness gate")
    expect(within(gate).getByText("Readiness gate")).toBeTruthy()
    expect(within(gate).getByText("Reason: ready")).toBeTruthy()
    expect(
      within(gate).getByText("Dataset coverage and quality signals are ready for the current target."),
    ).toBeTruthy()

    const signals = within(gate).getByLabelText("Quality signals")
    expect(within(signals).getByText("Health")).toBeTruthy()
    expect(within(signals).getByText("Coverage range")).toBeTruthy()
    expect(within(signals).getByText("Gaps and segments")).toBeTruthy()
    expect(within(signals).getByText("Metadata safety")).toBeTruthy()
  })

  it("shows attention gate when missing windows exist", () => {
    render(
      <DatasetReadinessPanel
        runtimeConfig={runtimeConfig}
        pipeline={null}
        preflight={createPreflight({
          outcome: "needs_fill",
          missingSegments: [{ startAt: "2026-01-01T03:00:00Z", endAt: "2026-01-01T04:00:00Z", kind: "internal" }],
        })}
      />,
    )

    const gate = screen.getByLabelText("Readiness gate")
    expect(within(gate).getByText("Attention")).toBeTruthy()
    expect(within(gate).getByText("Reason: missing_segments")).toBeTruthy()
    expect(
      within(gate).getByText("Dataset has missing windows before the current target can be treated as fully ready."),
    ).toBeTruthy()
  })

  it("shows blocked gate when runtime error is present", () => {
    render(
      <DatasetReadinessPanel
        runtimeConfig={runtimeConfig}
        preflight={createPreflight()}
        pipeline={createPipeline()}
        runtimeErrorMessage="Data job failed."
      />,
    )

    const gate = screen.getByLabelText("Readiness gate")
    expect(within(gate).getByText("Blocked")).toBeTruthy()
    expect(within(gate).getByText("Reason: runtime_error")).toBeTruthy()
    expect(within(gate).getByText("Runtime error blocks reliable dataset use.")).toBeTruthy()
  })

  it("shows not checked gate without fake quality signals before preflight", () => {
    render(<DatasetReadinessPanel preflight={null} pipeline={null} runtimeConfig={runtimeConfig} />)

    const gate = screen.getByLabelText("Readiness gate")
    expect(within(gate).getByText("Not checked")).toBeTruthy()
    expect(within(gate).getByText("Reason: not_checked")).toBeTruthy()
    expect(within(gate).getByText("Run preflight first.")).toBeTruthy()
    expect(within(gate).queryByLabelText("Quality signals")).toBeNull()
  })

  it("shows freshness and gap signals for preflight coverage", () => {
    render(<DatasetReadinessPanel preflight={createPreflight()} pipeline={null} runtimeConfig={runtimeConfig} />)

    const section = screen.getByLabelText("Freshness and gaps")
    expect(within(section).getByText("Freshness & gaps")).toBeTruthy()
    expect(within(section).getByText("Freshness")).toBeTruthy()
    expect(within(section).getByText("Check age")).toBeTruthy()
    expect(within(section).getByText("Gap severity")).toBeTruthy()
    expect(within(section).getByText("Coverage end")).toBeTruthy()
    expect(within(section).getByText("Reason: fresh")).toBeTruthy()
    expect(within(section).getByText("Reason: missing_last_checked_at")).toBeTruthy()
    expect(within(section).getByText("Reason: no_gaps")).toBeTruthy()
    expect(within(section).getByText("Reason: coverage_end_available")).toBeTruthy()
  })

  it("shows unknown freshness signals without preflight coverage while preserving the not checked gate", () => {
    render(<DatasetReadinessPanel preflight={null} pipeline={null} runtimeConfig={runtimeConfig} />)

    const gate = screen.getByLabelText("Readiness gate")
    expect(within(gate).getByText("Reason: not_checked")).toBeTruthy()

    const section = screen.getByLabelText("Freshness and gaps")
    expect(within(section).getByText("Reason: missing_freshness_timestamps")).toBeTruthy()
    expect(within(section).getByText("Reason: missing_last_checked_at")).toBeTruthy()
    expect(within(section).getByText("Reason: missing_gap_counts")).toBeTruthy()
    expect(within(section).getByText("Reason: missing_coverage_end")).toBeTruthy()
  })

  it("shows stale and many-gap reasons while preserving the existing readiness gate policy", () => {
    render(
      <DatasetReadinessPanel
        runtimeConfig={runtimeConfig}
        pipeline={null}
        preflight={createPreflight({
          coverage: {
            ...createPreflight().coverage!,
            latestOpenTime: "2025-12-31T00:00:00Z",
            coveredEndAt: "2025-12-31T00:00:00Z",
            gapCount: 5,
            segmentCount: 4,
          },
        })}
      />,
    )

    const gate = screen.getByLabelText("Readiness gate")
    expect(within(gate).getByText("Attention")).toBeTruthy()
    expect(within(gate).getByText("Reason: quality_signal_warning")).toBeTruthy()

    const section = screen.getByLabelText("Freshness and gaps")
    expect(within(section).getByText("Reason: stale")).toBeTruthy()
    expect(within(section).getByText("Reason: many_gaps")).toBeTruthy()
  })

  it("shows preview fill button and calls preview action without mutation CTA", () => {
    const onPreviewFillPlan = vi.fn()
    render(
      <MemoryRouter>
        <DatasetReadinessPanel
          preflight={createPreflight()}
          pipeline={null}
          runtimeConfig={runtimeConfig}
          fillPreview={createFillPreview()}
          onPreviewFillPlan={onPreviewFillPlan}
        />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole("button", { name: "Preview fill plan" }))

    expect(onPreviewFillPlan).toHaveBeenCalledTimes(1)
    const summary = screen.getByLabelText("Dataset fill preview")
    expect(within(summary).getByText("Preview only")).toBeTruthy()
    expect(within(summary).getByText("binance:BTCUSDT:1h")).toBeTruthy()
    expect(within(summary).getByText("partial")).toBeTruthy()
    expect(within(summary).getByText("24")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Repair|Recover|Import|Retry fill/i })).toBeNull()
  })

  it("shows preview loading and error states", () => {
    render(
      <DatasetReadinessPanel
        preflight={createPreflight()}
        pipeline={null}
        runtimeConfig={runtimeConfig}
        fillPreviewError="Preview failed."
        isPreviewingFillPlan
        onPreviewFillPlan={vi.fn()}
      />,
    )

    expect((screen.getByRole("button", { name: "Previewing..." }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText("Preview failed.")).toBeTruthy()
  })

  it("shows confirm local fill controls only for fillable preview", () => {
    const onConfirmLocalFill = vi.fn()
    const onLocalFillConfirmChange = vi.fn()
    render(
      <MemoryRouter>
        <DatasetReadinessPanel
          preflight={createPreflight()}
          pipeline={null}
          runtimeConfig={runtimeConfig}
          fillPreview={createFillPreview({
            missingRanges: [{ startAt: "2026-01-01T00:00:00Z", endAt: "2026-01-01T02:00:00Z", kind: "head" }],
          })}
          isLocalFillConfirmed={false}
          onLocalFillConfirmChange={onLocalFillConfirmChange}
          onConfirmLocalFill={onConfirmLocalFill}
        />
      </MemoryRouter>,
    )

    const checkbox = screen.getByRole("checkbox", {
      name: /I understand this writes missing market candles in local\/dev only/i,
    })
    expect(checkbox).toBeTruthy()
    const button = screen.getByRole("button", { name: "Confirm local fill" }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.click(checkbox)
    expect(onLocalFillConfirmChange).toHaveBeenCalledWith(true)
  })

  it("blocks confirm when preview has active job reason", () => {
    render(
      <DatasetReadinessPanel
        preflight={createPreflight()}
        pipeline={null}
        runtimeConfig={runtimeConfig}
        fillPreview={createFillPreview({
          blockedReasons: ["active_job_exists"],
          activeJobId: "12345678-90ab-cdef-1234-567890abcdef",
          activeJobType: "fill",
          missingRanges: [{ startAt: "2026-01-01T00:00:00Z", endAt: "2026-01-01T02:00:00Z", kind: "head" }],
        })}
        isLocalFillConfirmed
        onLocalFillConfirmChange={vi.fn()}
        onConfirmLocalFill={vi.fn()}
      />,
    )

    const button = screen.getByRole("button", { name: "Confirm local fill" }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(screen.getByText("Reason: active_job_exists")).toBeTruthy()
  })

  it("shows local fill success summary and keeps dangerous actions absent", () => {
    render(
      <DatasetReadinessPanel
        preflight={createPreflight()}
        pipeline={null}
        runtimeConfig={runtimeConfig}
        fillPreview={createFillPreview({
          missingRanges: [{ startAt: "2026-01-01T00:00:00Z", endAt: "2026-01-01T02:00:00Z", kind: "head" }],
        })}
        localFillResult={{
          jobId: "job-1",
          datasetKey: "binance:BTCUSDT:1h",
          status: "completed",
          safetyStatus: "local_dev_fill_only",
          requestedRange: { startAt: "2026-01-01T00:00:00Z", endAt: "2026-01-02T00:00:00Z" },
          rangesFilled: [
            {
              startAt: "2026-01-01T00:00:00Z",
              endAt: "2026-01-01T02:00:00Z",
              kind: "head",
              rowsFetched: 3,
              rowsInserted: 2,
              rowsSkippedExisting: 1,
            },
          ],
          rowsFetched: 3,
          rowsInserted: 2,
          rowsSkippedExisting: 1,
          blockedReasons: [],
          previewId: "preview-1",
          requestFingerprint: "fingerprint-1",
        }}
      />,
    )

    const summary = screen.getByLabelText("Local dataset fill result")
    expect(within(summary).getByText("completed")).toBeTruthy()
    expect(within(summary).getByText("2")).toBeTruthy()
    expect(within(summary).getByText("1")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Repair|Recover|Replace|Import|Run paper|Order/i })).toBeNull()
  })

  it("keeps fill preview visible and shows inline local fill error", () => {
    render(
      <MemoryRouter>
        <DatasetReadinessPanel
          preflight={createPreflight()}
          pipeline={null}
          runtimeConfig={runtimeConfig}
          fillPreview={createFillPreview({
            missingRanges: [{ startAt: "2026-01-01T00:00:00Z", endAt: "2026-01-01T02:00:00Z", kind: "head" }],
          })}
          localFillError="Binance public klines rate limit was reached. (dataset_fill_provider_rate_limited, providerStatus=429)"
          isLocalFillConfirmed={false}
          onLocalFillConfirmChange={vi.fn()}
          onConfirmLocalFill={vi.fn()}
        />
      </MemoryRouter>,
    )

    expect(screen.getByLabelText("Dataset fill preview")).toBeTruthy()
    expect(screen.getByText("Binance public klines rate limit was reached. (dataset_fill_provider_rate_limited, providerStatus=429)")).toBeTruthy()
    const checkbox = screen.getByRole("checkbox", {
      name: /I understand this writes missing market candles in local\/dev only/i,
    }) as HTMLInputElement
    const button = screen.getByRole("button", { name: "Confirm local fill" }) as HTMLButtonElement
    expect(checkbox.checked).toBe(false)
    expect(button.disabled).toBe(true)
    expect(screen.queryByRole("button", { name: /Repair|Recover|Replace|Import|Retry fill|Run paper|Order/i })).toBeNull()
  })

  it("queues background fill only after local confirmation", () => {
    const onQueueBackgroundFill = vi.fn()
    const onLocalFillConfirmChange = vi.fn()
    render(
      <MemoryRouter>
        <DatasetReadinessPanel
          preflight={createPreflight()}
          pipeline={null}
          runtimeConfig={runtimeConfig}
          fillPreview={createFillPreview({
            missingRanges: [{ startAt: "2026-01-01T03:00:00Z", endAt: "2026-01-01T06:00:00Z", kind: "tail" }],
          })}
          isLocalFillConfirmed={false}
          onLocalFillConfirmChange={onLocalFillConfirmChange}
          onQueueBackgroundFill={onQueueBackgroundFill}
        />
      </MemoryRouter>,
    )

    const queueButton = screen.getByRole("button", { name: "Queue background fill" }) as HTMLButtonElement
    expect(queueButton.disabled).toBe(true)
    fireEvent.click(screen.getByRole("checkbox", { name: /I understand this writes missing market candles in local\/dev only/i }))
    expect(onLocalFillConfirmChange).toHaveBeenCalledWith(true)
  })

  it("shows queued result and inline enqueue error without dangerous actions", () => {
    render(
      <MemoryRouter>
        <DatasetReadinessPanel
          preflight={createPreflight()}
          pipeline={null}
          runtimeConfig={runtimeConfig}
          fillPreview={createFillPreview({
            missingRanges: [{ startAt: "2026-01-01T03:00:00Z", endAt: "2026-01-01T06:00:00Z", kind: "tail" }],
          })}
          enqueueFillResult={{
            jobId: "job-queued-1",
            datasetKey: "binance:BTCUSDT:1h",
            status: "queued",
            safetyStatus: "queued_local_dev",
            requestedRange: { startAt: "2026-01-01T00:00:00Z", endAt: "2026-01-01T06:00:00Z" },
            missingRangeCount: 1,
            previewId: "preview-1",
            requestFingerprint: "fingerprint-1",
          }}
          enqueueFillError="A background fill job is already active for this dataset range. (dataset_fill_job_already_active)"
          isLocalFillConfirmed
          onQueueBackgroundFill={vi.fn()}
        />
      </MemoryRouter>,
    )

    expect(screen.getByLabelText("Background fill enqueue result").textContent).toContain("queued")
    expect(screen.getByText("A background fill job is already active for this dataset range. (dataset_fill_job_already_active)")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /Cancel|Retry|Recover|Repair|Replace|Run paper|Order/i })).toBeNull()
  })

  it("renders sources when preflight is blocked by provenance", () => {
    render(
      <MemoryRouter>
        <DatasetReadinessPanel
          runtimeConfig={runtimeConfig}
          pipeline={null}
          preflight={createPreflight({
            outcome: "blocked",
            provenanceBlocked: true,
            provenanceReasonCode: "dataset_contains_fixture_rows",
            sourceSummary: [
              { source: "tradelab-local-fill-smoke-fixture", rowCount: 3 }
            ],
          })}
        />
      </MemoryRouter>,
    )

    expect(screen.getByText("Sources")).toBeTruthy()
    expect(screen.getByText("tradelab-local-fill-smoke-fixture (3)")).toBeTruthy()
  })
})
