import { describe, expect, it } from "vitest"

import {
  adaptSystemNavigation,
  collectUnknownSystemMenus,
} from "./system-menu-adapter"
import { getRouteCatalogEntry } from "./route-catalog"
import type { SystemGroupRecord, SystemMenuRecord } from "./system-menu-types"

const identityGroups: SystemGroupRecord[] = [
  {
    id: "system",
    name: "System",
    sort: 20,
    parentId: null,
  },
  {
    id: "identity",
    name: "Identity",
    sort: 10,
    parentId: "system",
  },
]

const identityMenus: SystemMenuRecord[] = [
  {
    id: "users",
    controller: "User",
    name: "Users",
    systemGroupId: "identity",
    sort: 10,
    canView: true,
    canAdd: false,
    canUpdate: false,
    canDelete: false,
    canApprove: false,
    canAnalyze: false,
    isShowMenu: true,
  },
  {
    id: "system-groups",
    controller: "SystemGroup",
    name: "System Groups",
    systemGroupId: "identity",
    sort: 25,
    canView: true,
    canAdd: false,
    canUpdate: false,
    canDelete: false,
    canApprove: false,
    canAnalyze: false,
    isShowMenu: true,
  },
  {
    id: "roles",
    controller: "Role",
    name: "Roles",
    systemGroupId: "identity",
    sort: 20,
    canView: true,
    canAdd: false,
    canUpdate: false,
    canDelete: false,
    canApprove: false,
    canAnalyze: false,
    isShowMenu: true,
  },
]

function createMenu(overrides: Partial<SystemMenuRecord>): SystemMenuRecord {
  return {
    id: "menu",
    controller: "User",
    name: "Users",
    systemGroupId: "system",
    sort: 10,
    canView: true,
    canAdd: false,
    canUpdate: false,
    canDelete: false,
    canApprove: false,
    canAnalyze: false,
    isShowMenu: true,
    ...overrides,
  }
}

describe("system menu adapter", () => {
  it("maps every canonical permission key to an implemented route", () => {
    const expectedRoutes = {
      "admin.registration": "/system/overview",
      "workspace.home": "/system/hermes/overview",
      "admin.audit": "/system/audit-log",
      "admin.users": "/system/identity/users",
      "admin.roles": "/system/identity/roles",
      "admin.plugins": "/system/identity/menus",
      "admin.permissions": "/system/identity/system-groups",
      "tradelab.strategies": "/plugins/tradelab",
      "tradelab.datasets": "/plugins/tradelab/datasets",
      "ai-video.projects": "/plugins/ai-video",
    } as const

    for (const [permissionKey, route] of Object.entries(expectedRoutes)) {
      expect(getRouteCatalogEntry(permissionKey)?.route).toBe(route)
    }
  })

  it("builds a three-level navigation tree from system groups and menus", () => {
    const navigation = adaptSystemNavigation({
      groups: identityGroups,
      menus: identityMenus,
    })

    expect(navigation[0]?.id).toBe("system")
    expect(navigation[0]?.children?.[0]?.id).toBe("identity")
    expect(navigation[0]?.children?.[0]?.children?.map((item) => item.id)).toEqual([
      "users",
      "roles",
      "system-groups",
    ])
    expect(navigation[0]?.children?.[0]?.children?.[0]?.route).toBe(
      "/system/identity/users",
    )
    expect(navigation[0]?.children?.[0]?.children?.[0]?.capability).toBe("view")
  })

  it("builds navigation from PascalCase System Service records", () => {
    const navigation = adaptSystemNavigation({
      groups: [
        {
          Id: "system",
          Name: "System",
          Sort: 20,
          ParentId: null,
        },
        {
          Id: "identity",
          Name: "Identity",
          Sort: 10,
          ParentId: "system",
        },
      ] as unknown as SystemGroupRecord[],
      menus: [
        {
          Id: "users",
          Controller: "user",
          Name: "Tài khoản",
          SystemGroupId: "identity",
          Sort: 10,
          CanView: true,
          CanAdd: true,
          CanUpdate: true,
          CanDelete: true,
          CanApprove: false,
          CanAnalyze: false,
          IsShowMenu: true,
        },
      ] as unknown as SystemMenuRecord[],
    })

    expect(navigation[0]?.id).toBe("system")
    expect(navigation[0]?.children?.[0]?.id).toBe("identity")
    expect(navigation[0]?.children?.[0]?.children?.[0]?.route).toBe(
      "/system/identity/users",
    )
  })

  it("keeps hidden-but-viewable implemented menus discoverable in the sidebar", () => {
    const navigation = adaptSystemNavigation({
      groups: identityGroups,
      menus: [
        {
          ...identityMenus[0],
          isShowMenu: false,
          canView: true,
        },
      ],
    })

    const usersRoute = navigation[0]?.children?.[0]?.children?.[0]

    expect(usersRoute?.route).toBe("/system/identity/users")
    expect(usersRoute?.isVisible).toBe(true)
  })

  it("keeps Roles & Permissions inside the Roles surface", () => {
    const navigation = adaptSystemNavigation({
      groups: identityGroups,
      menus: identityMenus,
    })

    const rolesRoute = navigation[0]?.children?.[0]?.children?.find(
      (item) => item.id === "roles",
    ) as { accessRoutes?: string[] } | undefined

    expect(rolesRoute?.accessRoutes).toBeUndefined()
  })

  it("maps SystemGroup menus to the system groups route catalog entry", () => {
    const navigation = adaptSystemNavigation({
      groups: identityGroups,
      menus: identityMenus,
    })

    const systemGroupsRoute = navigation[0]?.children?.[0]?.children?.find(
      (item) => item.id === "system-groups",
    )

    expect(systemGroupsRoute?.route).toBe("/system/identity/system-groups")
    expect(systemGroupsRoute?.title).toBe("System Groups")
  })

  it("resolves permission keys before controller and name aliases", () => {
    const navigation = adaptSystemNavigation({
      groups: [{ id: "system", name: "System", sort: 1, parentId: null }],
      menus: [
        createMenu({
          id: "canonical-users",
          permissionKey: "admin.users",
          controller: "Role",
          name: "Roles",
        } as Partial<SystemMenuRecord>),
      ],
    })

    expect(navigation[0]?.children?.[0]?.children?.[0]).toMatchObject({
      id: "canonical-users",
      route: "/system/identity/users",
    })
  })

  it("reports unknown menus without making them routable", () => {
    const menus = [createMenu({ id: "unknown", controller: "Unknown", name: "Unknown" })]
    const navigation = adaptSystemNavigation({
      groups: [{ id: "system", name: "System", sort: 1, parentId: null }],
      menus,
    })

    expect(navigation[0]?.children).toEqual([])
    expect(collectUnknownSystemMenus(menus)).toEqual(menus)
  })

  it("omits menus with no effective actions", () => {
    const navigation = adaptSystemNavigation({
      groups: [{ id: "system", name: "System", sort: 1, parentId: null }],
      menus: [createMenu({ canView: false, isShowMenu: true })],
    })

    expect(navigation[0]?.children).toEqual([])
  })

  it("maps route-like controller values", () => {
    const navigation = adaptSystemNavigation({
      groups: identityGroups,
      menus: [
        {
          ...identityMenus[0],
          id: "users-route-path",
          controller: "/system/identity/users",
          name: "Tài khoản",
        },
      ],
    })

    expect(navigation[0]?.children?.[0]?.children?.[0]).toMatchObject({
      id: "users-route-path",
      title: "Users",
      route: "/system/identity/users",
    })
  })

  it("maps Vietnamese names with accent-insensitive aliases", () => {
    const navigation = adaptSystemNavigation({
      groups: identityGroups,
      menus: [
        {
          ...identityMenus[1],
          id: "system-groups-vietnamese",
          controller: "",
          name: "Nhóm hệ thống",
        },
      ],
    })

    expect(navigation[0]?.children?.[0]?.children?.[0]).toMatchObject({
      id: "system-groups-vietnamese",
      title: "System Groups",
      route: "/system/identity/system-groups",
    })
  })

  it("groups flat System menus into stable presentation subgroups", () => {
    const navigation = adaptSystemNavigation({
      groups: [{ id: "system", name: "HỆ THỐNG", sort: 10, parentId: null }],
      menus: [
        createMenu({ id: "users", controller: "User", name: "Users", sort: 10 }),
        createMenu({ id: "roles", controller: "Role", name: "Roles", sort: 20 }),
        createMenu({ id: "audit-log", controller: "AuditLog", name: "Audit Log", sort: 30 }),
        createMenu({ id: "menus", controller: "Menu", name: "Menus", sort: 40 }),
        createMenu({ id: "system-groups", controller: "SystemGroup", name: "System Groups", sort: 50 }),
      ],
    })

    expect(navigation[0]?.children?.map((item) => item.title)).toEqual([
      "Quản trị định danh",
      "Vận hành hệ thống",
    ])
    expect(navigation[0]?.children?.[0]).toMatchObject({
      kind: "subgroup",
      route: undefined,
    })
    expect(navigation[0]?.children?.[0]?.children?.map((item) => item.route)).toEqual([
      "/system/identity/users",
      "/system/identity/roles",
      "/system/identity/menus",
      "/system/identity/system-groups",
    ])
    expect(navigation[0]?.children?.[1]?.children?.map((item) => item.route)).toEqual([
      "/system/audit-log",
    ])
  })

  it("keeps TradeLab as a collapsible plugin branch with Strategy Lab as the route leaf", () => {
    const navigation = adaptSystemNavigation({
      groups: [
        { id: "plugins", name: "Plugins", sort: 30, parentId: null },
        { id: "tradelab-group", name: "TradeLab", sort: 10, parentId: "plugins" },
      ],
      menus: [
        createMenu({
          id: "tradelab-menu",
          controller: "/plugins/tradelab",
          name: "TradeLab",
          systemGroupId: "tradelab-group",
          canAnalyze: true,
        }),
      ],
    })

    const tradeLabBranch = navigation[0]?.children?.[0]

    expect(tradeLabBranch).toMatchObject({
      id: "tradelab-group",
      title: "TradeLab",
      kind: "subgroup",
      route: undefined,
      owner: "plugin",
      ownerKey: "tradelab",
    })
    expect(tradeLabBranch?.children?.map((child) => child.route)).toEqual([
      "/plugins/tradelab",
      "/plugins/tradelab/datasets",
    ])
    expect(tradeLabBranch?.children?.[0]).toMatchObject({
      id: "tradelab-menu",
      title: "Strategy Lab",
      route: "/plugins/tradelab",
    })
    expect(tradeLabBranch?.children?.[1]).toMatchObject({
      title: "Datasets",
      route: "/plugins/tradelab/datasets",
    })
  })

  it("adds the AI Video operations branch under the Plugins group", () => {
    const navigation = adaptSystemNavigation({
      groups: [
        { id: "plugins", name: "Plugins", sort: 30, parentId: null },
        { id: "tradelab-group", name: "TradeLab", sort: 10, parentId: "plugins" },
      ],
      menus: [
        createMenu({
          id: "tradelab-menu",
          controller: "/plugins/tradelab",
          name: "TradeLab",
          systemGroupId: "tradelab-group",
          canAnalyze: true,
        }),
      ],
    })

    const aiVideoBranch = navigation[0]?.children?.find(
      (child) => child.ownerKey === "ai-video-production",
    )

    expect(aiVideoBranch).toMatchObject({
      title: "AI Video Production",
      owner: "plugin",
      ownerKey: "ai-video-production",
    })
    expect(aiVideoBranch?.children?.[0]).toMatchObject({
      title: "Operations",
      route: "/plugins/ai-video",
    })
  })
})
