// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { HermesOverviewPage } from "./hermes-overview-page"
import { hermesOverviewSnapshot } from "./snapshot"
import { SystemBlock } from "./components/system-block"

function nextFrame() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}

describe("HermesOverviewPage", () => {
  it("renders capability architecture without telemetry framing and has empty activity state", () => {
    render(<HermesOverviewPage />)

    expect(screen.getByText(/Hermes Overview/i)).toBeTruthy()
    expect(screen.getByText("Capability architecture")).toBeTruthy()
    expect(screen.getByTestId("system-map")).toBeTruthy()
    expect(screen.getByTestId("routing-flow-strip")).toBeTruthy()
    expect(screen.getByTestId("activity-empty-state")).toBeTruthy()
    expect(screen.getByText("Recent activity:")).toBeTruthy()
    expect(screen.getByText("No recent data")).toBeTruthy()
    expect(screen.queryByTestId("header-status")).toBeNull()
    expect(screen.queryByTestId("header-version")).toBeNull()
    expect(screen.queryByTestId("header-warnings")).toBeNull()
    expect(screen.queryByTestId("header-refresh-age")).toBeNull()
    expect(screen.queryByTestId("activity-strip")).toBeNull()
    expect(screen.queryByTestId("snapshot-footer")).toBeNull()
  })

  it("does not surface a current model name on the overview", () => {
    render(<HermesOverviewPage />)
    // Model name only allowed in the Provider inspection panel after pick.
    expect(screen.queryByText(/cx\/gpt-5\.4/i)).toBeNull()
  })

  it("exposes all map blocks as semantic buttons", () => {
    render(<HermesOverviewPage />)

    const map = screen.getByTestId("system-map")
    for (const key of [
      "core",
      "provider",
      "surfaces",
      "cron",
      "tools",
      "memory",
      "sessions",
    ]) {
      const block = within(map).getByTestId(`block-${key}`)
      expect(block.tagName.toLowerCase()).toBe("button")
      expect(block.getAttribute("role")).toBe("button")
      expect(block.getAttribute("aria-pressed")).toBe("false")
      expect(block.getAttribute("aria-label")).toContain("Not configured")
    }
  })

  it("opens and closes the inspection panel on click, outside, and Escape", async () => {
    render(<HermesOverviewPage />)

    const map = screen.getByTestId("system-map")
    const cron = within(map).getByTestId("block-cron")

    fireEvent.click(cron)
    expect(cron.getAttribute("aria-pressed")).toBe("true")
    expect(screen.getByTestId("inspection-panel")).toBeTruthy()

    // Click outside closes.
    fireEvent.mouseDown(document.body)
    await nextFrame()
    expect(cron.getAttribute("aria-pressed")).toBe("false")

    // Reopen, Escape closes.
    fireEvent.click(cron)
    expect(cron.getAttribute("aria-pressed")).toBe("true")
    fireEvent.keyDown(window, { key: "Escape" })
    await nextFrame()
    expect(cron.getAttribute("aria-pressed")).toBe("false")
  })

  it("keyboard activates a block via Enter", () => {
    render(<HermesOverviewPage />)
    const map = screen.getByTestId("system-map")
    const tools = within(map).getByTestId("block-tools")
    fireEvent.keyDown(tools, { key: "Enter" })
    expect(tools.getAttribute("aria-pressed")).toBe("true")
  })

  it("renders capability role and explanation copy", () => {
    render(<HermesOverviewPage />)

    const map = screen.getByTestId("system-map")
    const tools = within(map).getByTestId("block-tools")
    fireEvent.click(tools)
    expect(screen.getByText("Role")).toBeTruthy()
    expect(screen.getByText("Availability")).toBeTruthy()
    expect(screen.getByText("How Hermes uses it")).toBeTruthy()
    expect(screen.getAllByText(/Not configured/i).length).toBeGreaterThan(0)
  })

  it("renders a mobile fallback stack with the same blocks in order", () => {
    render(<HermesOverviewPage />)
    const mobile = screen.getByTestId("system-map-mobile")
    expect(mobile).toBeTruthy()
    expect(within(mobile).getByTestId("block-core-mobile")).toBeTruthy()
    expect(within(mobile).getByTestId("block-sessions-mobile")).toBeTruthy()
  })

  it("does not invent a model name on the provider panel either", () => {
    render(<HermesOverviewPage />)

    const map = screen.getByTestId("system-map")
    const provider = within(map).getByTestId("block-provider")
    expect(within(provider).queryByTestId("model-name")).toBeNull()
    // Default render of page must not include the model string anywhere.
    expect(screen.queryByTestId("model-name")).toBeNull()
  })

  it("SystemBlock shows Unknown / Not reported text without inventing", () => {
    const block = {
      ...hermesOverviewSnapshot.blocks.provider,
      primary: {
        value: null,
        state: "not_reported" as const,
        source: "test",
      },
    }
    render(<SystemBlock block={block} selected={false} dimmed={false} />)
    expect(screen.getByRole("button")).toBeTruthy()
    expect(screen.getAllByText(/Not configured/i).length).toBeGreaterThan(0)
  })
})
