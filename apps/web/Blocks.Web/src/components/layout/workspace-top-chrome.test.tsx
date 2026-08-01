// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { navigationFixture } from "@/features/navigation/fixtures"
import { resolveWorkspaceTabsState } from "@/features/navigation/workspace-tabs"

import { WorkspaceTopChrome } from "./workspace-top-chrome"

function getRouteTabState(activeRoute = "/system/identity/users") {
  return resolveWorkspaceTabsState({
    navigation: navigationFixture,
    routes: ["/", "/system/identity/users", "/plugins/tradelab"],
    activeRoute,
  })
}

function renderChrome(
  props: Partial<React.ComponentProps<typeof WorkspaceTopChrome>> = {},
) {
  const state = getRouteTabState(props.activeRoute)

  return render(
    <WorkspaceTopChrome
      tabs={state.tabs}
      candidates={state.candidates}
      activeRoute={state.activeRoute}
      breadcrumb={
        state.tabs.find((tab) => tab.route === state.activeRoute)?.breadcrumb ??
        []
      }
      desktopSidebarMode={"expanded"}
      onSelectRoute={vi.fn()}
      onCloseRoute={vi.fn()}
      onOpenMobileSidebar={vi.fn()}
      onToggleDesktopSidebar={vi.fn()}
      onOpenAssistant={vi.fn()}
      {...props}
    />,
  )
}

describe("WorkspaceTopChrome", () => {
  it("renders route tabs with overview pinned and active route selected", () => {
    renderChrome()

    expect(
      screen.getByRole("tab", { name: "Platform Overview" }).getAttribute("aria-selected"),
    ).toBe("false")
    expect(screen.getByRole("tab", { name: "Users" }).getAttribute("aria-selected")).toBe(
      "true",
    )
    expect(screen.queryByRole("button", { name: "Close Platform Overview tab" })).toBeNull()
    expect(screen.getByRole("button", { name: "Close Users tab" })).toBeTruthy()
  })

  it("selects and closes tabs through callbacks", async () => {
    const actor = userEvent.setup()
    const onSelectRoute = vi.fn()
    const onCloseRoute = vi.fn()

    renderChrome({ onSelectRoute, onCloseRoute })

    await actor.click(screen.getByRole("tab", { name: "Strategy Lab" }))
    await actor.click(screen.getByRole("button", { name: "Close Users tab" }))

    expect(onSelectRoute).toHaveBeenCalledWith("/plugins/tradelab")
    expect(onCloseRoute).toHaveBeenCalledWith("/system/identity/users")
  })

  it("opens the quick switcher, filters pages, and selects a page", async () => {
    const actor = userEvent.setup()
    const onSelectRoute = vi.fn()

    renderChrome({ onSelectRoute })

    await actor.click(screen.getByRole("button", { name: "Open page switcher" }))
    const dialog = await screen.findByRole("dialog", { name: "Open page" })
    await actor.type(within(dialog).getByRole("textbox", { name: "Search pages" }), "roles")
    await actor.click(within(dialog).getByRole("button", { name: "Roles System Identity" }))

    expect(onSelectRoute).toHaveBeenCalledWith("/system/identity/roles")
  })

  it("opens mobile navigation through the compact row action", async () => {
    const actor = userEvent.setup()
    const onOpenMobileSidebar = vi.fn()

    renderChrome({ onOpenMobileSidebar })

    await actor.click(screen.getByRole("button", { name: "Open navigation" }))

    expect(onOpenMobileSidebar).toHaveBeenCalledOnce()
  })

  it("opens the AI assistant from top chrome", async () => {
    const actor = userEvent.setup()
    const onOpenAssistant = vi.fn()

    renderChrome({ onOpenAssistant })

    await actor.click(screen.getByRole("button", { name: "Open AI assistant" }))

    expect(onOpenAssistant).toHaveBeenCalledOnce()
  })

  it("toggles desktop navigation from the page bar", async () => {
    const actor = userEvent.setup()
    const onToggleDesktopSidebar = vi.fn()

    renderChrome({
      desktopSidebarMode: "expanded",
      onToggleDesktopSidebar,
    })

    await actor.click(screen.getByRole("button", { name: "Collapse navigation" }))

    expect(onToggleDesktopSidebar).toHaveBeenCalledOnce()
  })
})
