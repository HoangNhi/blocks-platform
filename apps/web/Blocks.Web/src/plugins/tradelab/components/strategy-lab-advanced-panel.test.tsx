// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { StrategyLabAdvancedPanel } from "./strategy-lab-advanced-panel"

describe("StrategyLabAdvancedPanel", () => {
  it("stays collapsed by default and reveals tabbed secondary tooling only after the user opens it", async () => {
    const user = userEvent.setup()

    render(
      <StrategyLabAdvancedPanel
        paperTab={<div>paper-tools</div>}
        assistedTestnetTab={<div>assisted-testnet</div>}
        assistedLiveTab={<div>assisted-live</div>}
        dataOpsTab={<div>data-ops</div>}
      />,
    )

    expect(screen.queryByText("paper-tools")).toBeNull()

    await user.click(screen.getByRole("button", { name: "Open advanced tools" }))
    expect(screen.getByRole("tab", { name: "Paper" })).toBeTruthy()
    expect(screen.getByText("paper-tools")).toBeTruthy()

    await user.click(screen.getByRole("tab", { name: "Data Ops" }))
    expect(screen.getByText("data-ops")).toBeTruthy()
  })
})
