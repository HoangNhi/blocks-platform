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
  createBrowserTokenStore: () => ({
    getAccessToken: () => null,
  }),
}))

vi.mock("@/lib/api/client", () => ({
  createApiClient: () => ({
    request: vi.fn(),
  }),
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

  it("mở dialog tạo mới, lưu và thêm tiếp, rồi giữ dialog mở với form rỗng", async () => {
    mockAdminApi.getRoles
      .mockResolvedValueOnce({
        data: [
           {
             id: "role-1",
             name: "Administrator",
             key: "administrator",
             isSystem: true,
             isActived: true,
           },
        ],
        totalRow: 1,
      })
      .mockResolvedValueOnce({
        data: [
           {
             id: "role-1",
             name: "Administrator",
             key: "administrator",
             isSystem: true,
             isActived: true,
           },
          {
            id: "role-2",
            name: "Editor",
            isActived: true,
          },
        ],
        totalRow: 2,
      })

    mockAdminApi.createRole.mockResolvedValue({
      id: "role-2",
      name: "Editor",
      folderUpload: "folder-role-2",
      isActived: true,
    })

    const user = userEvent.setup()
    renderRolesPage()

    await screen.findByRole("cell", { name: "Administrator" })

    await user.click(screen.getByRole("button", { name: /^Thêm$/i }))
    await user.type(screen.getByRole("textbox", { name: /tên vai trò/i }), "Editor")
    await user.type(screen.getByRole("textbox", { name: /mã vai trò ổn định/i }), "editor")
    await user.click(screen.getByRole("button", { name: /^Lưu và thêm tiếp$/i }))

    await waitFor(() => {
      expect(mockAdminApi.createRole).toHaveBeenCalledTimes(1)
      expect(mockAdminApi.getRoles).toHaveBeenCalledTimes(2)
    })

    expect(mockAdminApi.createRole).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Editor",
      }),
    )

    expect(screen.getByRole("dialog")).toBeTruthy()
    const dialogButtons = within(screen.getByRole("dialog")).getAllByRole("button")
    expect((dialogButtons.at(-1) as HTMLButtonElement | undefined)?.disabled).toBe(false)
    expect((dialogButtons.at(-2) as HTMLButtonElement | undefined)?.disabled).toBe(false)
    expect((screen.getByRole("textbox", { name: /tên vai trò/i }) as HTMLInputElement).value).toBe("")
  })

  it("mở dialog chỉnh sửa và đóng sau khi lưu", async () => {
    mockAdminApi.getRoles
      .mockResolvedValueOnce({
        data: [
           {
             id: "role-1",
             name: "Administrator",
             key: "administrator",
             isSystem: true,
             isActived: true,
           },
        ],
        totalRow: 1,
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: "role-1",
            name: "Administrator updated",
            isActived: true,
          },
        ],
        totalRow: 1,
      })

    mockAdminApi.getRoleById.mockResolvedValue({
      id: "role-1",
      name: "Administrator",
      key: "administrator",
      isSystem: true,
      folderUpload: "folder-role-1",
      isActived: true,
    })

    mockAdminApi.updateRole.mockResolvedValue({
      id: "role-1",
      name: "Administrator updated",
      folderUpload: "folder-role-1",
      isActived: true,
    })

    const user = userEvent.setup()
    renderRolesPage()

    await screen.findByRole("cell", { name: "Administrator" })

    await user.click(screen.getByRole("button", { name: /mở thao tác hàng/i }))
    await user.click(await screen.findByRole("menuitem", { name: /sửa/i }))

    expect((screen.getByRole("textbox", { name: /tên vai trò/i }) as HTMLInputElement).value).toBe("Administrator")

    await user.clear(screen.getByRole("textbox", { name: /tên vai trò/i }))
    await user.type(screen.getByRole("textbox", { name: /tên vai trò/i }), "Administrator updated")
    await user.click(screen.getByRole("button", { name: /^Lưu$/i }))

    await waitFor(() => {
      expect(mockAdminApi.updateRole).toHaveBeenCalledTimes(1)
      expect(mockAdminApi.getRoles).toHaveBeenCalledTimes(2)
    })

    expect(screen.queryByRole("dialog")).toBeNull()
  })
  it("hiển thị Roles & Permissions trong cùng quy trình vai trò", async () => {
    mockAdminApi.getRoles.mockResolvedValue({
      data: [
        {
          id: "role-1",
          name: "Administrator",
          isActived: true,
        },
      ],
      totalRow: 1,
    })

    const user = userEvent.setup()
    renderRolesPage()

    await screen.findByRole("cell", { name: "Administrator" })

    await user.click(screen.getByRole("button", { name: /mở thao tác hàng/i }))

    const permissionAction = await screen.findByRole("menuitem", { name: /roles & permissions/i })
    expect(permissionAction.getAttribute("href")).toBeNull()
  })
})
