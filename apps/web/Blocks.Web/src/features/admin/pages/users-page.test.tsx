// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.setConfig({ testTimeout: 10000 })

const { mockAdminApi, mockFilesApi } = vi.hoisted(() => ({
  mockAdminApi: {
    getUsers: vi.fn(),
    getRoles: vi.fn(),
    getUserById: vi.fn(),
    createUser: vi.fn(),
    updateUser: vi.fn(),
    deleteUsers: vi.fn(),
  },
  mockFilesApi: {
    uploadTemporary: vi.fn(),
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

vi.mock("@/features/files/files-api", () => ({
  createFilesApi: () => mockFilesApi,
}))

vi.mock("../system-admin-api", () => ({
  createSystemAdminApi: () => mockAdminApi,
}))

import { UsersPage } from "./users-page"

function getFileInput() {
  const fileInput = document.body.querySelector<HTMLInputElement>('input[type="file"]')

  if (!fileInput) {
    throw new Error("Không tìm thấy ô chọn tệp.")
  }

  return fileInput
}

describe("UsersPage", () => {
  beforeEach(() => {
    mockAdminApi.getUsers.mockReset()
    mockAdminApi.getRoles.mockReset()
    mockAdminApi.getUserById.mockReset()
    mockAdminApi.createUser.mockReset()
    mockAdminApi.updateUser.mockReset()
    mockAdminApi.deleteUsers.mockReset()
    mockFilesApi.uploadTemporary.mockReset()
  })

  it("mở dialog tạo mới, tải avatar tạm, lưu và thêm tiếp, rồi giữ dialog mở với form rỗng", async () => {
    mockAdminApi.getRoles.mockResolvedValue({
      data: [{ id: "role-1", name: "Administrator" }],
      totalRow: 1,
    })
    mockAdminApi.getUsers
      .mockResolvedValueOnce({
        data: [
          {
            id: "user-1",
            username: "admin",
            fullname: "Admin",
            roleId: "role-1",
            roleName: "Administrator",
            email: "admin@example.com",
            avatar: null,
            isActived: true,
          },
        ],
        totalRow: 1,
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: "user-1",
            username: "admin",
            fullname: "Admin",
            roleId: "role-1",
            roleName: "Administrator",
            email: "admin@example.com",
            avatar: null,
            isActived: true,
          },
          {
            id: "user-2",
            username: "newuser",
            fullname: "New User",
            roleId: "role-1",
            roleName: "Administrator",
            email: "new@example.com",
            avatar: null,
            isActived: true,
          },
        ],
        totalRow: 2,
      })

    mockFilesApi.uploadTemporary.mockResolvedValue(undefined)
    mockAdminApi.createUser.mockResolvedValue({
      id: "user-2",
      username: "newuser",
      fullname: "New User",
      roleId: "role-1",
      roleName: "Administrator",
      email: "new@example.com",
      avatar: null,
      password: "secret-123",
      folderUpload: "folder-user-2",
      isActived: true,
    })

    const user = userEvent.setup()
    render(<UsersPage />)

    await screen.findByText("admin")

    await user.click(screen.getByRole("button", { name: /thêm tài khoản/i }))

    const usernameInput = screen.getByRole("textbox", { name: /tên đăng nhập/i })
    const fullnameInput = screen.getByRole("textbox", { name: /họ và tên/i })
    const emailInput = screen.getByRole("textbox", { name: /email/i })
    const passwordInput = screen.getByLabelText(/mật khẩu/i)
    const roleTrigger = screen.getByRole("combobox", { name: /vai trò/i })

    fireEvent.change(usernameInput, { target: { value: "newuser" } })

    const dialog = screen.getByRole("dialog")
    expect(dialog.querySelector('[data-slot="avatar"]')?.getAttribute("data-size")).toBe("default")
    expect(dialog.querySelector('[data-slot="avatar"]')?.classList.contains("size-20")).toBe(true)
    expect(dialog.querySelector("#user-password")?.closest('[data-slot="form-item"]')?.classList.contains("w-full")).toBe(true)
    expect(dialog.querySelector("#user-role")?.closest('[data-slot="form-item"]')?.classList.contains("w-full")).toBe(true)
    expect(dialog.querySelector("#user-status")?.closest('[data-slot="form-item"]')?.classList.contains("w-full")).toBe(true)
    fireEvent.change(fullnameInput, { target: { value: "New User" } })
    fireEvent.change(emailInput, { target: { value: "new@example.com" } })
    fireEvent.change(passwordInput, { target: { value: "secret-123" } })

    roleTrigger.focus()
    fireEvent.keyDown(roleTrigger, { key: "ArrowDown" })
    await user.click(await screen.findByRole("option", { name: "Administrator" }))

    fireEvent.change(getFileInput(), {
      target: {
        files: [new File(["avatar"], "avatar.png", { type: "image/png" })],
      },
    })

    await user.click(screen.getByRole("button", { name: /^Lưu và thêm tiếp$/i }))

    await waitFor(() => {
      expect(mockFilesApi.uploadTemporary).toHaveBeenCalledTimes(1)
      expect(mockAdminApi.createUser).toHaveBeenCalledTimes(1)
    })

    expect(mockFilesApi.uploadTemporary.mock.invocationCallOrder[0]).toBeLessThan(
      mockAdminApi.createUser.mock.invocationCallOrder[0],
    )
    expect(mockFilesApi.uploadTemporary).toHaveBeenCalledWith({
      folderName: expect.any(String),
      files: [expect.any(File)],
    })
    expect(mockAdminApi.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        username: "newuser",
        fullname: "New User",
        email: "new@example.com",
        roleId: "role-1",
        password: "secret-123",
        avatar: null,
      }),
    )

    await waitFor(() => {
      expect(mockAdminApi.getUsers).toHaveBeenCalledTimes(2)
    })

    expect(screen.getByRole("dialog")).toBeTruthy()
    const dialogButtons = within(screen.getByRole("dialog")).getAllByRole("button")
    expect((dialogButtons.at(-1) as HTMLButtonElement | undefined)?.disabled).toBe(false)
    expect((dialogButtons.at(-2) as HTMLButtonElement | undefined)?.disabled).toBe(false)
    expect((screen.getByRole("textbox", { name: /tên đăng nhập/i }) as HTMLInputElement).value).toBe("")
    expect((screen.getByRole("textbox", { name: /họ và tên/i }) as HTMLInputElement).value).toBe("")
    expect((screen.getByRole("textbox", { name: /email/i }) as HTMLInputElement).value).toBe("")
    expect((screen.getByLabelText(/mật khẩu/i) as HTMLInputElement).value).toBe("")
    expect((screen.getByRole("combobox", { name: /vai trò/i }) as HTMLElement).textContent).toContain("Chọn vai trò")
  })

  it("mở dialog chỉnh sửa, giữ nguyên mật khẩu placeholder khi để trống và tải avatar tạm trước khi cập nhật", async () => {
    mockAdminApi.getRoles.mockResolvedValue({
      data: [{ id: "role-1", name: "Administrator" }],
      totalRow: 1,
    })
    mockAdminApi.getUsers
      .mockResolvedValueOnce({
        data: [
          {
            id: "user-1",
            username: "admin",
            fullname: "Admin",
            roleId: "role-1",
            roleName: "Administrator",
            email: "admin@example.com",
            avatar: "/avatars/admin.png",
            isActived: true,
          },
        ],
        totalRow: 1,
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: "user-1",
            username: "admin",
            fullname: "Admin updated",
            roleId: "role-1",
            roleName: "Administrator",
            email: "admin@example.com",
            avatar: "/avatars/admin-updated.png",
            isActived: true,
          },
        ],
        totalRow: 1,
      })

    mockAdminApi.getUserById.mockResolvedValue({
      id: "user-1",
      username: "admin",
      fullname: "Admin",
      password: "placeholder-token",
      roleId: "role-1",
      roleName: "Administrator",
      email: "admin@example.com",
      avatar: "/avatars/admin.png",
      folderUpload: "folder-user-1",
      isActived: true,
    })

    mockFilesApi.uploadTemporary.mockResolvedValue(undefined)
    mockAdminApi.updateUser.mockResolvedValue({
      id: "user-1",
      username: "admin",
      fullname: "Admin updated",
      roleId: "role-1",
      roleName: "Administrator",
      email: "admin@example.com",
      avatar: "/avatars/admin-updated.png",
      password: "placeholder-token",
      folderUpload: "folder-user-1",
      isActived: true,
    })

    const user = userEvent.setup()
    render(<UsersPage />)

    await screen.findByText("admin")

    await user.click(screen.getByRole("button", { name: /mở thao tác hàng/i }))
    await user.click(await screen.findByRole("menuitem", { name: /sửa/i }))

    await screen.findByRole("dialog")
    expect((screen.getByLabelText(/mật khẩu/i) as HTMLInputElement).value).toBe("")
    expect(screen.getByText("Đang dùng ảnh hiện tại.")).toBeTruthy()

    fireEvent.change(getFileInput(), {
      target: {
        files: [new File(["avatar"], "avatar.png", { type: "image/png" })],
      },
    })

    await user.click(screen.getByRole("button", { name: /^Lưu$/i }))

    await waitFor(() => {
      expect(mockFilesApi.uploadTemporary).toHaveBeenCalledTimes(1)
      expect(mockAdminApi.updateUser).toHaveBeenCalledTimes(1)
    })

    expect(mockFilesApi.uploadTemporary.mock.invocationCallOrder[0]).toBeLessThan(
      mockAdminApi.updateUser.mock.invocationCallOrder[0],
    )
    expect(mockAdminApi.updateUser).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "user-1",
        username: "admin",
        fullname: "Admin",
        email: "admin@example.com",
        roleId: "role-1",
        password: "placeholder-token",
        avatar: "/avatars/admin.png",
      }),
    )

    await waitFor(() => {
      expect(mockAdminApi.getUsers).toHaveBeenCalledTimes(2)
    })

    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("does not send an avatar upload folder when editing without a new avatar", async () => {
    mockAdminApi.getRoles.mockResolvedValue({
      data: [{ id: "role-1", name: "Administrator" }],
      totalRow: 1,
    })
    mockAdminApi.getUsers.mockResolvedValue({
      data: [
        {
          id: "user-1",
          username: "admin",
          fullname: "Admin",
          roleId: "role-1",
          roleName: "Administrator",
          email: "admin@example.com",
          avatar: "/avatars/admin.png",
          isActived: true,
        },
      ],
      totalRow: 1,
    })
    mockAdminApi.getUserById.mockResolvedValue({
      id: "user-1",
      username: "admin",
      fullname: "Admin",
      password: "placeholder-token",
      roleId: "role-1",
      roleName: "Administrator",
      email: "admin@example.com",
      avatar: "/avatars/admin.png",
      folderUpload: "folder-user-1",
      isActived: true,
    })
    mockAdminApi.updateUser.mockResolvedValue(undefined)

    const user = userEvent.setup()
    render(<UsersPage />)

    await screen.findByText("admin")
    await user.click(screen.getByRole("button", { name: /mở thao tác hàng/i }))
    await user.click(await screen.findByRole("menuitem", { name: /sửa/i }))
    await user.click(screen.getByRole("button", { name: /^Lưu$/i }))

    await waitFor(() => {
      expect(mockAdminApi.updateUser).toHaveBeenCalledWith(
        expect.objectContaining({ folderUpload: "" }),
      )
    })
    expect(mockFilesApi.uploadTemporary).not.toHaveBeenCalled()
  })

  it("restores the table after confirming a bulk delete", async () => {
    mockAdminApi.getRoles.mockResolvedValue({
      data: [{ id: "role-1", name: "Administrator" }],
      totalRow: 1,
    })
    mockAdminApi.getUsers
      .mockResolvedValueOnce({
        data: [
          {
            id: "user-1",
            username: "admin",
            fullname: "Admin",
            roleId: "role-1",
            roleName: "Administrator",
            email: "admin@example.com",
            isActived: true,
          },
        ],
        totalRow: 1,
      })
      .mockResolvedValueOnce({
        data: [],
        totalRow: 0,
      })

    mockAdminApi.deleteUsers.mockResolvedValue(undefined)

    render(<UsersPage />)

    await screen.findByText("admin")

    const checkboxes = screen.getAllByRole("checkbox")
    fireEvent.click(checkboxes[1])

    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: /xóa/i }))
    await user.click(screen.getByRole("button", { name: /xác nhận xóa/i }))

    await waitFor(() => {
      expect(mockAdminApi.deleteUsers).toHaveBeenCalledWith(["user-1"])
    })

    await screen.findByText(/không có tài khoản/i)

    expect(
      (screen.getByRole("button", { name: /xóa/i }) as HTMLButtonElement).disabled,
    ).toBe(true)
    expect(screen.queryByRole("button", { name: /xác nhận xóa/i })).toBeNull()
  })

  it("reloads users with selected role and status filters", async () => {
    mockAdminApi.getRoles.mockResolvedValue({
      data: [{ id: "role-1", name: "Administrator" }],
      totalRow: 1,
    })
    mockAdminApi.getUsers.mockResolvedValue({ data: [], totalRow: 0 })

    const user = userEvent.setup()
    render(<UsersPage />)

    const roleFilter = screen.getByRole("combobox", { name: /vai trò/i })
    roleFilter.focus()
    fireEvent.keyDown(roleFilter, { key: "ArrowDown" })
    await user.click(await screen.findByRole("option", { name: "Administrator" }))
    const statusFilter = screen.getByRole("combobox", { name: /trạng thái/i })
    statusFilter.focus()
    fireEvent.keyDown(statusFilter, { key: "ArrowDown" })
    await user.click(await screen.findByRole("option", { name: /không hoạt động/i }))

    await waitFor(() => {
      expect(mockAdminApi.getUsers).toHaveBeenLastCalledWith(
        expect.objectContaining({
          pageIndex: 1,
          roleId: "role-1",
          isActived: false,
        }),
      )
    })
  })

  it("renders grid toolbar hierarchy with filters open by default", async () => {
    mockAdminApi.getRoles.mockResolvedValue({ data: [], totalRow: 0 })
    mockAdminApi.getUsers.mockResolvedValue({ data: [], totalRow: 0 })

    render(<UsersPage />)

    await screen.findByText(/không có tài khoản/i)

    const heading = screen.getByRole("heading", { name: "Người dùng", level: 1 })
    const filterButton = screen.getByRole("button", { name: /^bộ lọc$/i })
    const search = screen.getByRole("searchbox", { name: /tìm tên/i })
    const refresh = screen.getByRole("button", { name: /^làm mới$/i })
    const deleteButton = screen.getByRole("button", { name: /xóa danh sách/i })
    const addButton = screen.getByRole("button", { name: /thêm tài khoản/i })

    expect(heading.closest('[data-slot="card"]')).toBeNull()
    expect(filterButton.getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByRole("combobox", { name: "Vai trò" })).toBeTruthy()
    expect(screen.queryByText(/^0 tài khoản/i)).toBeNull()
    expect(refresh.closest('[data-slot="card-footer"]')).toBeTruthy()
    expect(search.compareDocumentPosition(filterButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(filterButton.compareDocumentPosition(deleteButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(heading.compareDocumentPosition(refresh) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(deleteButton.compareDocumentPosition(addButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("shows row delete confirmation and refreshes users after confirmation", async () => {
    mockAdminApi.getRoles.mockResolvedValue({ data: [], totalRow: 0 })
    mockAdminApi.getUsers
      .mockResolvedValueOnce({
        data: [
          {
            id: "user-1",
            username: "admin",
            fullname: "Admin",
            roleId: "role-1",
            roleName: "Administrator",
            email: "admin@example.com",
            avatar: null,
            isActived: true,
          },
        ],
        totalRow: 1,
      })
      .mockResolvedValueOnce({ data: [], totalRow: 0 })
    mockAdminApi.deleteUsers.mockResolvedValue(undefined)

    const user = userEvent.setup()
    render(<UsersPage />)

    await screen.findByText("admin")
    await user.click(screen.getByRole("button", { name: /mở thao tác hàng/i }))

    expect(screen.getByRole("menuitem", { name: /xóa tài khoản/i })).toBeTruthy()
    await user.click(screen.getByRole("menuitem", { name: /xóa tài khoản/i }))

    const deleteDialog = screen.getByRole("dialog", { name: /xóa tài khoản/i })
    expect(within(deleteDialog).getByText(/admin/i)).toBeTruthy()
    await user.click(within(deleteDialog).getByRole("button", { name: /xóa tài khoản/i }))

    await waitFor(() => {
      expect(mockAdminApi.deleteUsers).toHaveBeenCalledWith(["user-1"])
    })
    await screen.findByText(/không có tài khoản/i)
  })
})
