// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockAdminApi } = vi.hoisted(() => ({
  mockAdminApi: {
    getRoles: vi.fn(),
    getRoleById: vi.fn(),
    getPermissionsByRole: vi.fn(),
    updatePermissions: vi.fn(),
    updateRole: vi.fn(),
    createRole: vi.fn(),
    deleteRoles: vi.fn(),
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

describe("RolesPage permission dialog workflow", () => {
  beforeEach(() => {
    mockAdminApi.getRoles.mockReset()
    mockAdminApi.getRoleById.mockReset()
    mockAdminApi.getPermissionsByRole.mockReset()
    mockAdminApi.updatePermissions.mockReset()
    mockAdminApi.updateRole.mockReset()
    mockAdminApi.createRole.mockReset()
    mockAdminApi.deleteRoles.mockReset()
  })

  it("edits role information and permissions from the same popup", async () => {
    mockAdminApi.getRoles.mockResolvedValue({
      data: [{ id: "role-1", name: "Thành viên", key: "member", isSystem: true, isRegistrationEligible: true, isDefaultRegistrationRole: true, isActived: true }],
      totalRow: 1,
    })
    mockAdminApi.getRoleById.mockResolvedValue({
      id: "role-1",
      name: "Thành viên",
      key: "member",
      isSystem: true,
      isRegistrationEligible: true,
      isDefaultRegistrationRole: true,
      folderUpload: "folder-role-1",
      isActived: true,
    })
    mockAdminApi.getPermissionsByRole.mockResolvedValue(permissionRows())
    mockAdminApi.updatePermissions.mockResolvedValue(true)
    mockAdminApi.updateRole.mockResolvedValue(true)

    const user = userEvent.setup()
    render(<RolesPage />)

    expect(await screen.findByText("member")).toBeTruthy()
    expect(screen.getAllByText(/hệ thống/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/mặc định đăng ký/i).length).toBeGreaterThan(0)

    await user.click(screen.getByRole("button", { name: /mở thao tác hàng/i }))
    await user.click(await screen.findByRole("menuitem", { name: /phân quyền/i }))

    const permissionCheckbox = await screen.findByRole("checkbox", { name: /xem.*không gian cá nhân/i })
    await user.click(permissionCheckbox)
    expect(screen.getByText(/có thay đổi chưa lưu/i)).toBeTruthy()

    await user.click(screen.getByRole("button", { name: /^lưu$/i }))

    await waitFor(() => {
      expect(mockAdminApi.updateRole).toHaveBeenCalledTimes(1)
      expect(mockAdminApi.updatePermissions).toHaveBeenCalledTimes(1)
    })
  })
})
