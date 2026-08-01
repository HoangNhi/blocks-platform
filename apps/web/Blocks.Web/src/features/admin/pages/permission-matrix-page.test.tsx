// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockAdminApi } = vi.hoisted(() => ({
  mockAdminApi: {
    getRoles: vi.fn(),
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

import { PermissionMatrixPage } from "./permission-matrix-page"

function renderPermissionMatrixPage(initialEntry = "/system/identity/permissions") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <PermissionMatrixPage />
    </MemoryRouter>,
  )
}

function createPermissionRows() {
  return [
    {
      systemGroup: "Hệ thống",
      roles: [
        {
          id: "permission-1",
          roleId: "role-1",
          menuId: "dashboard",
          name: "Dashboard",
          isViewed: true,
          isAdded: false,
          isUpdated: false,
          isDeleted: false,
          isApproved: false,
          isAnalyzed: false,
          canView: true,
          canAdd: true,
          canUpdate: true,
          canDelete: true,
          canApprove: true,
          canAnalyze: true,
        },
      ],
    },
  ]
}

function createDeferredBoolean() {
  let resolve!: (value: boolean) => void
  const promise = new Promise<boolean>((promiseResolve) => {
    resolve = promiseResolve
  })

  return { promise, resolve }
}

describe("PermissionMatrixPage", () => {
  beforeEach(() => {
    mockAdminApi.getRoles.mockReset()
    mockAdminApi.getPermissionsByRole.mockReset()
    mockAdminApi.updatePermissions.mockReset()
  })

  it("hiển thị summary vai trò đang chọn và dirty state khi quyền thay đổi", async () => {
    mockAdminApi.getRoles.mockResolvedValue({
      data: [
        { id: "role-1", name: "Quản trị" },
        { id: "role-2", name: "Người dùng" },
      ],
      totalRow: 2,
    })
    mockAdminApi.getPermissionsByRole.mockResolvedValue(createPermissionRows())

    renderPermissionMatrixPage()

    await screen.findByText("Dashboard")
    expect(screen.getByText("Vai trò: Quản trị")).toBeTruthy()
    expect(screen.getByText("Không có thay đổi")).toBeTruthy()

    fireEvent.click(screen.getAllByRole("checkbox")[0])

    await waitFor(() => {
      expect(screen.getByText("1 thay đổi chưa lưu")).toBeTruthy()
    })
  })

  it("chọn đúng vai trò từ tham số roleId trên URL", async () => {
    mockAdminApi.getRoles.mockResolvedValue({
      data: [
        { id: "role-1", name: "Quản trị" },
        { id: "role-2", name: "Kế toán" },
      ],
      totalRow: 2,
    })
    mockAdminApi.getPermissionsByRole.mockResolvedValue(createPermissionRows())

    renderPermissionMatrixPage("/system/identity/permissions?roleId=role-2")

    await screen.findByText("Dashboard")

    expect(mockAdminApi.getPermissionsByRole).toHaveBeenCalledWith("role-2")
    expect(screen.getByText("Vai trò: Kế toán")).toBeTruthy()
  })
  it("khóa nút lưu trong lúc tải và trong lúc đang lưu", async () => {
    const updatePermissionsDeferred = createDeferredBoolean()

    mockAdminApi.getRoles.mockResolvedValue({
      data: [{ id: "role-1", name: "Quản trị" }],
      totalRow: 1,
    })
    mockAdminApi.getPermissionsByRole.mockResolvedValue(createPermissionRows())
    mockAdminApi.updatePermissions.mockReturnValue(updatePermissionsDeferred.promise)

    const user = userEvent.setup()
    renderPermissionMatrixPage()

    const saveButton = screen.getByRole("button", { name: /lưu phân quyền/i })
    expect((saveButton as HTMLButtonElement).disabled).toBe(true)

    await screen.findByText("Dashboard")

    fireEvent.click(screen.getAllByRole("checkbox")[0])
    await user.click(saveButton)

    expect((saveButton as HTMLButtonElement).disabled).toBe(true)

    updatePermissionsDeferred.resolve(true)
    await waitFor(() => {
      expect(mockAdminApi.updatePermissions).toHaveBeenCalledTimes(1)
    })
  })

  it("reloads permissions when reset keeps the first role selected", async () => {
    mockAdminApi.getRoles.mockResolvedValue({
      data: [
        { id: "role-1", name: "Quản trị" },
        { id: "role-2", name: "Người dùng" },
      ],
      totalRow: 2,
    })

    mockAdminApi.getPermissionsByRole
      .mockResolvedValueOnce(createPermissionRows())
      .mockResolvedValueOnce(createPermissionRows())

    renderPermissionMatrixPage()

    await screen.findByText("Dashboard")
    expect(mockAdminApi.getPermissionsByRole).toHaveBeenCalledTimes(1)

    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: /đặt lại bộ lọc/i }))

    await waitFor(() => {
      expect(mockAdminApi.getPermissionsByRole).toHaveBeenCalledTimes(2)
    })

    await screen.findByText("Dashboard")
  })
})
