// @vitest-environment jsdom
import { expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { FuturesResearchSummaryPanel } from "./futures-research-summary-panel"

it("renders futures funding, liquidation, and margin pressure summary", () => {
  render(
    <FuturesResearchSummaryPanel
      summary={{
        totalFundingFeePaid: 12.5,
        totalFundingFeeReceived: 0,
        liquidationCount: 1,
        longTrades: 2,
        shortTrades: 1,
        longWinRate: 50,
        shortWinRate: 100,
        avgLeverageUsed: 8.5,
        maxMarginUsagePct: 72,
        maxMaintenanceMarginPct: 19.5,
      }}
    />,
  )

  expect(screen.getByText("Funding paid")).toBeTruthy()
  expect(screen.getByText("12.50")).toBeTruthy()
  expect(screen.getByText("Liquidations")).toBeTruthy()
  expect(screen.getByText("1")).toBeTruthy()
  expect(screen.getByText("Max margin usage")).toBeTruthy()
  expect(screen.getByText("72.00%")).toBeTruthy()
})
