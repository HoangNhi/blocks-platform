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
    saveRole: vi.fn(),
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
    mockAdminApi.saveRole.mockReset()
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
    mockAdminApi.saveRole.mockResolvedValue({})

    const user = userEvent.setup()
    render(<RolesPage />)

    expect(await screen.findByText("member")).toBeTruthy()
    expect(screen.getAllByText(/hệ thống/i).length).toBeGreaterThan(0)
    expect(screen.queryByText(/mặc định đăng ký/i)).toBeNull()

    await user.click(screen.getByRole("button", { name: /mở thao tác hàng/i }))
    await user.click(await screen.findByRole("menuitem", { name: /phân quyền/i }))

    const permissionCheckbox = await screen.findByRole("checkbox", { name: /xem.*không gian cá nhân/i })
    await user.click(permissionCheckbox)
    await user.click(screen.getByRole("tab", { name: /thông tin/i }))
    const nameInput = screen.getByRole("textbox", { name: /tên vai trò/i })
    await user.clear(nameInput)
    await user.type(nameInput, "Thành viên nâng cao")
    await user.click(screen.getByRole("tab", { name: /phân quyền/i }))
    expect(screen.getByText(/thay đổi chưa lưu/i)).toBeTruthy()

    await user.click(screen.getByRole("button", { name: /^lưu$/i }))

    await waitFor(() => {
      expect(mockAdminApi.saveRole).toHaveBeenCalledTimes(1)
    })
    expect(mockAdminApi.updateRole).not.toHaveBeenCalled()
    expect(mockAdminApi.updatePermissions).not.toHaveBeenCalled()
    expect(mockAdminApi.saveRole).toHaveBeenCalledWith(expect.objectContaining({
      id: "role-1",
      details: expect.objectContaining({ name: "Thành viên nâng cao", key: "member" }),
      permissions: expect.arrayContaining([expect.objectContaining({ menuId: "menu-1", isViewed: false })]),
    }))
  })
})
