// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { RunReadinessPanel } from "./run-readiness-panel"

const baseProps = {
  orderFeasibility: {
    level: "blocked" as const,
    maxOrderNotional: 10,
    estimatedQuantity: 0.000166,
    roundedQuantity: 0,
    roundedNotional: 0,
    messages: ["Rounded quantity is zero. Increase max order size, lower step size, or choose a lower-priced symbol."],
  },
  rangeGuidance: {
    level: "warning" as const,
    dayCount: 7,
    label: "1 week smoke" as const,
    messages: ["Range is useful for smoke testing, not monthly profit claims."],
  },
  runtimeSummary: "binance - BTCUSDT - 1h",
}

describe("RunReadinessPanel", () => {
  it("shows blocked sizing recovery copy", () => {
    render(<RunReadinessPanel {...baseProps} />)

    expect(screen.getByText("Blocked")).toBeTruthy()
    expect(screen.getByText("Max order notional")).toBeTruthy()
    expect(screen.getByText("Rounded quantity is zero. Increase max order size, lower step size, or choose a lower-priced symbol.")).toBeTruthy()
  })

  it("shows short range warning", () => {
    render(<RunReadinessPanel {...baseProps} />)

    expect(screen.getByText("1 week smoke")).toBeTruthy()
    expect(screen.getByText("Range is useful for smoke testing, not monthly profit claims.")).toBeTruthy()
  })
})
