import { describe, expect, it, vi } from "vitest"

import type { ApiClient } from "@/lib/api/client"

import { createSystemAdminApi } from "./system-admin-api"

function createApiClient(response: unknown): ApiClient {
  return { request: vi.fn(async () => response) } as unknown as ApiClient
}

describe("role save api", () => {
  it("sends false role filters without dropping them", async () => {
    const client = createApiClient({ PageIndex: 1, PageSize: 20, TotalRow: 0, Data: [] })
    const api = createSystemAdminApi(client)

    await api.getRoles({
      pageIndex: 1,
      pageSize: 20,
      textSearch: "custom",
      isActived: false,
      isSystem: false,
      isRegistrationEligible: false,
    })

    expect(vi.mocked(client.request)).toHaveBeenCalledWith(
      "/api/system/Role/get-list",
      expect.objectContaining({
        method: "POST",
        body: {
          pageIndex: 1,
          pageSize: 20,
          textSearch: "custom",
          isActived: false,
          isSystem: false,
          isRegistrationEligible: false,
        },
      }),
    )
  })

  it("normalizes save result and preserves saved scopes", async () => {
    const client = createApiClient({
      Role: {
        Id: "role-1",
        Name: "Member",
        Key: "member",
        IsActived: true,
        IsProtected: true,
      },
      SavedScopes: { Details: false, Permissions: true },
    })
    const api = createSystemAdminApi(client)

    const result = await api.saveRole({
      id: "role-1",
      permissions: [{
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

    expect(result).toMatchObject({
      role: { id: "role-1", name: "Member", key: "member", isProtected: true },
      savedScopes: { details: false, permissions: true },
    })
    expect(vi.mocked(client.request)).toHaveBeenCalledWith(
      "/api/system/Role/save",
      expect.objectContaining({ method: "PUT" }),
    )
  })
})
