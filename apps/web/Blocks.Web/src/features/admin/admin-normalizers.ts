import type { PagingResponse } from "@/lib/api/types"

import type {
  AuditLogDetailModel,
  AuditLogModel,
  ComboboxOption,
  MenuDetailModel,
  MenuModel,
  PermissionGroupModel,
  PermissionMenuModel,
  RoleDetailModel,
  RoleModel,
  SystemGroupDetailModel,
  SystemGroupModel,
  UserDetailModel,
  UserModel,
} from "./types"

type ApiRecord = Record<string, unknown>

function asRecord(value: unknown): ApiRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as ApiRecord)
    : {}
}

function pick(record: ApiRecord, ...keys: string[]): unknown {
  for (const key of keys) {
    if (key in record) {
      return record[key]
    }
  }

  return undefined
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

function numberValue(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function boolValue(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback
}

function normalizeBaseModel(record: ApiRecord) {
  return {
    createdAt: nullableText(pick(record, "createdAt", "CreatedAt")),
    createdBy: nullableText(pick(record, "createdBy", "CreatedBy")),
    updatedAt: nullableText(pick(record, "updatedAt", "UpdatedAt")),
    updatedBy: nullableText(pick(record, "updatedBy", "UpdatedBy")),
    isActived: boolValue(pick(record, "isActived", "IsActived", "isActive", "IsActive")),
    isEdit: boolValue(pick(record, "isEdit", "IsEdit")),
    sort: pick(record, "sort", "Sort") === undefined ? undefined : numberValue(pick(record, "sort", "Sort")),
  }
}

function normalizeFolderUpload(record: ApiRecord) {
  return text(pick(record, "folderUpload", "FolderUpload"))
}

export function normalizePagingResponse<T>(
  payload: unknown,
  normalizeItem: (item: unknown) => T,
): PagingResponse<T> {
  const record = asRecord(payload)
  const rawData = pick(record, "data", "Data")
  const rows = Array.isArray(rawData) ? rawData : []

  return {
    pageIndex: numberValue(pick(record, "pageIndex", "PageIndex"), 1),
    pageSize: numberValue(pick(record, "pageSize", "PageSize"), rows.length),
    totalRow: numberValue(pick(record, "totalRow", "TotalRow", "totalRows", "TotalRows"), rows.length),
    data: rows.map(normalizeItem),
  }
}

export function normalizeUser(row: unknown): UserModel {
  const record = asRecord(row)
  const baseModel = normalizeBaseModel(record)

  return {
    ...baseModel,
    id: text(pick(record, "id", "Id")),
    username: text(pick(record, "username", "Username")),
    fullname: text(pick(record, "fullname", "Fullname", "fullName", "FullName")),
    roleId: text(pick(record, "roleId", "RoleId")),
    roleName: nullableText(pick(record, "roleName", "RoleName")),
    role: nullableText(pick(record, "role", "Role")),
    email: text(pick(record, "email", "Email")),
    avatar: nullableText(pick(record, "avatar", "Avatar")),
  }
}

export function normalizeUserDetail(row: unknown): UserDetailModel {
  const record = asRecord(row)

  return {
    ...normalizeUser(record),
    password: text(pick(record, "password", "Password")),
    folderUpload: normalizeFolderUpload(record),
  }
}

export function normalizeRole(row: unknown): RoleModel {
  const record = asRecord(row)
  const baseModel = normalizeBaseModel(record)

  return {
    ...baseModel,
    id: text(pick(record, "id", "Id")),
    name: text(pick(record, "name", "Name")),
    key: nullableText(pick(record, "key", "Key")),
    isSystem: boolValue(pick(record, "isSystem", "IsSystem")),
    isRegistrationEligible: boolValue(pick(record, "isRegistrationEligible", "IsRegistrationEligible")),
    isDefaultRegistrationRole: boolValue(pick(record, "isDefaultRegistrationRole", "IsDefaultRegistrationRole")),
  }
}

export function normalizeRoleDetail(row: unknown): RoleDetailModel {
  const record = asRecord(row)

  return {
    ...normalizeRole(record),
    folderUpload: normalizeFolderUpload(record),
  }
}

export function normalizeMenu(row: unknown): MenuModel {
  const record = asRecord(row)
  const baseModel = normalizeBaseModel(record)

  return {
    ...baseModel,
     id: text(pick(record, "id", "Id")),
     controller: text(pick(record, "controller", "Controller")),
     name: text(pick(record, "name", "Name")),
     permissionKey: text(pick(record, "permissionKey", "PermissionKey")),
     systemGroupId: text(pick(record, "systemGroupId", "SystemGroupId")),

    systemGroup: nullableText(pick(record, "systemGroup", "SystemGroup")),
    sort: numberValue(pick(record, "sort", "Sort")),
    canView: boolValue(pick(record, "canView", "CanView")),
    canAdd: boolValue(pick(record, "canAdd", "CanAdd")),
    canUpdate: boolValue(pick(record, "canUpdate", "CanUpdate")),
    canDelete: boolValue(pick(record, "canDelete", "CanDelete")),
    canApprove: boolValue(pick(record, "canApprove", "CanApprove")),
    canAnalyze: boolValue(pick(record, "canAnalyze", "CanAnalyze")),
    isShowMenu: boolValue(pick(record, "isShowMenu", "IsShowMenu")),
  }
}

export function normalizeMenuDetail(row: unknown): MenuDetailModel {
  const record = asRecord(row)

  return {
    ...normalizeMenu(record),
    folderUpload: normalizeFolderUpload(record),
  }
}

export function normalizeSystemGroup(row: unknown): SystemGroupModel {
  const record = asRecord(row)
  const baseModel = normalizeBaseModel(record)

  return {
    ...baseModel,
    id: text(pick(record, "id", "Id")),
    name: text(pick(record, "name", "Name")),
    parentId:
      pick(record, "parentId", "ParentId") === undefined
        ? null
        : nullableText(pick(record, "parentId", "ParentId")),
    parent: nullableText(pick(record, "parent", "Parent")),
  }
}

export function normalizeSystemGroupDetail(row: unknown): SystemGroupDetailModel {
  const record = asRecord(row)

  return {
    ...normalizeSystemGroup(record),
    folderUpload: normalizeFolderUpload(record),
  }
}

export function normalizeAuditLog(row: unknown): AuditLogModel {
  const record = asRecord(row)

  return {
    id: text(pick(record, "id", "Id")),
    userId: text(pick(record, "userId", "UserId")),
    userName: text(pick(record, "userName", "UserName")),
    action: text(pick(record, "action", "Action")),
    entityName: text(pick(record, "entityName", "EntityName")),
    entityId: nullableText(pick(record, "entityId", "EntityId")),
    oldValues: nullableText(pick(record, "oldValues", "OldValues")),
    newValues: nullableText(pick(record, "newValues", "NewValues")),
    ipAddress: nullableText(pick(record, "ipAddress", "IpAddress")),
    serviceName: nullableText(pick(record, "serviceName", "ServiceName")),
    isSuccess: boolValue(pick(record, "isSuccess", "IsSuccess")),
    errorMessage: nullableText(pick(record, "errorMessage", "ErrorMessage")),
    createdAt: text(pick(record, "createdAt", "CreatedAt")),
  }
}

export function normalizeAuditLogDetail(row: unknown): AuditLogDetailModel {
  return normalizeAuditLog(row)
}

export function normalizeComboboxOption(row: unknown): ComboboxOption {
  const record = asRecord(row)
  const value = text(pick(record, "value", "Value"))
  const label = text(pick(record, "text", "Text", "label", "Label"), value)

  return {
    label,
    value,
    sort: pick(record, "sort", "Sort") === undefined ? undefined : numberValue(pick(record, "sort", "Sort")),
    parent: nullableText(pick(record, "parent", "Parent")),
    isSelected: boolValue(pick(record, "isSelected", "IsSelected")),
  }
}

export function normalizePermission(row: unknown): PermissionMenuModel {
  const record = asRecord(row)
  const permissionKey = pick(record, "permissionKey", "PermissionKey")

  return {
    id: text(pick(record, "id", "Id")),
    roleId: text(pick(record, "roleId", "RoleId")),
    menuId: text(pick(record, "menuId", "MenuId")),
    ...(permissionKey === undefined ? {} : { permissionKey: nullableText(permissionKey) }),
    name: nullableText(pick(record, "name", "Name")),
    isViewed: boolValue(pick(record, "isViewed", "IsViewed")),
    isAdded: boolValue(pick(record, "isAdded", "IsAdded")),
    isUpdated: boolValue(pick(record, "isUpdated", "IsUpdated")),
    isDeleted: boolValue(pick(record, "isDeleted", "IsDeleted")),
    isApproved: boolValue(pick(record, "isApproved", "IsApproved")),
    isAnalyzed: boolValue(pick(record, "isAnalyzed", "IsAnalyzed")),
    canView: boolValue(pick(record, "canView", "CanView")),
    canAdd: boolValue(pick(record, "canAdd", "CanAdd")),
    canUpdate: boolValue(pick(record, "canUpdate", "CanUpdate")),
    canDelete: boolValue(pick(record, "canDelete", "CanDelete")),
    canApprove: boolValue(pick(record, "canApprove", "CanApprove")),
    canAnalyze: boolValue(pick(record, "canAnalyze", "CanAnalyze")),
  }
}

export function normalizePermissionGroups(payload: unknown): PermissionGroupModel[] {
  const record = asRecord(payload)
  const rawGroups = Array.isArray(payload)
    ? payload
    : pick(record, "data", "Data", "groups", "Groups")
  const groups = Array.isArray(rawGroups) ? rawGroups : []

  return groups.map((group) => {
    const record = asRecord(group)
    const rawRoles = pick(record, "roles", "Roles")

    return {
      systemGroup: text(pick(record, "systemGroup", "SystemGroup")),
      roles: Array.isArray(rawRoles) ? rawRoles.map(normalizePermission) : [],
    }
  })
}
