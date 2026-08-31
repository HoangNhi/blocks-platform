import type { PagingRequest, PagingResponse } from "@/lib/api/types"

export type BaseModel = {
  createdAt?: string | null
  createdBy?: string | null
  updatedAt?: string | null
  updatedBy?: string | null
  isActived?: boolean
  isEdit?: boolean
  sort?: number | null
}

export type ComboboxOption = {
  label: string
  value: string
  sort?: number | null
  parent?: string | null
  isSelected?: boolean
}

export type UserModel = BaseModel & {
  id: string
  username: string
  fullname: string
  roleId: string
  roleName?: string | null
  role?: string | null
  email: string
  avatar?: string | null
}

export type UserPagingRequest = PagingRequest & {
  roleId?: string
  isActived?: boolean
}

export type UserDetailModel = UserModel & {
  password: string
  folderUpload: string
}

export type UserUpsertRequest = {
  id: string
  username: string
  fullname: string
  password: string
  roleId: string
  email: string
  avatar?: string | null
  folderUpload: string
  isActived?: boolean
  isEdit?: boolean
  sort?: number | null
}

export type RegistrationMode = "open" | "invite_only" | "admin_provisioned"

export type RegistrationSettings = {
  registrationMode: RegistrationMode
  defaultRegistrationRoleId: string | null
}

export type InvitationCreateRequest = {
  expiresAt: string
  targetWorkspaceId?: string | null
  registrationRoleId?: string | null
}

export type InvitationResponse = {
  id: string
  expiresAt: string
  token: string
}

export type RoleModel = BaseModel & {
  id: string
  name: string
  key?: string | null
  isSystem?: boolean
  isRegistrationEligible?: boolean
  isDefaultRegistrationRole?: boolean
}

export type RoleDetailModel = RoleModel & {
  folderUpload: string
}

export type RoleUpsertRequest = {
  id: string
  name: string
  key: string
  isRegistrationEligible: boolean
  folderUpload: string
  isActived?: boolean
  isEdit?: boolean
  sort?: number | null
}

export type MenuModel = BaseModel & {
  id: string
  controller: string
  permissionKey?: string | null
  name: string
  systemGroupId: string
  systemGroup?: string | null
  sort: number
  canView: boolean
  canAdd: boolean
  canUpdate: boolean
  canDelete: boolean
  canApprove: boolean
  canAnalyze: boolean
  isShowMenu: boolean
}

export type MenuDetailModel = MenuModel & {
  folderUpload: string
}

export type MenuUpsertRequest = {
  id: string
  controller: string
  name: string
  permissionKey: string
  systemGroupId: string
  sort?: number | null
  canView: boolean
  canAdd: boolean
  canUpdate: boolean
  canDelete: boolean
  canApprove: boolean
  canAnalyze: boolean
  isShowMenu: boolean
  folderUpload: string
  isActived?: boolean
  isEdit?: boolean
}

export type SystemGroupModel = BaseModel & {
  id: string
  name: string
  parentId: string | null
  parent: string | null
}

export type SystemGroupDetailModel = SystemGroupModel & {
  folderUpload: string
}

export type SystemGroupUpsertRequest = {
  id: string
  name: string
  parentId?: string | null
  sort?: number | null
  folderUpload: string
  isActived?: boolean
  isEdit?: boolean
}

export type PermissionMenuModel = {
  id: string
  roleId: string
  menuId: string
  permissionKey?: string | null
  name?: string | null
  isViewed: boolean
  isAdded: boolean
  isUpdated: boolean
  isDeleted: boolean
  isApproved: boolean
  isAnalyzed: boolean
  canView: boolean
  canAdd: boolean
  canUpdate: boolean
  canDelete: boolean
  canApprove: boolean
  canAnalyze: boolean
}

export type PermissionGroupModel = {
  systemGroup: string
  roles: PermissionMenuModel[]
}

export type AuditLogModel = {
  id: string
  userId: string
  userName: string
  action: string
  entityName: string
  entityId?: string | null
  oldValues?: string | null
  newValues?: string | null
  ipAddress?: string | null
  serviceName?: string | null
  isSuccess: boolean
  errorMessage?: string | null
  createdAt: string
}

export type AuditLogDetailModel = AuditLogModel

export type AuditLogPagingRequest = PagingRequest & {
  action?: string | null
  entityName?: string | null
  userId?: string | null
  serviceName?: string | null
  isSuccess?: boolean | null
}

export type AdminListResult<T> = PagingResponse<T>
