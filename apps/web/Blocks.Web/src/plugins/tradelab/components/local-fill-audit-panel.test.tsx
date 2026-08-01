// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { LocalFillAuditPanel } from "./local-fill-audit-panel"
import type { TradeLabDatasetLocalFillAudit } from "../types"

function createAudit(overrides: Partial<TradeLabDatasetLocalFillAudit> = {}): TradeLabDatasetLocalFillAudit {
  return {
    datasetKey: "binance:BTCUSDT:1h",
    exchange: "binance",
    symbol: "BTCUSDT",
    timeframe: "1h",
    safetyStatus: "read_only",
    items: [],
    ...overrides,
  }
}

function createItem(overrides: Partial<TradeLabDatasetLocalFillAudit["items"][number]> = {}): TradeLabDatasetLocalFillAudit["items"][number] {
  return {
    jobId: "job-1",
    status: "completed",
    createdAt: "2026-01-01T00:00:00Z",
    finishedAt: "2026-01-01T00:01:00Z",
    requestedRange: { startAt: "2026-01-01T00:00:00Z", endAt: "2026-01-01T06:00:00Z", kind: null, metadata: {} },
    appliedRange: { startAt: "2026-01-01T01:00:00Z", endAt: "2026-01-01T06:00:00Z", kind: null, metadata: {} },
    rowsImported: 2,
    rowsFetched: 3,
    rowsInserted: 2,
    rowsSkippedExisting: 1,
    errorMessage: null,
    reasonCode: null,
    providerStatus: null,
    previewId: "preview-1",
    requestFingerprint: "fingerprint-1",
    missingRanges: [{ startAt: "2026-01-01T00:00:00Z", endAt: "2026-01-01T01:00:00Z", kind: "tail" }],
    rangeResults: [{ rowsInserted: 2 }],
    ...overrides,
  }
}

describe("LocalFillAuditPanel", () => {
  it("renders empty state", () => {
    render(<LocalFillAuditPanel audit={createAudit()} />)

    expect(screen.getByText("Local fill audit")).toBeTruthy()
    expect(screen.getByText("No local fill attempts for this dataset.")).toBeTruthy()
  })

  it("renders loading and error states", () => {
    render(<LocalFillAuditPanel audit={null} isLoading errorMessage="Unable to load local fill audit." />)

    expect(screen.getByText("Unable to load local fill audit.")).toBeTruthy()
  })

  it("renders completed row and expandable trace detail", () => {
    render(<LocalFillAuditPanel audit={createAudit({ items: [createItem()] })} />)

    expect(screen.getByText("completed")).toBeTruthy()
    expect(screen.getByText("2 rows inserted")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Toggle local fill audit job-1" }))
    expect(screen.getByText("Preview ID")).toBeTruthy()
    expect(screen.getByText("preview-1")).toBeTruthy()
    expect(screen.getByText("Request fingerprint")).toBeTruthy()
    expect(screen.getByText("fingerprint-1")).toBeTruthy()
    expect(screen.getByText("Rows skipped existing")).toBeTruthy()
    expect(screen.getByText("1")).toBeTruthy()
  })

  it("renders failed row with reason code and provider status wording", () => {
    render(
      <LocalFillAuditPanel
        audit={createAudit({
          items: [
            createItem({
              status: "failed",
              rowsImported: 0,
              rowsFetched: 0,
              rowsInserted: 0,
              rowsSkippedExisting: 0,
              errorMessage: "Binance public klines request failed.",
              reasonCode: "dataset_fill_provider_rate_limited",
              providerStatus: "429",
            }),
          ],
        })}
      />,
    )

    expect(screen.getByText("failed")).toBeTruthy()
    expect(screen.getByText("0 rows inserted")).toBeTruthy()
    expect(screen.getByText("Rate limited (429)")).toBeTruthy()
    expect(screen.getByText("dataset_fill_provider_rate_limited")).toBeTruthy()
  })

  it("calls refresh and keeps dangerous actions absent", () => {
    const onRefresh = vi.fn()
    render(<LocalFillAuditPanel audit={createAudit({ items: [createItem()] })} onRefresh={onRefresh} />)

    fireEvent.click(screen.getByRole("button", { name: "Refresh local fill audit" }))

    expect(onRefresh).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole("button", { name: /Retry|Repair|Recover|Replace|Import|Run paper|Run live|Order/i })).toBeNull()
    expect(within(screen.getByLabelText("Local fill audit attempts")).getByText("completed")).toBeTruthy()
  })
})
