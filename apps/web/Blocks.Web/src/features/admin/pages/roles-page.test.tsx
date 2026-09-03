// @vitest-environment jsdom

import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.setConfig({ testTimeout: 10000 })

const { mockAdminApi } = vi.hoisted(() => ({
  mockAdminApi: {
    getRoles: vi.fn(),
    getRoleById: vi.fn(),
    createRole: vi.fn(),
    updateRole: vi.fn(),
    deleteRoles: vi.fn(),
    getPermissionsByRole: vi.fn(),
    updatePermissions: vi.fn(),
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

function renderRolesPage() {
  return render(
    <MemoryRouter>
      <RolesPage />
    </MemoryRouter>,
  )
}

describe("RolesPage", () => {
  beforeEach(() => {
    mockAdminApi.getRoles.mockReset()
    mockAdminApi.getRoleById.mockReset()
    mockAdminApi.createRole.mockReset()
    mockAdminApi.updateRole.mockReset()
    mockAdminApi.deleteRoles.mockReset()
    mockAdminApi.getPermissionsByRole.mockReset()
    mockAdminApi.updatePermissions.mockReset()
    mockAdminApi.getPermissionsByRole.mockResolvedValue([])
    mockAdminApi.updatePermissions.mockResolvedValue(true)
  })

  it("hiển thị danh sách vai trò theo cùng kiểu grid của trang người dùng", async () => {
    mockAdminApi.getRoles.mockResolvedValue({
      data: [{ id: "role-1", name: "Administrator", key: "administrator", isSystem: true, isActived: true }],
      totalRow: 1,
    })

    renderRolesPage()

    expect(await screen.findByRole("cell", { name: /Administrator/i })).toBeTruthy()
    expect(screen.getByPlaceholderText(/tìm theo tên hoặc mã vai trò/i)).toBeTruthy()
    expect(screen.getByRole("button", { name: /bộ lọc/i })).toBeTruthy()
    expect(screen.getByRole("button", { name: /thêm vai trò/i })).toBeTruthy()
  })

  it("mở dialog tạo mới, lưu và thêm tiếp, rồi giữ dialog mở với form rỗng", async () => {
    mockAdminApi.getRoles
      .mockResolvedValueOnce({
        data: [{ id: "role-1", name: "Administrator", key: "administrator", isSystem: true, isActived: true }],
        totalRow: 1,
      })
      .mockResolvedValueOnce({
        data: [
          { id: "role-1", name: "Administrator", key: "administrator", isSystem: true, isActived: true },
          { id: "role-2", name: "Editor", key: "editor", isActived: true },
        ],
        totalRow: 2,
      })

    mockAdminApi.createRole.mockResolvedValue({ id: "role-2", name: "Editor", folderUpload: "folder-role-2", isActived: true })

    const user = userEvent.setup()
    renderRolesPage()

    await screen.findByText("Administrator")
    await user.click(screen.getByRole("button", { name: /thêm vai trò/i }))
    await user.type(screen.getByRole("textbox", { name: /tên vai trò/i }), "Editor")
    await user.type(screen.getByRole("textbox", { name: /mã vai trò ổn định/i }), "editor")
    await user.click(screen.getByRole("button", { name: /^Lưu và thêm tiếp$/i }))

    await waitFor(() => {
      expect(mockAdminApi.createRole).toHaveBeenCalledTimes(1)
      expect(mockAdminApi.getRoles).toHaveBeenCalledTimes(2)
    })

    expect(screen.getByRole("dialog")).toBeTruthy()
    expect((screen.getByRole("textbox", { name: /tên vai trò/i }) as HTMLInputElement).value).toBe("")
  })

  it("mở popup chỉnh sửa và có tab phân quyền", async () => {
    mockAdminApi.getRoles.mockResolvedValue({
      data: [{ id: "role-1", name: "Administrator", key: "administrator", isSystem: true, isActived: true }],
      totalRow: 1,
    })
    mockAdminApi.getRoleById.mockResolvedValue({
      id: "role-1",
      name: "Administrator",
      key: "administrator",
      isSystem: true,
      isRegistrationEligible: false,
      folderUpload: "folder-role-1",
      isActived: true,
    })

    const user = userEvent.setup()
    renderRolesPage()

    await screen.findByText("Administrator")
    await user.click(screen.getByRole("button", { name: /mở thao tác hàng/i }))
    await user.click(await screen.findByRole("menuitem", { name: /sửa/i }))

    const dialog = screen.getByRole("dialog")
    expect(within(dialog).getByRole("tab", { name: /thông tin/i })).toBeTruthy()
    expect(within(dialog).getByRole("tab", { name: /phân quyền/i })).toBeTruthy()
    expect((within(dialog).getByRole("textbox", { name: /tên vai trò/i }) as HTMLInputElement).value).toBe("Administrator")
  })

  it("mở trực tiếp tab phân quyền từ menu thao tác hàng", async () => {
    mockAdminApi.getRoles.mockResolvedValue({
      data: [{ id: "role-1", name: "Administrator", key: "administrator", isSystem: true, isActived: true }],
      totalRow: 1,
    })
    mockAdminApi.getRoleById.mockResolvedValue({
      id: "role-1",
      name: "Administrator",
      key: "administrator",
      isSystem: true,
      isRegistrationEligible: false,
      folderUpload: "folder-role-1",
      isActived: true,
    })

    const user = userEvent.setup()
    renderRolesPage()

    await screen.findByText("Administrator")
    await user.click(screen.getByRole("button", { name: /mở thao tác hàng/i }))
    await user.click(await screen.findByRole("menuitem", { name: /phân quyền/i }))

    expect(screen.getByRole("tab", { name: /phân quyền/i }).getAttribute("data-state")).toBe("active")
  })
})
