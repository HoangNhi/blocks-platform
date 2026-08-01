import { describe, expect, it, vi } from "vitest"

import type { ApiClient } from "@/lib/api/client"

import { createSystemAdminApi } from "./system-admin-api"

function createApiClient(response: unknown): ApiClient {
  return {
    request: vi.fn(async () => response),
  } as unknown as ApiClient
}

describe("system admin api", () => {
  it("normalizes PascalCase user paging responses and strips password fields", async () => {
    const api = createSystemAdminApi(
      createApiClient({
        PageIndex: 1,
        PageSize: 20,
        TotalRow: 1,
        Data: [
          {
            Id: "user-1",
            Username: "admin",
            Fullname: "System Admin",
            RoleId: "role-1",
            RoleName: "Administrator",
            Role: "Administrator",
            Email: "admin@example.test",
            Avatar: null,
            Password: "hash-value",
            CreatedAt: "2026-05-10T00:00:00Z",
            UpdatedAt: "2026-05-10T01:00:00Z",
            IsActived: true,
          },
        ],
      }),
    )

    const result = await api.getUsers({ pageIndex: 1, pageSize: 20 })

    expect(result).toMatchObject({
      pageIndex: 1,
      pageSize: 20,
      totalRow: 1,
    })
    expect(Array.isArray(result.data)).toBe(true)
    expect(result.data).toHaveLength(1)
    expect(result.data[0]).toMatchObject({
      id: "user-1",
      username: "admin",
      fullname: "System Admin",
      roleId: "role-1",
      roleName: "Administrator",
      role: "Administrator",
      email: "admin@example.test",
      avatar: null,
      createdAt: "2026-05-10T00:00:00Z",
      updatedAt: "2026-05-10T01:00:00Z",
      isActived: true,
    })
    expect(result.data[0]).not.toHaveProperty("password")
  })

  it("fetches and normalizes user detail responses", async () => {
    const api = createSystemAdminApi(
      createApiClient({
        Id: "user-1",
        Username: "admin",
        Fullname: "System Admin",
        Password: "placeholder-token",
        RoleId: "role-1",
        RoleName: "Administrator",
        Email: "admin@example.test",
        Avatar: null,
        FolderUpload: "folder-user-1",
      }),
    )

    const result = await api.getUserById("user-1")

    expect(result).toMatchObject({
      id: "user-1",
      password: "placeholder-token",
      folderUpload: "folder-user-1",
      fullname: "System Admin",
    })
  })

  it("builds create and update user requests", async () => {
    const client = createApiClient({ Id: "user-1" })
    const api = createSystemAdminApi(client)

    await api.createUser({
      id: "user-1",
      username: "admin",
      fullname: "System Admin",
      password: "secret",
      roleId: "role-1",
      email: "admin@example.test",
      avatar: null,
      folderUpload: "folder-user-1",
      isActived: true,
    })

    await api.updateUser({
      id: "user-1",
      username: "admin",
      fullname: "System Admin",
      password: "secret",
      roleId: "role-1",
      email: "admin@example.test",
      avatar: "/avatars/admin.png",
      folderUpload: "folder-user-1",
      isActived: false,
    })

    expect(vi.mocked(client.request)).toHaveBeenNthCalledWith(
      1,
      "/api/system/User/insert",
      expect.objectContaining({
        method: "POST",
        body: expect.objectContaining({ username: "admin" }),
      }),
    )
    expect(vi.mocked(client.request)).toHaveBeenNthCalledWith(
      2,
      "/api/system/User/update",
      expect.objectContaining({
        method: "PUT",
        body: expect.objectContaining({ avatar: "/avatars/admin.png" }),
      }),
    )
  })

  it("normalizes PascalCase role paging responses", async () => {
    const api = createSystemAdminApi(
      createApiClient({
        PageIndex: 2,
        PageSize: 10,
        TotalRow: 1,
        Data: [
          {
            Id: "role-1",
            Name: "Administrator",
            IsActived: true,
            CreatedAt: "2026-05-10T00:00:00Z",
          },
        ],
      }),
    )

    const result = await api.getRoles({ pageIndex: 2, pageSize: 10 })

    expect(result.data).toEqual([
      expect.objectContaining({
        id: "role-1",
        name: "Administrator",
        isActived: true,
        createdAt: "2026-05-10T00:00:00Z",
      }),
    ])
  })

  it("fetches and normalizes role detail responses", async () => {
    const api = createSystemAdminApi(
      createApiClient({
        Id: "role-1",
        Name: "Administrator",
        FolderUpload: "folder-role-1",
      }),
    )

    await expect(api.getRoleById("role-1")).resolves.toMatchObject({
      id: "role-1",
      name: "Administrator",
      folderUpload: "folder-role-1",
    })
  })

  it("builds create and update role requests", async () => {
    const client = createApiClient({ Id: "role-1" })
    const api = createSystemAdminApi(client)

    await api.createRole({
      id: "role-1",
      name: "Administrator",
      folderUpload: "folder-role-1",
      isActived: true,
    })
    await api.updateRole({
      id: "role-1",
      name: "Administrator",
      folderUpload: "folder-role-1",
      isActived: false,
    })

    expect(vi.mocked(client.request)).toHaveBeenNthCalledWith(
      1,
      "/api/system/Role/insert",
      expect.objectContaining({ method: "POST" }),
    )
    expect(vi.mocked(client.request)).toHaveBeenNthCalledWith(
      2,
      "/api/system/Role/update",
      expect.objectContaining({ method: "PUT" }),
    )
  })

  it("normalizes PascalCase menu paging responses", async () => {
    const api = createSystemAdminApi(
      createApiClient({
        PageIndex: 1,
        PageSize: 10,
        TotalRow: 1,
        Data: [
          {
            Id: "menu-1",
            Controller: "User",
            Name: "Users",
            SystemGroupId: "identity",
            SystemGroup: "Identity",
            Sort: 10,
            CanView: true,
            CanAdd: false,
            CanUpdate: false,
            CanDelete: false,
            CanApprove: false,
            CanAnalyze: false,
            IsShowMenu: true,
            CreatedAt: "2026-05-10T00:00:00Z",
          },
        ],
      }),
    )

    const result = await api.getMenus({ pageIndex: 1, pageSize: 10 })

    expect(result.data[0]).toMatchObject({
      id: "menu-1",
      controller: "User",
      name: "Users",
      systemGroupId: "identity",
      systemGroup: "Identity",
      sort: 10,
      canView: true,
      canAdd: false,
      canUpdate: false,
      canDelete: false,
      canApprove: false,
      canAnalyze: false,
      isShowMenu: true,
      createdAt: "2026-05-10T00:00:00Z",
    })
  })

  it("fetches and normalizes menu detail responses", async () => {
    const api = createSystemAdminApi(
      createApiClient({
        Id: "menu-1",
        Controller: "User",
        Name: "Users",
        SystemGroupId: "identity",
        Sort: 10,
        CanView: true,
        CanAdd: false,
        CanUpdate: false,
        CanDelete: false,
        CanApprove: false,
        CanAnalyze: false,
        IsShowMenu: true,
        FolderUpload: "folder-menu-1",
      }),
    )

    await expect(api.getMenuById("menu-1")).resolves.toMatchObject({
      id: "menu-1",
      folderUpload: "folder-menu-1",
      systemGroupId: "identity",
    })
  })

  it("builds create and update menu requests", async () => {
    const client = createApiClient({ Id: "menu-1" })
    const api = createSystemAdminApi(client)

    await api.createMenu({
      id: "menu-1",
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
      folderUpload: "folder-menu-1",
    })
    await api.updateMenu({
      id: "menu-1",
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
      isShowMenu: false,
      folderUpload: "folder-menu-1",
    })

    expect(vi.mocked(client.request)).toHaveBeenNthCalledWith(
      1,
      "/api/system/Menu/insert",
      expect.objectContaining({ method: "POST" }),
    )
    expect(vi.mocked(client.request)).toHaveBeenNthCalledWith(
      2,
      "/api/system/Menu/update",
      expect.objectContaining({ method: "PUT" }),
    )
  })

  it("fetches, combines, and deletes system groups", async () => {
    const client = createApiClient({
      PageIndex: 1,
      PageSize: 10,
      TotalRow: 1,
      Data: [
        {
          Id: "group-1",
          Name: "Identity",
          ParentId: null,
          Parent: "System",
          Sort: 10,
          IsActived: true,
        },
      ],
    })
    const api = createSystemAdminApi(client)

    await expect(api.getSystemGroups({ pageIndex: 1, pageSize: 10 })).resolves.toMatchObject({
      data: [
        expect.objectContaining({
          id: "group-1",
          parent: "System",
        }),
      ],
    })

    await expect(
      api.getSystemGroupById("group-1"),
    ).resolves.toBeDefined()

    const optionsClient = createApiClient([
      {
        Text: "Identity",
        Value: "group-1",
        Sort: 10,
        Parent: "System",
        IsSelected: true,
      },
    ])
    const optionsApi = createSystemAdminApi(optionsClient)

    await expect(optionsApi.getSystemGroupOptions()).resolves.toEqual([
      {
        label: "Identity",
        value: "group-1",
        sort: 10,
        parent: "System",
        isSelected: true,
      },
    ])
    await expect(optionsApi.getSystemGroupParentOptions()).resolves.toEqual([
      {
        label: "Identity",
        value: "group-1",
        sort: 10,
        parent: "System",
        isSelected: true,
      },
    ])

    await api.deleteSystemGroups(["group-1"])

    expect(vi.mocked(client.request)).toHaveBeenCalledWith(
      "/api/system/SystemGroup/delete-list",
      expect.objectContaining({
        method: "DELETE",
        body: { ids: ["group-1"] },
      }),
    )
  })

  it("fetches and normalizes audit log detail responses", async () => {
    const api = createSystemAdminApi(
      createApiClient({
        Id: "audit-1",
        UserId: "user-1",
        UserName: "admin",
        Action: "LOGIN",
        EntityName: "Auth",
        EntityId: null,
        OldValues: null,
        NewValues: null,
        IpAddress: "127.0.0.1",
        ServiceName: "System",
        IsSuccess: true,
        ErrorMessage: null,
        CreatedAt: "2026-05-10T00:00:00Z",
      }),
    )

    await expect(api.getAuditLogById("audit-1")).resolves.toMatchObject({
      id: "audit-1",
      userName: "admin",
      action: "LOGIN",
      createdAt: "2026-05-10T00:00:00Z",
    })
  })

  it("normalizes PascalCase audit log paging responses", async () => {
    const api = createSystemAdminApi(
      createApiClient({
        PageIndex: 1,
        PageSize: 10,
        TotalRow: 1,
        Data: [
          {
            Id: "audit-1",
            UserId: "user-1",
            UserName: "admin",
            Action: "UPDATE_PERMISSIONS",
            EntityName: "Role",
            IsSuccess: true,
            CreatedAt: "2026-05-10T00:00:00Z",
          },
        ],
      }),
    )

    const result = await api.getAuditLogs({ pageIndex: 1, pageSize: 10 })

    expect(result.data[0]).toMatchObject({
      id: "audit-1",
      userId: "user-1",
      userName: "admin",
      action: "UPDATE_PERMISSIONS",
      entityName: "Role",
      isSuccess: true,
      createdAt: "2026-05-10T00:00:00Z",
    })
  })

  it("normalizes PascalCase permission groups and rows", async () => {
    const api = createSystemAdminApi(
      createApiClient([
        {
          SystemGroup: "Identity",
          Roles: [
            {
              Id: "permission-1",
              RoleId: "role-1",
              MenuId: "menu-1",
              Name: "Users",
              IsViewed: true,
              IsAdded: false,
              IsUpdated: false,
              IsDeleted: false,
              IsApproved: false,
              IsAnalyzed: false,
              CanView: true,
              CanAdd: false,
              CanUpdate: false,
              CanDelete: false,
              CanApprove: false,
              CanAnalyze: false,
            },
          ],
        },
      ]),
    )

    const result = await api.getPermissionsByRole("role-1")

    expect(result).toEqual([
      {
        systemGroup: "Identity",
        roles: [
          {
            id: "permission-1",
            roleId: "role-1",
            menuId: "menu-1",
            name: "Users",
            isViewed: true,
            isAdded: false,
            isUpdated: false,
            isDeleted: false,
            isApproved: false,
            isAnalyzed: false,
            canView: true,
            canAdd: false,
            canUpdate: false,
            canDelete: false,
            canApprove: false,
            canAnalyze: false,
          },
        ],
      },
    ])
  })
})
