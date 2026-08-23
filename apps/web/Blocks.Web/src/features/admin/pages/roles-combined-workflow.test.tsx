// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockAdminApi } = vi.hoisted(() => ({
  mockAdminApi: {
    getRoles: vi.fn(),
    getPermissionsByRole: vi.fn(),
    updatePermissions: vi.fn(),
    createRole: vi.fn(),
  },
}))

vi.mock("@/features/auth/token-store", () => ({
  createBrowserTokenStore: () => ({ getAccessToken: () => null }),
}))
vi.mock("@/lib/api/client", () => ({
  createApiClient: () => ({ request: vi.fn() }),
}))
vi.mock("../system-admin-api", () => ({
  createSystemAdminApi: () => mockAdminApi,
}))

import { RolesPage } from "./roles-page"

function permissionRows() {
  return [{
    systemGroup: "Hệ thống",
    roles: [{
      id: "permission-1", roleId: "role-1", menuId: "menu-1", permissionKey: "workspace.home",
      name: "Không gian cá nhân", isViewed: true, isAdded: false, isUpdated: false,
      isDeleted: false, isApproved: false, isAnalyzed: false, canView: true, canAdd: false,
      canUpdate: false, canDelete: false, canApprove: false, canAnalyze: false,
    }],
  }]
}

describe("RolesPage combined workflow", () => {
  beforeEach(() => {
    mockAdminApi.getRoles.mockReset()
    mockAdminApi.getPermissionsByRole.mockReset()
    mockAdminApi.updatePermissions.mockReset()
    mockAdminApi.createRole.mockReset()
  })

  it("shows role safety fields and saves permission changes from same surface", async () => {
    mockAdminApi.getRoles.mockResolvedValue({
      data: [{ id: "role-1", name: "Thành viên", key: "member", isSystem: true, isRegistrationEligible: true, isDefaultRegistrationRole: true }],
      totalRow: 1,
    })
    mockAdminApi.getPermissionsByRole.mockResolvedValue(permissionRows())
    mockAdminApi.updatePermissions.mockResolvedValue(true)

    const user = userEvent.setup()
    render(<RolesPage />)

    expect(await screen.findByText("member")).toBeTruthy()
    expect(screen.getAllByText(/vai trò hệ thống/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/vai trò đăng ký mặc định/i).length).toBeGreaterThan(0)
    await user.click(screen.getByRole("checkbox", { name: /xem.*không gian cá nhân/i }))
    await user.click(screen.getByRole("button", { name: /lưu phân quyền/i }))

    await waitFor(() => expect(mockAdminApi.updatePermissions).toHaveBeenCalledTimes(1))
  })
})
