import type {
  PermissionGroupModel,
  PermissionMenuModel,
  RolePermissionSaveRequest,
} from "./types"

export const rolePermissionKeys = [
  "isViewed",
  "isAdded",
  "isUpdated",
  "isDeleted",
  "isApproved",
  "isAnalyzed",
] as const

export type RolePermissionKey = (typeof rolePermissionKeys)[number]

export type PermissionDiff = {
  changedCellCount: number
  changedRows: RolePermissionSaveRequest[]
}

const permissionCapabilityByKey: Record<RolePermissionKey, keyof PermissionMenuModel> = {
  isViewed: "canView",
  isAdded: "canAdd",
  isUpdated: "canUpdate",
  isDeleted: "canDelete",
  isApproved: "canApprove",
  isAnalyzed: "canAnalyze",
}

export function clonePermissionGroups(groups: PermissionGroupModel[]): PermissionGroupModel[] {
  return groups.map((group) => ({
    ...group,
    roles: group.roles.map((permission) => ({ ...permission })),
  }))
}

export function filterPermissionGroups(
  groups: PermissionGroupModel[],
  searchTerm: string,
): PermissionGroupModel[] {
  const query = searchTerm.trim().toLocaleLowerCase()
  if (!query) {
    return groups
  }

  return groups.flatMap((group) => {
    const groupMatches = group.systemGroup.toLocaleLowerCase().includes(query)
    const roles = groupMatches
      ? group.roles
      : group.roles.filter((permission) =>
          [permission.name, permission.permissionKey]
            .filter(Boolean)
            .some((value) => value!.toLocaleLowerCase().includes(query)),
        )

    return roles.length > 0 ? [{ ...group, roles }] : []
  })
}

export function getSupportedPermissionKeys(permission: PermissionMenuModel): RolePermissionKey[] {
  return rolePermissionKeys.filter((key) => permission[permissionCapabilityByKey[key]] === true)
}

export function diffPermissionGroups(
  current: PermissionGroupModel[],
  baseline: PermissionGroupModel[],
): PermissionDiff {
  const baselineByMenu = new Map(
    baseline.flatMap((group) => group.roles).map((permission) => [permission.menuId, permission]),
  )
  const changedRows: RolePermissionSaveRequest[] = []
  let changedCellCount = 0

  for (const group of current) {
    for (const permission of group.roles) {
      const previous = baselineByMenu.get(permission.menuId)
      const supportedKeys = getSupportedPermissionKeys(permission)
      const changedKeys = supportedKeys.filter((key) => permission[key] !== (previous?.[key] ?? false))
      if (changedKeys.length === 0) {
        continue
      }

      changedCellCount += changedKeys.length
      changedRows.push({
        id: permission.id,
        roleId: permission.roleId,
        menuId: permission.menuId,
        isViewed: supportedKeys.includes("isViewed") ? permission.isViewed : false,
        isAdded: supportedKeys.includes("isAdded") ? permission.isAdded : false,
        isUpdated: supportedKeys.includes("isUpdated") ? permission.isUpdated : false,
        isDeleted: supportedKeys.includes("isDeleted") ? permission.isDeleted : false,
        isApproved: supportedKeys.includes("isApproved") ? permission.isApproved : false,
        isAnalyzed: supportedKeys.includes("isAnalyzed") ? permission.isAnalyzed : false,
      })
    }
  }

  return { changedCellCount, changedRows }
}
