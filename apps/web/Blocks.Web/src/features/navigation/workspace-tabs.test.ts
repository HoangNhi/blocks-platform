import { describe, expect, it } from "vitest"

import { navigationFixture } from "./fixtures"
import {
  DEFAULT_WORKSPACE_ROUTE,
  closeWorkspaceTab,
  getWorkspaceTabCandidates,
  getWorkspaceTabsStorageKey,
  openWorkspaceTab,
  parseSerializedWorkspaceTabs,
  resolveWorkspaceTabsState,
  serializeWorkspaceTabs,
} from "./workspace-tabs"

describe("workspace route tabs", () => {
  it("creates route-tab candidates from visible menu routes", () => {
    const candidates = getWorkspaceTabCandidates(navigationFixture)

    expect(candidates.map((tab) => tab.route)).toContain("/")
    expect(candidates.map((tab) => tab.route)).toContain("/system/identity/users")
    expect(candidates.map((tab) => tab.route)).toContain("/plugins/tradelab")
    expect(candidates[0]).toMatchObject({
      route: DEFAULT_WORKSPACE_ROUTE,
      title: "Platform Overview",
      pinned: true,
    })
  })

  it("restores valid persisted routes, dedupes them, and drops inaccessible routes", () => {
    const state = resolveWorkspaceTabsState({
      navigation: navigationFixture,
      routes: [
        "/system/identity/users",
        "/missing",
        "/system/identity/users",
        "/plugins/tradelab",
      ],
      activeRoute: "/plugins/tradelab",
    })

    expect(state.tabs.map((tab) => tab.route)).toEqual([
      "/",
      "/system/identity/users",
      "/plugins/tradelab",
    ])
    expect(state.activeRoute).toBe("/plugins/tradelab")
  })

  it("opens a direct accessible route as a tab even when it was not stored", () => {
    const state = resolveWorkspaceTabsState({
      navigation: navigationFixture,
      routes: ["/"],
      activeRoute: "/system/identity/roles",
    })

    expect(state.tabs.map((tab) => tab.route)).toEqual([
      "/",
      "/system/identity/roles",
    ])
    expect(state.activeRoute).toBe("/system/identity/roles")
  })

  it("opens existing routes without creating duplicate tabs", () => {
    const initialState = resolveWorkspaceTabsState({
      navigation: navigationFixture,
      routes: ["/", "/system/identity/users"],
      activeRoute: "/",
    })

    const openedState = openWorkspaceTab(initialState, "/system/identity/users")

    expect(openedState.tabs.map((tab) => tab.route)).toEqual([
      "/",
      "/system/identity/users",
    ])
    expect(openedState.activeRoute).toBe("/system/identity/users")
  })

  it("closes the active tab and focuses the nearest tab on the left", () => {
    const initialState = resolveWorkspaceTabsState({
      navigation: navigationFixture,
      routes: ["/", "/system/identity/users", "/plugins/tradelab"],
      activeRoute: "/plugins/tradelab",
    })

    const closedState = closeWorkspaceTab(initialState, "/plugins/tradelab")

    expect(closedState.tabs.map((tab) => tab.route)).toEqual([
      "/",
      "/system/identity/users",
    ])
    expect(closedState.activeRoute).toBe("/system/identity/users")
  })

  it("keeps the pinned overview tab when asked to close it", () => {
    const initialState = resolveWorkspaceTabsState({
      navigation: navigationFixture,
      routes: ["/", "/system/identity/users"],
      activeRoute: "/",
    })

    const closedState = closeWorkspaceTab(initialState, "/")

    expect(closedState.tabs.map((tab) => tab.route)).toEqual([
      "/",
      "/system/identity/users",
    ])
    expect(closedState.activeRoute).toBe("/")
  })

  it("serializes and parses persisted route tabs with a version", () => {
    const state = resolveWorkspaceTabsState({
      navigation: navigationFixture,
      routes: ["/", "/system/identity/users"],
      activeRoute: "/system/identity/users",
    })

    const serialized = serializeWorkspaceTabs(state)
    const parsed = parseSerializedWorkspaceTabs(JSON.stringify(serialized))

    expect(serialized).toEqual({
      version: 1,
      activeRoute: "/system/identity/users",
      routes: ["/", "/system/identity/users"],
    })
    expect(parsed).toEqual(serialized)
    expect(parseSerializedWorkspaceTabs("{bad json")).toBeNull()
  })

  it("scopes storage by user id", () => {
    expect(getWorkspaceTabsStorageKey("admin")).toBe(
      "blocks.workspace.tabs.admin",
    )
  })
})
