// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { StrategyGroupList } from "./strategy-group-list"

import type { TradeLabStrategyGroupSummary } from "../types"

function group(
  id: string,
  name: string,
  metadata: Record<string, unknown>,
  description = `${name} description`,
): TradeLabStrategyGroupSummary {
  return {
    id,
    name,
    slug: name.toLowerCase().replaceAll(" ", "-"),
    description,
    metadata,
    strategyCount: 2,
    activeStrategyCount: 1,
  }
}

const groups = [
  group("test", "Generated Test Group", { visibility: "test" }, "Debug fixture"),
  group("regular", "Momentum Research", {}, "User-facing research"),
  group("baseline", "TradeLab Baseline", { visibility: "workbench", isBaseline: true }, "Functional smoke baseline"),
]

describe("StrategyGroupList", () => {
  it("hides test groups by default and pins the baseline group first", () => {
    render(<StrategyGroupList groups={groups} selectedGroupId="baseline" onSelectGroup={vi.fn()} />)

    const buttons = screen.getAllByRole("button")
    expect(buttons[0].textContent).toContain("TradeLab Baseline")
    expect(screen.getByText("Momentum Research")).toBeTruthy()
    expect(screen.queryByText("Generated Test Group")).toBeNull()
    expect(screen.getByText("2 visible groups")).toBeTruthy()
  })

  it("shows test groups when Show test groups is checked", async () => {
    const user = userEvent.setup()
    render(<StrategyGroupList groups={groups} selectedGroupId="baseline" onSelectGroup={vi.fn()} />)

    await user.click(screen.getByRole("checkbox", { name: /show test groups/i }))

    expect(screen.getByText("Generated Test Group")).toBeTruthy()
    expect(screen.getByText("3 visible groups")).toBeTruthy()
  })

  it("searches after applying visibility", async () => {
    const user = userEvent.setup()
    render(<StrategyGroupList groups={groups} selectedGroupId="baseline" onSelectGroup={vi.fn()} />)

    await user.type(screen.getByRole("searchbox", { name: /search strategy groups/i }), "momentum")

    expect(screen.getByText("Momentum Research")).toBeTruthy()
    expect(screen.queryByText("TradeLab Baseline")).toBeNull()
    expect(screen.queryByText("Generated Test Group")).toBeNull()
  })

  it("renders an empty state when no visible group matches", async () => {
    const user = userEvent.setup()
    render(<StrategyGroupList groups={groups} selectedGroupId="baseline" onSelectGroup={vi.fn()} />)

    await user.type(screen.getByRole("searchbox", { name: /search strategy groups/i }), "debug")

    expect(screen.getByText("No strategy groups match this view.")).toBeTruthy()
    expect(screen.getByText(/Turn on Show test groups/i)).toBeTruthy()
  })

  it("selects a visible group", async () => {
    const user = userEvent.setup()
    const onSelectGroup = vi.fn()
    render(<StrategyGroupList groups={groups} selectedGroupId="baseline" onSelectGroup={onSelectGroup} />)

    await user.click(screen.getByRole("button", { name: /Momentum Research/i }))

    expect(onSelectGroup).toHaveBeenCalledWith("regular")
  })
})
