import { describe, expect, it } from "vitest"

import {
  filterStrategyGroupsForWorkbench,
  isBaselineStrategyGroup,
  isTestStrategyGroup,
  sortStrategyGroupsForWorkbench,
} from "./strategy-group-visibility"

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
    strategyCount: 1,
    activeStrategyCount: 1,
  }
}

describe("strategy group visibility helpers", () => {
  it("detects test groups only from metadata visibility", () => {
    expect(isTestStrategyGroup(group("test", "Test", { visibility: "test" }))).toBe(true)
    expect(isTestStrategyGroup(group("workbench", "Workbench", { visibility: "workbench" }))).toBe(false)
    expect(isTestStrategyGroup(group("missing", "Missing", {}))).toBe(false)
  })

  it("detects baseline groups from canonical metadata", () => {
    expect(isBaselineStrategyGroup(group("baseline", "Baseline", { isBaseline: true }))).toBe(true)
    expect(isBaselineStrategyGroup(group("purpose", "Purpose", { purpose: "baseline_smoke" }))).toBe(true)
    expect(isBaselineStrategyGroup(group("regular", "Regular", {}))).toBe(false)
  })

  it("pins baseline first, then workbench, then regular visible groups, then test groups", () => {
    const sorted = sortStrategyGroupsForWorkbench([
      group("test", "ZZZ Test", { visibility: "test" }),
      group("regular", "AAA Regular", {}),
      group("workbench", "MMM Workbench", { visibility: "workbench" }),
      group("baseline", "TradeLab Baseline", { visibility: "workbench", isBaseline: true }),
    ])

    expect(sorted.map((item) => item.id)).toEqual(["baseline", "workbench", "regular", "test"])
  })

  it("hides test groups by default and keeps missing metadata visible", () => {
    const filtered = filterStrategyGroupsForWorkbench(
      [
        group("baseline", "TradeLab Baseline", { visibility: "workbench", isBaseline: true }),
        group("test", "Generated Test", { visibility: "test" }),
        group("missing", "User Strategy", {}),
      ],
      { query: "", showTestGroups: false },
    )

    expect(filtered.map((item) => item.id)).toEqual(["baseline", "missing"])
  })

  it("shows test groups when the toggle is on and searches name, slug, and description", () => {
    const groups = [
      group("baseline", "TradeLab Baseline", { visibility: "workbench", isBaseline: true }),
      group("test", "Generated Test", { visibility: "test" }, "Debug fixture"),
      group("missing", "User Strategy", {}, "Momentum research"),
    ]

    expect(
      filterStrategyGroupsForWorkbench(groups, { query: "debug", showTestGroups: true }).map(
        (item) => item.id,
      ),
    ).toEqual(["test"])
    expect(
      filterStrategyGroupsForWorkbench(groups, { query: "user-strategy", showTestGroups: false }).map(
        (item) => item.id,
      ),
    ).toEqual(["missing"])
    expect(
      filterStrategyGroupsForWorkbench(groups, { query: "momentum", showTestGroups: false }).map(
        (item) => item.id,
      ),
    ).toEqual(["missing"])
  })

  it("hides empty non-baseline groups by default and shows them during search", () => {
    const empty = {
      ...group("empty", "User Group", {}),
      strategyCount: 0,
      activeStrategyCount: 0,
    }
    const baseline = {
      ...group("baseline", "Baseline", { isBaseline: true }),
      strategyCount: 0,
      activeStrategyCount: 0,
    }

    expect(
      filterStrategyGroupsForWorkbench([baseline, empty], {
        query: "",
        showTestGroups: false,
        showEmptyGroups: false,
      }).map((item) => item.id),
    ).toEqual(["baseline"])
    expect(
      filterStrategyGroupsForWorkbench([baseline, empty], {
        query: "user",
        showTestGroups: false,
        showEmptyGroups: false,
      }).map((item) => item.id),
    ).toEqual(["empty"])
  })
})
