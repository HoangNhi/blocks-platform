// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { StrategyLabEvaluatePanel } from "./strategy-lab-evaluate-panel"

describe("StrategyLabEvaluatePanel", () => {
  it("renders run summary and scorecard before chart, trade evidence, metrics, and logs", () => {
    render(
      <StrategyLabEvaluatePanel
        runSummary={<div>run-summary</div>}
        scorecard={<div>scorecard</div>}
        chart={<div>chart</div>}
        tradeBreakdown={<div>trade-breakdown</div>}
        tradeDetail={<div>trade-detail</div>}
        equity={<div>equity</div>}
        metrics={<div>metrics</div>}
        logs={<div>logs</div>}
      />,
    )

    const region = screen.getByLabelText("Strategy Lab evaluation")
    expect(region.textContent).toMatch(/run-summary.*scorecard.*chart.*trade-breakdown.*trade-detail.*equity.*metrics.*logs/s)
  })
})
