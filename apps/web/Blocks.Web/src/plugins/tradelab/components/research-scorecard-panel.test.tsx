// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { ResearchScorecardPanel } from "./research-scorecard-panel"

describe("ResearchScorecardPanel", () => {
  it("shows candidate without saying live ready", () => {
    render(<ResearchScorecardPanel verdict={{ verdict: "Candidate", reasons: ["Meets basic return, drawdown, profit factor, and trade count gates. Not live-ready."] }} />)

    expect(screen.getByText("Candidate")).toBeTruthy()
    expect(screen.getByText(/Not live-ready/i)).toBeTruthy()
  })
})
