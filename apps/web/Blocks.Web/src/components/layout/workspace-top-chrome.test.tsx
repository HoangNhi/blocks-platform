// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { navigationFixture } from "@/features/navigation/fixtures"
import {
  resolveWorkspaceTabsState,
  type WorkspaceTab,
} from "@/features/navigation/workspace-tabs"

import { WorkspaceTopChrome } from "./workspace-top-chrome"

function getRouteTabState(activeRoute = "/system/identity/users") {
  return resolveWorkspaceTabsState({
    navigation: navigationFixture,
    routes: [
      "/system/identity/users",
      "/system/identity/roles",
      "/system/identity/system-groups",
      "/plugins/tradelab",
    ],
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
      desktopSidebarMode="expanded"
      assistantOpen={false}
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
  it("renders one compact header row with route tabs and fixed controls", () => {
    renderChrome()

    expect(screen.getByRole("tablist", { name: "Open workspace pages" })).toBeTruthy()
    expect(screen.getByRole("tab", { name: "Users" }).getAttribute("aria-selected")).toBe(
      "true",
    )
    expect(screen.getByRole("tab", { name: "Roles" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Open new page" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Open AI assistant" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Collapse navigation" })).toBeTruthy()
    expect(screen.queryByRole("tab", { name: "Platform Overview" })).toBeNull()
    expect(screen.queryByText("system-service")).toBeNull()
    expect(screen.queryByText("Open page switcher")).toBeNull()

    const header = screen.getByRole("banner")
    expect(header.className).toContain("h-11")
    expect(header.className).toContain("flex-nowrap")
    expect(header.querySelectorAll('[role="tablist"]')).toHaveLength(1)
  })

  it("selects and closes active or inactive tabs through callbacks", async () => {
    const actor = userEvent.setup()
    const onSelectRoute = vi.fn()
    const onCloseRoute = vi.fn()

    renderChrome({ onSelectRoute, onCloseRoute })

    await actor.click(screen.getByRole("tab", { name: "Roles" }))
    await actor.click(screen.getByRole("button", { name: "Close Users tab" }))
    await actor.click(screen.getByRole("button", { name: "Close Roles tab" }))

    expect(onSelectRoute).toHaveBeenCalledWith("/system/identity/roles")
    expect(onCloseRoute).toHaveBeenNthCalledWith(1, "/system/identity/users")
    expect(onCloseRoute).toHaveBeenNthCalledWith(2, "/system/identity/roles")
  })

  it("truncates long labels and exposes unsaved state without relying on color", () => {
    const state = getRouteTabState()
    const longTab: WorkspaceTab = {
      ...state.tabs[0],
      title: "System Groups With A Long Workspace Title",
      isDirty: true,
    }

    renderChrome({ tabs: [longTab], activeRoute: longTab.route })

    expect(screen.getByText(longTab.title).className).toContain("truncate")
    expect(screen.getByLabelText("Unsaved changes for System Groups With A Long Workspace Title")).toBeTruthy()
  })

  it("opens the new-page picker, filters routes, and activates existing routes without duplicates", async () => {
    const actor = userEvent.setup()
    const onSelectRoute = vi.fn()

    renderChrome({ onSelectRoute })

    await actor.click(screen.getByRole("button", { name: "Open new page" }))
    const dialog = await screen.findByRole("dialog", { name: "Open page" })
    const search = within(dialog).getByPlaceholderText("Search pages...")

    expect(within(dialog).getByRole("button", { name: /Users/ })).toBeTruthy()
    expect(within(dialog).getByRole("button", { name: /Roles/ })).toBeTruthy()
    expect(within(dialog).getByRole("button", { name: /System Groups/ })).toBeTruthy()

    await actor.type(search, "roles")

    expect(within(dialog).getByRole("button", { name: /Roles/ })).toBeTruthy()
    expect(within(dialog).queryByRole("button", { name: /Users/ })).toBeNull()

    await actor.click(within(dialog).getByRole("button", { name: /Roles/ }))

    expect(onSelectRoute).toHaveBeenCalledWith("/system/identity/roles")
    expect(screen.queryByRole("dialog", { name: "Open page" })).toBeNull()
  })

  it("supports keyboard tab navigation and named close controls", async () => {
    const actor = userEvent.setup()
    const onSelectRoute = vi.fn()
    const onCloseRoute = vi.fn()

    renderChrome({ onSelectRoute, onCloseRoute })

    const usersTab = screen.getByRole("tab", { name: "Users" })
    usersTab.focus()
    await actor.keyboard("{ArrowRight}")

    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Roles" }))

    await actor.keyboard("{Delete}")

    expect(onCloseRoute).toHaveBeenCalledWith("/system/identity/roles")
    expect(screen.getByRole("button", { name: "Close Users tab" })).toBeTruthy()
  })

  it("keeps fifteen tabs in one horizontally scrollable rail", () => {
    const state = getRouteTabState()
    const tabs = Array.from({ length: 15 }, (_, index) => ({
      ...state.tabs[index % state.tabs.length],
      id: `tab-${index}`,
      route: `/workspace/test-${index}`,
      title: `Workspace ${index + 1}`,
    }))

    renderChrome({ tabs, activeRoute: tabs[0].route })

    const rail = screen.getByTestId("workspace-tab-rail")
    expect(rail.className).toContain("overflow-x-auto")
    expect(rail.className).toContain("whitespace-nowrap")
    expect(screen.getByRole("button", { name: "Open new page" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Open AI assistant" })).toBeTruthy()
  })

  it("uses mobile navigation control and reflects open AI state", async () => {
    const actor = userEvent.setup()
    const onOpenMobileSidebar = vi.fn()
    const onOpenAssistant = vi.fn()

    renderChrome({
      onOpenMobileSidebar,
      onOpenAssistant,
      assistantOpen: true,
    })

    await actor.click(screen.getByRole("button", { name: "Open navigation" }))
    await actor.click(screen.getByRole("button", { name: "Open AI assistant" }))

    expect(onOpenMobileSidebar).toHaveBeenCalledOnce()
    expect(onOpenAssistant).toHaveBeenCalledOnce()
    expect(screen.getByRole("button", { name: "Open AI assistant" }).getAttribute("aria-expanded")).toBe(
      "true",
    )
  })
})
