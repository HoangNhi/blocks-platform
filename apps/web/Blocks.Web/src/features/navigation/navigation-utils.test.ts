import { describe, expect, it } from "vitest"

import { navigationFixture } from "./fixtures"
import {
  buildBreadcrumb,
  findActiveTrailByRoute,
  flattenNavigation,
  canAccessRoute,
  getVisibleNavigation,
  getParentSubgroupIdsForRoute,
} from "./navigation-utils"
import { getRouteCatalogEntry } from "./route-catalog"
import type { NavNode } from "./types"

describe("navigation utilities", () => {
  it("flattens the full visible navigation tree in render order", () => {
    const flattened = flattenNavigation(navigationFixture)

    expect(flattened[0]?.id).toBe("overview")
    expect(flattened.map((node) => node.id)).not.toContain("permission-matrix")
    expect(flattened.every((node) => node.isVisible)).toBe(true)
  })

  it("resolves active trail for a nested route", () => {
    const trail = findActiveTrailByRoute(
      navigationFixture,
      "/system/identity/roles",
    )

    expect(trail.map((node) => node.id)).toEqual([
      "system",
      "identity",
      "roles",
    ])
  })

  it("builds breadcrumb labels from the active route trail", () => {
    const breadcrumb = buildBreadcrumb(navigationFixture, "/plugins/manifests")

    expect(breadcrumb).toEqual([
      { id: "plugins", title: "Plugins", route: undefined },
      {
        id: "plugin-launchpad",
        title: "Plugin Launchpad",
        route: undefined,
      },
      {
        id: "plugin-manifests",
        title: "Manifests",
        route: "/plugins/manifests",
      },
    ])
  })

  it("builds breadcrumb labels for the TradeLab plugin route", () => {
    const breadcrumb = buildBreadcrumb(navigationFixture, "/plugins/tradelab")

    expect(breadcrumb).toEqual([
      { id: "plugins", title: "Plugins", route: undefined },
      {
        id: "trade-lab",
        title: "TradeLab",
        route: undefined,
      },
      {
        id: "trade-lab-strategy-lab",
        title: "Strategy Lab",
        route: "/plugins/tradelab",
      },
    ])
  })

  it("returns parent subgroup ids that must open for an active route", () => {
    expect(
      getParentSubgroupIdsForRoute(navigationFixture, "/services/files/library"),
    ).toEqual(["file-service"])
  })

  it("falls back to an empty trail for an unknown route", () => {
    expect(findActiveTrailByRoute(navigationFixture, "/missing")).toEqual([])
  })

  it("reports route access based on the visible navigation tree", () => {
    expect(canAccessRoute(navigationFixture, "/system/identity/users")).toBe(true)
    expect(canAccessRoute(navigationFixture, "/missing")).toBe(false)
  })

  it("binds the platform overview to workspace.home", () => {
    expect(getRouteCatalogEntry("workspace.home")?.accessRoutes).toContain("/")
  })

  it("denies readiness routes without an authorized menu", () => {
    expect(canAccessRoute([], "/plugins/installed")).toBe(false)
    expect(canAccessRoute([], "/plugins/activity")).toBe(false)
    expect(canAccessRoute([], "/plugins/manifests")).toBe(false)
    expect(canAccessRoute([], "/services/files/library")).toBe(false)
    expect(canAccessRoute([], "/services/files/storage-providers")).toBe(false)
    expect(canAccessRoute([], "/plugins/tradelab")).toBe(false)
  })

  it("allows hidden menu routes without rendering them in visible navigation", () => {
    const navigation: NavNode[] = [
      {
        id: "system",
        title: "System",
        kind: "group",
        owner: "system",
        ownerKey: "system-service",
        sort: 1,
        isVisible: true,
        status: "active",
        children: [
          {
            id: "users",
            title: "Users",
            kind: "menu",
            parentId: "system",
            route: "/system/identity/users",
            owner: "system",
            ownerKey: "system-service",
            sort: 1,
            capability: "view",
            isVisible: false,
            status: "active",
          },
        ],
      },
    ]

    expect(getVisibleNavigation(navigation)[0]?.children).toEqual([])
    expect(canAccessRoute(navigation, "/system/identity/users")).toBe(true)
  })

})
