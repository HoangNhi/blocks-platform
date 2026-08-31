import type { ApiClient } from "@/lib/api/client"
import type { PagingRequest } from "@/lib/api/types"

import type {
  AuditLogPagingRequest,
  ComboboxOption,
  InvitationCreateRequest,
  MenuUpsertRequest,
  RegistrationSettings,
  RoleUpsertRequest,
  SystemGroupUpsertRequest,
  UserUpsertRequest,
  UserPagingRequest,
} from "./types"
import {
  normalizeAuditLog,
  normalizeAuditLogDetail,
  normalizeComboboxOption,
  normalizeMenuDetail,
  normalizeMenu,
  normalizePagingResponse,
  normalizePermissionGroups,
  normalizeRoleDetail,
  normalizeRole,
  normalizeSystemGroup,
  normalizeSystemGroupDetail,
  normalizeUserDetail,
  normalizeUser,
} from "./admin-normalizers"

type SystemAdminApiOptions = Pick<ApiClient, "request">

export function createSystemAdminApi(client: SystemAdminApiOptions) {
  return {
    getRegistrationSettings: async () => {
      const response = await client.request<unknown>("/api/system/RegistrationAdmin/settings")
      const record = response as Record<string, unknown>
      return {
        registrationMode: (record.registrationMode ?? record.RegistrationMode ?? "admin_provisioned") as RegistrationSettings["registrationMode"],
        defaultRegistrationRoleId: (record.defaultRegistrationRoleId ?? record.DefaultRegistrationRoleId ?? null) as string | null,
      }
    },
    updateRegistrationSettings: async (body: RegistrationSettings) => {
      const response = await client.request<unknown>('/api/system/RegistrationAdmin/settings', {
        method: 'PUT',
        body,
      })
      const record = response as Record<string, unknown>
      return {
        registrationMode: (record.registrationMode ?? record.RegistrationMode ?? body.registrationMode) as RegistrationSettings["registrationMode"],
        defaultRegistrationRoleId: (record.defaultRegistrationRoleId ?? record.DefaultRegistrationRoleId ?? body.defaultRegistrationRoleId) as string | null,
      }
    },
    createInvitation: async (body: InvitationCreateRequest) => {
      const response = await client.request<unknown>('/api/system/RegistrationAdmin/invitations', {
        method: 'POST',
        body,
      })
      const record = response as Record<string, unknown>
      return {
        id: String(record.id ?? record.Id ?? ""),
        expiresAt: String(record.expiresAt ?? record.ExpiresAt ?? body.expiresAt),
        token: String(record.token ?? record.Token ?? ""),
      }
    },
    getUsers: async (body: UserPagingRequest) =>
      normalizePagingResponse(
        await client.request<unknown>("/api/system/User/get-list", {
          method: "POST",
          body,
        }),
        normalizeUser,
      ),
    getUserById: async (id: string) =>
      normalizeUserDetail(
        await client.request<unknown>("/api/system/User/get-by-id", {
          query: { id },
        }),
      ),
    createUser: async (body: UserUpsertRequest) =>
      normalizeUserDetail(
        await client.request<unknown>("/api/system/User/insert", {
          method: "POST",
          body,
        }),
      ),
    updateUser: async (body: UserUpsertRequest) =>
      normalizeUserDetail(
        await client.request<unknown>("/api/system/User/update", {
          method: "PUT",
          body,
        }),
      ),
    getRoles: async (body: PagingRequest) =>
      normalizePagingResponse(
        await client.request<unknown>("/api/system/Role/get-list", {
          method: "POST",
          body,
        }),
        normalizeRole,
      ),
    getRoleById: async (id: string) =>
      normalizeRoleDetail(
        await client.request<unknown>("/api/system/Role/get-by-id", {
          query: { id },
        }),
      ),
    createRole: async (body: RoleUpsertRequest) =>
      normalizeRoleDetail(
        await client.request<unknown>("/api/system/Role/insert", {
          method: "POST",
          body,
        }),
      ),
    updateRole: async (body: RoleUpsertRequest) =>
      normalizeRoleDetail(
        await client.request<unknown>("/api/system/Role/update", {
          method: "PUT",
          body,
        }),
      ),
    getMenus: async (body: PagingRequest) =>
      normalizePagingResponse(
        await client.request<unknown>("/api/system/Menu/get-list", {
          method: "POST",
          body,
        }),
        normalizeMenu,
      ),
    getMenuById: async (id: string) =>
      normalizeMenuDetail(
        await client.request<unknown>("/api/system/Menu/get-by-id", {
          query: { id },
        }),
      ),
    createMenu: async (body: MenuUpsertRequest) =>
      normalizeMenuDetail(
        await client.request<unknown>("/api/system/Menu/insert", {
          method: "POST",
          body,
        }),
      ),
    updateMenu: async (body: MenuUpsertRequest) =>
      normalizeMenuDetail(
        await client.request<unknown>("/api/system/Menu/update", {
          method: "PUT",
          body,
        }),
      ),
    getSystemGroups: async (body: PagingRequest) =>
      normalizePagingResponse(
        await client.request<unknown>("/api/system/SystemGroup/get-list", {
          method: "POST",
          body,
        }),
        normalizeSystemGroup,
      ),
    getSystemGroupById: async (id: string) =>
      normalizeSystemGroupDetail(
        await client.request<unknown>("/api/system/SystemGroup/get-by-id", {
          query: { id },
        }),
      ),
    createSystemGroup: async (body: SystemGroupUpsertRequest) =>
      normalizeSystemGroupDetail(
        await client.request<unknown>("/api/system/SystemGroup/insert", {
          method: "POST",
          body,
        }),
      ),
    updateSystemGroup: async (body: SystemGroupUpsertRequest) =>
      normalizeSystemGroupDetail(
        await client.request<unknown>("/api/system/SystemGroup/update", {
          method: "PUT",
          body,
        }),
      ),
    deleteSystemGroups: (ids: string[]) =>
      client.request<string>("/api/system/SystemGroup/delete-list", {
        method: "DELETE",
        body: { ids },
      }),
    getSystemGroupOptions: async (): Promise<ComboboxOption[]> => {
      const payload = await client.request<unknown>("/api/system/SystemGroup/get-all-combobox")
      return Array.isArray(payload) ? payload.map(normalizeComboboxOption) : []
    },
    getSystemGroupParentOptions: async (): Promise<ComboboxOption[]> => {
      const payload = await client.request<unknown>("/api/system/SystemGroup/get-all-not-parent-combobox")
      return Array.isArray(payload) ? payload.map(normalizeComboboxOption) : []
    },
    getAuditLogs: async (body: AuditLogPagingRequest) =>
      normalizePagingResponse(
        await client.request<unknown>("/api/system/AuditLog/get-list", {
          method: "POST",
          body,
        }),
        normalizeAuditLog,
      ),
    getAuditLogById: async (id: string) =>
      normalizeAuditLogDetail(
        await client.request<unknown>("/api/system/AuditLog/get-by-id", {
          query: { id },
        }),
      ),
    getPermissionsByRole: async (roleId: string) =>
      normalizePermissionGroups(
        await client.request<unknown>("/api/system/Role/get-permissions-by-role", {
          query: { id: roleId },
        }),
      ),
    updatePermissions: (permissions: unknown[]) =>
      client.request<boolean>("/api/system/Role/update-permissions", {
        method: "PUT",
        body: { permissions },
      }),
    deleteUsers: (ids: string[]) =>
      client.request<string>("/api/system/User/delete-list", {
        method: "DELETE",
        body: { ids },
      }),
    deleteRoles: (ids: string[]) =>
      client.request<string>("/api/system/Role/delete-list", {
        method: "DELETE",
        body: { ids },
      }),
    deleteMenus: (ids: string[]) =>
      client.request<string>("/api/system/Menu/delete-list", {
        method: "DELETE",
        body: { ids },
      }),
  }
}
