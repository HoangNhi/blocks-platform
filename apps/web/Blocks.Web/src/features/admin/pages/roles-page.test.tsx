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
    saveRole: vi.fn(),
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
    mockAdminApi.saveRole.mockReset()
    mockAdminApi.getPermissionsByRole.mockResolvedValue([])
    mockAdminApi.updatePermissions.mockResolvedValue(true)
    mockAdminApi.saveRole.mockResolvedValue({})
  })

  it("hiển thị danh sách vai trò theo cùng kiểu grid của trang người dùng", async () => {
    mockAdminApi.getRoles.mockResolvedValue({
      data: [{ id: "role-1", name: "Administrator", key: "administrator", isSystem: true, isActived: true }],
      totalRow: 1,
    })

    renderRolesPage()

    expect(await screen.findByText("Administrator")).toBeTruthy()
    expect(screen.getByPlaceholderText(/tìm theo tên hoặc mã vai trò/i)).toBeTruthy()
    expect(screen.getByRole("button", { name: /^bộ lọc/i })).toBeTruthy()
    expect(screen.getByRole("button", { name: /thêm vai trò/i })).toBeTruthy()

    const search = screen.getByRole("searchbox", { name: /tìm kiếm vai trò/i })
    const filterButton = screen.getByRole("button", { name: /^bộ lọc$/i })
    const deleteButton = screen.getByRole("button", { name: /xóa danh sách/i })
    const addButton = screen.getByRole("button", { name: /thêm vai trò/i })

    expect(search.className).toContain("h-10")
    expect(search.className).toContain("pl-9")
    expect(filterButton.getAttribute("aria-expanded")).toBe("true")
    expect(deleteButton.className).toContain("text-destructive")
    expect(deleteButton.textContent).toContain("Xóa danh sách")
    expect(search.compareDocumentPosition(filterButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(filterButton.compareDocumentPosition(deleteButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(deleteButton.compareDocumentPosition(addButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("đồng bộ menu thao tác hàng với trang người dùng", async () => {
    mockAdminApi.getRoles.mockResolvedValue({
      data: [{ id: "role-1", name: "Administrator", key: "administrator", isSystem: true, isActived: true }],
      totalRow: 1,
    })

    const user = userEvent.setup()
    renderRolesPage()

    await screen.findByText("Administrator")
    await user.click(screen.getByRole("button", { name: /mở thao tác hàng/i }))

    const menu = await screen.findByRole("menu")
    expect(within(menu).getByText("Thao tác")).toBeTruthy()
    expect(within(menu).getByRole("menuitem", { name: "Cập nhật" })).toBeTruthy()
    expect(within(menu).getByRole("menuitem", { name: "Phân quyền" })).toBeTruthy()
    expect(within(menu).getByRole("menuitem", { name: "Xóa" })).toBeTruthy()
    expect(within(menu).queryByRole("menuitem", { name: "Sửa" })).toBeNull()
  })

  it("xóa vai trò từ menu thao tác hàng", async () => {
    mockAdminApi.getRoles
      .mockResolvedValueOnce({
        data: [{ id: "role-1", name: "Administrator", key: "administrator", isSystem: true, isActived: true }],
        totalRow: 1,
      })
      .mockResolvedValueOnce({ data: [], totalRow: 0 })
    mockAdminApi.deleteRoles.mockResolvedValue(true)

    const user = userEvent.setup()
    renderRolesPage()

    await screen.findByText("Administrator")
    await user.click(screen.getByRole("button", { name: /mở thao tác hàng/i }))
    await user.click(await screen.findByRole("menuitem", { name: "Xóa" }))

    const dialog = await screen.findByRole("alertdialog", { name: "Xóa vai trò" })
    expect(within(dialog).getByText("Administrator")).toBeTruthy()
    await user.click(within(dialog).getByRole("button", { name: "Xóa vai trò" }))

    await waitFor(() => {
      expect(mockAdminApi.deleteRoles).toHaveBeenCalledWith(["role-1"])
    })
    expect(await screen.findByText("Không có vai trò")).toBeTruthy()
  })

  it("renders role filters at full width with Users reset control", async () => {
    mockAdminApi.getRoles.mockResolvedValue({ data: [], totalRow: 0 })

    renderRolesPage()

    const statusFilter = await screen.findByRole("combobox", { name: /l\u1ECDc tr\u1EA1ng th\u00E1i/i })
    const roleTypeFilter = screen.getByRole("combobox", { name: /l\u1ECDc lo\u1EA1i vai tr\u00F2/i })
    const registrationFilter = screen.getByRole("combobox", { name: /l\u1ECDc quy\u1EC1n \u0111\u0103ng k\u00FD/i })
    const resetButton = screen.getByRole("button", { name: /\u0111\u1EB7t l\u1EA1i b\u1ED9 l\u1ECDc/i })

    for (const filterTrigger of [statusFilter, roleTypeFilter, registrationFilter]) {
      expect(filterTrigger.className).toContain("h-10")
      expect(filterTrigger.className).toContain("w-full")
    }

    const filterPanel = statusFilter.closest("div.rounded-lg")
    expect(filterPanel?.className).toContain("p-3")
    expect(filterPanel?.className).not.toContain("bg-muted/20")
    expect(resetButton.getAttribute("data-variant")).toBe("outline")
    expect((resetButton as HTMLButtonElement).disabled).toBe(false)
    expect(registrationFilter.compareDocumentPosition(resetButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("thay vai trò đăng ký hiện tại bằng vai trò mới và đặt lại bản nháp", async () => {
    mockAdminApi.getRoles
      .mockResolvedValueOnce({
        data: [{ id: "role-1", name: "Member", key: "member", isRegistrationEligible: true, isDefaultRegistrationRole: true, isActived: true }],
        totalRow: 1,
      })
      .mockResolvedValueOnce({
        data: [
          { id: "role-1", name: "Member", key: "member", isRegistrationEligible: false, isActived: true },
          { id: "role-2", name: "Editor", key: "editor", isRegistrationEligible: true, isDefaultRegistrationRole: true, isActived: true },
        ],
        totalRow: 2,
      })

    mockAdminApi.createRole.mockResolvedValue({
      id: "role-2",
      name: "Editor",
      folderUpload: "folder-role-2",
      isRegistrationEligible: true,
      isActived: true,
    })

    const user = userEvent.setup()
    renderRolesPage()

    await screen.findByText("Member")
    await user.click(screen.getByRole("button", { name: /thêm vai trò/i }))
    expect(screen.getByText(/chỉ một vai trò có thể được chọn/i)).toBeTruthy()
    const registrationCheckbox = screen.getByRole("checkbox", { name: /được phép đăng ký/i }) as HTMLButtonElement
    expect(registrationCheckbox.getAttribute("data-state")).toBe("unchecked")
    await user.click(registrationCheckbox)
    await user.type(screen.getByRole("textbox", { name: /tên vai trò/i }), "Editor")
    await user.type(screen.getByRole("textbox", { name: /mã vai trò ổn định/i }), "editor")
    await user.click(screen.getByRole("button", { name: /^Lưu và thêm tiếp$/i }))

    await waitFor(() => {
      expect(mockAdminApi.createRole).toHaveBeenCalledTimes(1)
      expect(mockAdminApi.createRole).toHaveBeenCalledWith(expect.objectContaining({
        name: "Editor",
        key: "editor",
        isRegistrationEligible: true,
      }))
      expect(mockAdminApi.getRoles).toHaveBeenCalledTimes(2)
    })

    expect(screen.getByRole("dialog")).toBeTruthy()
    expect((screen.getByRole("textbox", { name: /tên vai trò/i }) as HTMLInputElement).value).toBe("")
    expect((screen.getByRole("checkbox", { name: /được phép đăng ký/i }) as HTMLButtonElement).getAttribute("data-state")).toBe("unchecked")
    expect(screen.queryByText("Mặc định đăng ký")).toBeNull()
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
    await user.click(await screen.findByRole("menuitem", { name: /cập nhật/i }))

    const dialog = screen.getByRole("dialog")
    expect(within(dialog).getByRole("tab", { name: /thông tin/i })).toBeTruthy()
    expect(within(dialog).getByRole("tab", { name: /phân quyền/i })).toBeTruthy()
    expect((within(dialog).getByRole("textbox", { name: /tên vai trò/i }) as HTMLInputElement).value).toBe("Administrator")
  })

  it("mở dialog ngay khi chi tiết đang tải và khóa form đến khi tải xong", async () => {
    const detail = {
      id: "role-1",
      name: "Administrator",
      key: "administrator",
      isSystem: true,
      isRegistrationEligible: false,
      folderUpload: "folder-role-1",
      isActived: true,
    }
    let resolveDetail: (value: typeof detail) => void = () => undefined

    mockAdminApi.getRoles.mockResolvedValue({
      data: [detail],
      totalRow: 1,
    })
    mockAdminApi.getRoleById.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolveDetail = resolve
      }),
    )

    const user = userEvent.setup()
    renderRolesPage()

    await screen.findByText("Administrator")
    await user.click(screen.getByRole("button", { name: /mở thao tác hàng/i }))
    await user.click(await screen.findByRole("menuitem", { name: /cập nhật/i }))

    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText(/đang tải thông tin vai trò/i)).toBeTruthy()
    expect((within(dialog).getByRole("textbox", { name: /tên vai trò/i }) as HTMLInputElement).disabled).toBe(true)
    expect((within(dialog).getByRole("button", { name: /^lưu$/i }) as HTMLButtonElement).disabled).toBe(true)

    resolveDetail(detail)

    await waitFor(() => {
      expect((within(dialog).getByRole("textbox", { name: /tên vai trò/i }) as HTMLInputElement).disabled).toBe(false)
    })
  })

  it("giữ lỗi tải chi tiết trong dialog và cho phép thử lại", async () => {
    const detail = {
      id: "role-1",
      name: "Administrator",
      key: "administrator",
      isSystem: true,
      isRegistrationEligible: false,
      folderUpload: "folder-role-1",
      isActived: true,
    }
    mockAdminApi.getRoles.mockResolvedValue({ data: [detail], totalRow: 1 })
    mockAdminApi.getRoleById
      .mockRejectedValueOnce(new Error("detail timeout"))
      .mockResolvedValueOnce(detail)

    const user = userEvent.setup()
    renderRolesPage()

    await screen.findByText("Administrator")
    await user.click(screen.getByRole("button", { name: /mở thao tác hàng/i }))
    await user.click(await screen.findByRole("menuitem", { name: /cập nhật/i }))

    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByRole("alert").textContent).toContain("detail timeout")
    await user.click(within(dialog).getByRole("button", { name: /thử lại thông tin vai trò/i }))

    await waitFor(() => {
      expect((within(dialog).getByRole("textbox", { name: /tên vai trò/i }) as HTMLInputElement).disabled).toBe(false)
    })
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

  it("gửi bộ lọc máy chủ và giữ nguyên tìm kiếm khi đặt lại bộ lọc", async () => {
    mockAdminApi.getRoles.mockResolvedValue({ data: [], totalRow: 0 })
    const user = userEvent.setup()

    renderRolesPage()
    await screen.findByText("Không có vai trò")

    await user.click(screen.getByRole("combobox", { name: /lọc loại vai trò/i }))
    await user.click(await screen.findByRole("option", { name: "Tùy chỉnh" }))

    await waitFor(() => {
      expect(mockAdminApi.getRoles).toHaveBeenLastCalledWith(expect.objectContaining({
        isSystem: false,
      }))
    })

    const search = screen.getByRole("searchbox", { name: /tìm kiếm vai trò/i })
    await user.type(search, "member")
    await waitFor(() => {
      expect(mockAdminApi.getRoles).toHaveBeenLastCalledWith(expect.objectContaining({
        textSearch: "member",
        isSystem: false,
      }))
    }, { timeout: 2000 })

    await user.click(screen.getByRole("button", { name: /đặt lại bộ lọc/i }))
    await waitFor(() => {
      expect(mockAdminApi.getRoles).toHaveBeenLastCalledWith(expect.objectContaining({
        textSearch: "member",
        isSystem: undefined,
      }))
    })
  })

  it("hiển thị tên vai trò trong xác nhận xóa hàng loạt", async () => {
    mockAdminApi.getRoles.mockResolvedValue({
      data: [{ id: "role-1", name: "Member", key: "member", isActived: true }],
      totalRow: 1,
    })

    const user = userEvent.setup()
    renderRolesPage()
    await screen.findByText("Member")
    await user.click(screen.getByRole("checkbox", { name: "Chọn hàng Member" }))
    await user.click(screen.getByRole("button", { name: "Xóa danh sách (1)" }))

    const dialog = screen.getByRole("alertdialog")
    expect(within(dialog).getByText("Member")).toBeTruthy()
    expect(within(dialog).getByText("Vai trò đã chọn")).toBeTruthy()
  })

  it("vẫn lưu thông tin khi tải phân quyền thất bại", async () => {
    mockAdminApi.getRoles.mockResolvedValue({
      data: [{ id: "role-1", name: "Member", key: "member", isActived: true }],
      totalRow: 1,
    })
    mockAdminApi.getRoleById.mockResolvedValue({
      id: "role-1",
      name: "Member",
      key: "member",
      folderUpload: "folder-role-1",
      isActived: true,
    })
    mockAdminApi.getPermissionsByRole.mockRejectedValue(new Error("permission timeout"))

    const user = userEvent.setup()
    renderRolesPage()
    await screen.findByText("Member")
    await user.click(screen.getByRole("button", { name: /mở thao tác hàng/i }))
    await user.click(await screen.findByRole("menuitem", { name: /cập nhật/i }))
    await user.click(screen.getByRole("tab", { name: /phân quyền/i }))
    expect(await screen.findByRole("alert")).toBeTruthy()

    await user.click(screen.getByRole("tab", { name: /thông tin/i }))
    const nameInput = screen.getByRole("textbox", { name: /tên vai trò/i })
    const keyInput = screen.getByRole("textbox", { name: /mã vai trò ổn định/i })
    await user.clear(nameInput)
    await user.type(nameInput, "Member Updated")
    await user.clear(keyInput)
    await user.type(keyInput, "member.updated")
    await user.click(screen.getByRole("button", { name: /^lưu$/i }))

    await waitFor(() => expect(mockAdminApi.saveRole).toHaveBeenCalledTimes(1))
    expect(mockAdminApi.saveRole).toHaveBeenCalledWith({
      id: "role-1",
      details: {
        name: "Member Updated",
        key: "member.updated",
        isRegistrationEligible: false,
        isActived: true,
      },
    })
  })

  it("khóa lưu khi chỉnh sửa chưa có thay đổi", async () => {
    mockAdminApi.getRoles.mockResolvedValue({
      data: [{ id: "role-1", name: "Member", key: "member", isActived: true }],
      totalRow: 1,
    })
    mockAdminApi.getRoleById.mockResolvedValue({
      id: "role-1",
      name: "Member",
      key: "member",
      folderUpload: "folder-role-1",
      isActived: true,
    })

    const user = userEvent.setup()
    renderRolesPage()
    await screen.findByText("Member")
    await user.click(screen.getByRole("button", { name: /mở thao tác hàng/i }))
    await user.click(await screen.findByRole("menuitem", { name: /cập nhật/i }))

    expect((screen.getByRole("button", { name: /^lưu$/i }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("giữ bản nháp khi ở lại và xóa bản nháp khi bỏ thay đổi", async () => {
    mockAdminApi.getRoles.mockResolvedValue({
      data: [{ id: "role-1", name: "Member", key: "member", isActived: true }],
      totalRow: 1,
    })
    mockAdminApi.getRoleById.mockResolvedValue({
      id: "role-1",
      name: "Member",
      key: "member",
      folderUpload: "folder-role-1",
      isActived: true,
    })

    const user = userEvent.setup()
    renderRolesPage()
    await screen.findByText("Member")
    await user.click(screen.getByRole("button", { name: /mở thao tác hàng/i }))
    await user.click(await screen.findByRole("menuitem", { name: /cập nhật/i }))

    const nameInput = screen.getByRole("textbox", { name: /tên vai trò/i })
    await user.clear(nameInput)
    await user.type(nameInput, "Member draft")
    await user.click(screen.getByRole("button", { name: /^Hủy$/i }))

    expect(screen.getByRole("alertdialog")).toBeTruthy()
    await user.click(screen.getByRole("button", { name: /Ở lại/i }))
    expect((screen.getByRole("textbox", { name: /tên vai trò/i }) as HTMLInputElement).value).toBe("Member draft")

    await user.click(screen.getByRole("button", { name: /^Hủy$/i }))
    await user.click(screen.getByRole("button", { name: /Bỏ thay đổi/i }))

    expect(screen.queryByRole("dialog")).toBeNull()
  })
})
