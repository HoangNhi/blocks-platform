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

    expect(candidates.map((tab) => tab.route)).not.toContain("/")
    expect(candidates.map((tab) => tab.title)).not.toContain("Platform Overview")
    expect(candidates.map((tab) => tab.route)).toContain("/system/identity/users")
    expect(candidates.map((tab) => tab.route)).toContain("/plugins/tradelab")
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
      "/system/identity/users",
    ])
    expect(openedState.activeRoute).toBe("/system/identity/users")

    const duplicateState = openWorkspaceTab(openedState, "/system/identity/users")

    expect(duplicateState.tabs.map((tab) => tab.route)).toEqual([
      "/system/identity/users",
    ])
  })

  it("closes the active tab and focuses the nearest tab on the left", () => {
    const initialState = resolveWorkspaceTabsState({
      navigation: navigationFixture,
      routes: ["/", "/system/identity/users", "/plugins/tradelab"],
      activeRoute: "/plugins/tradelab",
    })

    const closedState = closeWorkspaceTab(initialState, "/plugins/tradelab")

    expect(closedState.tabs.map((tab) => tab.route)).toEqual(["/system/identity/users"])
    expect(closedState.activeRoute).toBe("/system/identity/users")
  })

  it("closes an inactive tab without changing the active route", () => {
    const initialState = resolveWorkspaceTabsState({
      navigation: navigationFixture,
      routes: ["/system/identity/users", "/plugins/tradelab"],
      activeRoute: "/system/identity/users",
    })

    const closedState = closeWorkspaceTab(initialState, "/plugins/tradelab")

    expect(closedState.tabs.map((tab) => tab.route)).toEqual(["/system/identity/users"])
    expect(closedState.activeRoute).toBe("/system/identity/users")
  })

  it("returns Home after closing the final working tab and ignores Home close", () => {
    const initialState = resolveWorkspaceTabsState({
      navigation: navigationFixture,
      routes: ["/system/identity/users"],
      activeRoute: "/system/identity/users",
    })

    const closedState = closeWorkspaceTab(initialState, "/system/identity/users")

    expect(closedState.tabs).toEqual([])
    expect(closedState.activeRoute).toBe(DEFAULT_WORKSPACE_ROUTE)
    expect(closeWorkspaceTab(closedState, DEFAULT_WORKSPACE_ROUTE)).toEqual(closedState)
  })

  it("serializes and parses persisted route tabs with a version", () => {
    const state = resolveWorkspaceTabsState({
      navigation: navigationFixture,
      routes: ["/", "/system/identity/users", "/system/identity/users"],
      activeRoute: "/system/identity/users",
    })

    const serialized = serializeWorkspaceTabs(state)
    const parsed = parseSerializedWorkspaceTabs(JSON.stringify(serialized))

    expect(serialized).toEqual({
      version: 1,
      activeRoute: "/system/identity/users",
      routes: ["/system/identity/users"],
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
