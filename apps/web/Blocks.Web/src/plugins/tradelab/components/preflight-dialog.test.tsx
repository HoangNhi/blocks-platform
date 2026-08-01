// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import type { TradeLabPreflightResult } from "../types"
import { PreflightDialog } from "./preflight-dialog"

const preflight: TradeLabPreflightResult = {
  exchange: "binance",
  symbol: "BTCUSDT",
  timeframe: "1h",
  datasetKey: "binance:BTCUSDT:1h",
  outcome: "ready",
  action: null,
  requestedStartAt: "2024-01-01T00:00:00Z",
  requestedEndAt: "2024-02-01T00:00:00Z",
  activeJobId: null,
  activeJobType: null,
  repairStartAt: null,
  repairEndAt: null,
  missingSegments: [],
  reasons: [],
  coverage: null,
  sourceBlocked: false,
  sourceSummary: [],
  provenanceBlocked: false,
  provenanceReasonCode: null,
}

describe("PreflightDialog", () => {
  it("shows exact runtime and risk payload before confirm", () => {
    render(
      <PreflightDialog
        open
        preflight={preflight}
        payloadSummary={{
          strategyVersion: "v3 abc123ef",
          exchange: "binance",
          symbol: "BTCUSDT",
          timeframe: "1h",
          startAt: "2024-01-01T00:00:00Z",
          endAt: "2024-02-01T00:00:00Z",
          initialEquity: 100,
          feeBps: 10,
          slippageBps: 5,
          maxOrderPercent: 10,
          maxPositionPercent: 100,
          maxDrawdownPercent: 25,
          minNotional: 10,
          stepSize: 0.001,
          tickSize: 0.01,
        }}
        readinessLevel="ready"
        readinessMessages={[]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText("Final payload")).toBeTruthy()
    expect(screen.getByText("Initial equity")).toBeTruthy()
    expect(screen.getByText("100")).toBeTruthy()
    expect((screen.getByRole("button", { name: /run backtest/i }) as HTMLButtonElement).disabled).toBe(false)
  })

  it("disables confirm when readiness is blocked", () => {
    render(
      <PreflightDialog
        open
        preflight={preflight}
        payloadSummary={null}
        readinessLevel="blocked"
        readinessMessages={["Rounded quantity is zero. Increase max order size, lower step size, or choose a lower-priced symbol."]}
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect((screen.getByRole("button", { name: /blocked/i }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("renders sources and disables run button when preflight is blocked by provenance", () => {
    render(
      <PreflightDialog
        open
        preflight={{
          ...preflight,
          outcome: "blocked",
          provenanceBlocked: true,
          provenanceReasonCode: "dataset_contains_fixture_rows",
          sourceSummary: [
            { source: "tradelab-local-fill-smoke-fixture", rowCount: 3 }
          ],
        }}
        payloadSummary={null}
        readinessLevel="blocked"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText("Sources")).toBeTruthy()
    expect(screen.getByText("tradelab-local-fill-smoke-fixture (3)")).toBeTruthy()
    expect((screen.getByRole("button", { name: /blocked/i }) as HTMLButtonElement).disabled).toBe(true)
  })
})
