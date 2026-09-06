import { describe, expect, it } from "vitest"

import type { PermissionGroupModel } from "./types"
import {
  clonePermissionGroups,
  diffPermissionGroups,
  filterPermissionGroups,
  getSupportedPermissionKeys,
} from "./role-permission-state"

function permission(overrides: Partial<PermissionGroupModel["roles"][number]> = {}) {
  return {
    id: "permission-1",
    roleId: "role-1",
    menuId: "menu-1",
    permissionKey: "workspace.home",
    name: "Registration",
    isViewed: false,
    isAdded: false,
    isUpdated: false,
    isDeleted: false,
    isApproved: false,
    isAnalyzed: false,
    canView: true,
    canAdd: true,
    canUpdate: false,
    canDelete: false,
    canApprove: false,
    canAnalyze: false,
    ...overrides,
  }
}

function groups(permissionValue = permission()): PermissionGroupModel[] {
  return [{ systemGroup: "Identity", roles: [permissionValue] }]
}

describe("role permission state", () => {
  it("clones groups without sharing permission objects", () => {
    const original = groups()
    const clone = clonePermissionGroups(original)

    clone[0].roles[0].isViewed = true

    expect(original[0].roles[0].isViewed).toBe(false)
  })

  it("keeps complete group when system group matches search", () => {
    const value = groups(permission({ name: "Files" }))

    expect(filterPermissionGroups(value, "identity")).toEqual(value)
  })

  it("filters permissions by name or key", () => {
    const value = [{
      systemGroup: "Identity",
      roles: [permission({ name: "Registration" }), permission({ menuId: "menu-2", name: "Files", permissionKey: "files" })],
    }]

    expect(filterPermissionGroups(value, "files")[0].roles).toHaveLength(1)
  })

  it("counts supported changed cells and excludes unsupported grants", () => {
    const current = groups(permission({ isViewed: true, isUpdated: true }))
    const baseline = groups()

    expect(getSupportedPermissionKeys(current[0].roles[0])).toEqual(["isViewed", "isAdded"])
    expect(diffPermissionGroups(current, baseline)).toEqual({
      changedCellCount: 1,
      changedRows: [{
        id: "permission-1",
        roleId: "role-1",
        menuId: "menu-1",
        isViewed: true,
        isAdded: false,
        isUpdated: false,
        isDeleted: false,
        isApproved: false,
        isAnalyzed: false,
      }],
    })
  })

  it("reverting change returns clean diff", () => {
    expect(diffPermissionGroups([], [])).toEqual({ changedCellCount: 0, changedRows: [] })
    expect(diffPermissionGroups(groups(), groups())).toEqual({ changedCellCount: 0, changedRows: [] })
  })
})
