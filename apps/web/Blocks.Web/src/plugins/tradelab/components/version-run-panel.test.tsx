// @vitest-environment jsdom

import type { ComponentProps } from "react"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { VersionRunPanel } from "./version-run-panel"
import type { TradeLabStrategyDetail, TradeLabStrategyVersion } from "../types"

const version: TradeLabStrategyVersion = {
  id: "version-12345678",
  strategyId: "strategy-1",
  versionNumber: 3,
  validationStatus: "valid",
  validationMessage: null,
  sourceCode: "print('ready')",
  sourceHash: "hash-1",
  createdAt: "2026-01-01T00:00:00Z",
}

const strategy = {
  id: "strategy-1",
  strategyGroupId: "group-1",
  name: "SMA 9/21 Baseline",
  slug: "sma-9-21",
  description: "Baseline",
  status: "active",
  currentVersionId: version.id,
  runtimeConfig: {},
  riskConfig: {},
  metadata: {},
  versions: [version],
  versionCount: 1,
} as TradeLabStrategyDetail

function renderPanel(overrides: Partial<ComponentProps<typeof VersionRunPanel>> = {}) {
  render(
    <VersionRunPanel
      strategy={strategy}
      currentVersion={version}
      runVersion={version}
      onSaveSettings={vi.fn()}
      onCreateVersion={vi.fn()}
      onRunBacktest={vi.fn()}
      {...overrides}
    />
  )
}

describe("VersionRunPanel", () => {
  it("keeps setup focused on version state, save actions, and one primary backtest action", () => {
    renderPanel()

    expect(screen.getByRole("button", { name: "Review & run backtest" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Save setup" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Create version" })).toBeTruthy()
    expect(screen.queryByLabelText("Paper readiness")).toBeNull()
    expect(screen.queryByText("Phase 4 Foundation")).toBeNull()
    expect(screen.queryByRole("checkbox", { name: "Read-only enabled" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Save paper draft" })).toBeNull()
  })

  it("still shows dirty-state badges and a disabled reason in the setup lane", () => {
    renderPanel({
      isDraftDirty: true,
      isConfigDirty: true,
      runDisabledReason: "Fix blocked order sizing before running.",
    })

    expect(screen.getByText("Draft has unversioned changes")).toBeTruthy()
    expect(screen.getByText("Config has unsaved changes")).toBeTruthy()
    expect(screen.getByText("Fix blocked order sizing before running.")).toBeTruthy()
  })
})
