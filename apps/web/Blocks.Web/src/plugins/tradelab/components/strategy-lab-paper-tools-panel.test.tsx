// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { DEFAULT_CREDENTIAL_BOUNDARY_CHECKS } from "../credential-boundary"
import type { TradeLabStrategyVersion } from "../types"
import { StrategyLabPaperToolsPanel } from "./strategy-lab-paper-tools-panel"

const version: TradeLabStrategyVersion = {
  id: "version-1",
  strategyId: "strategy-1",
  versionNumber: 2,
  validationStatus: "valid",
  validationMessage: null,
  sourceCode: "print('paper')",
  sourceHash: "hash-1",
  createdAt: "2026-01-01T00:00:00Z",
}

describe("StrategyLabPaperToolsPanel", () => {
  it("owns paper readiness, credential boundary, and the paper session slot", () => {
    render(
      <StrategyLabPaperToolsPanel
        currentVersion={version}
        credentialBoundaryStatus="missing"
        credentialBoundaryChecks={DEFAULT_CREDENTIAL_BOUNDARY_CHECKS}
        onCredentialBoundaryChecksChange={vi.fn()}
        onSavePaperDraft={vi.fn()}
        paperSessionContent={<div>paper-session-slot</div>}
      />,
    )

    expect(screen.getByText("Phase 4 Foundation")).toBeTruthy()
    expect(screen.getByLabelText("Paper readiness")).toBeTruthy()
    expect(screen.getByRole("checkbox", { name: "Read-only enabled" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Save paper draft" })).toBeTruthy()
    expect(screen.getByText("paper-session-slot")).toBeTruthy()
  })
})
