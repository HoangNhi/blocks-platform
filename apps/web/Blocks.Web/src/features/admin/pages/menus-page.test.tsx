// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.setConfig({ testTimeout: 10000 })

const { mockAdminApi } = vi.hoisted(() => ({
  mockAdminApi: {
    getMenus: vi.fn(),
    getSystemGroupOptions: vi.fn(),
    getMenuById: vi.fn(),
    createMenu: vi.fn(),
    updateMenu: vi.fn(),
    deleteMenus: vi.fn(),
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

import { MenusPage } from "./menus-page"

describe("MenusPage", () => {
  beforeEach(() => {
    mockAdminApi.getMenus.mockReset()
    mockAdminApi.getSystemGroupOptions.mockReset()
    mockAdminApi.getMenuById.mockReset()
    mockAdminApi.createMenu.mockReset()
    mockAdminApi.updateMenu.mockReset()
    mockAdminApi.deleteMenus.mockReset()
  })

  it("mở dialog tạo mới, tải nhóm hệ thống, lưu và thêm tiếp", async () => {
    mockAdminApi.getSystemGroupOptions.mockResolvedValue([
      { label: "Identity", value: "group-1" },
    ])
    mockAdminApi.getMenus
      .mockResolvedValueOnce({
        data: [
          {
            id: "menu-1",
            controller: "User",
            name: "Users",
            systemGroupId: "group-1",
            systemGroup: "Identity",
            sort: 10,
            canView: true,
            canAdd: false,
            canUpdate: false,
            canDelete: false,
            canApprove: false,
            canAnalyze: false,
            isShowMenu: true,
          },
        ],
        totalRow: 1,
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: "menu-1",
            controller: "User",
            name: "Users",
            systemGroupId: "group-1",
            systemGroup: "Identity",
            sort: 10,
            canView: true,
            canAdd: false,
            canUpdate: false,
            canDelete: false,
            canApprove: false,
            canAnalyze: false,
            isShowMenu: true,
          },
          {
            id: "menu-2",
            controller: "Role",
            name: "Roles",
            systemGroupId: "group-1",
            systemGroup: "Identity",
            sort: 20,
            canView: true,
            canAdd: true,
            canUpdate: false,
            canDelete: false,
            canApprove: false,
            canAnalyze: false,
            isShowMenu: true,
          },
        ],
        totalRow: 2,
      })

    mockAdminApi.createMenu.mockResolvedValue({
      id: "menu-2",
      controller: "Role",
      name: "Roles",
      systemGroupId: "group-1",
      sort: 20,
      canView: true,
      canAdd: true,
      canUpdate: false,
      canDelete: false,
      canApprove: false,
      canAnalyze: false,
      isShowMenu: true,
      folderUpload: "folder-menu-2",
      isActived: true,
    })

    const user = userEvent.setup()
    render(<MenusPage />)

    await screen.findByText("Users")

    await user.click(screen.getByRole("button", { name: /^Thêm$/i }))
    await user.type(screen.getByRole("textbox", { name: /tên menu/i }), "Roles")
    await user.type(screen.getByRole("textbox", { name: /controller/i }), "Role")

    const systemGroupTrigger = screen.getByRole("combobox", { name: /nhóm hệ thống/i })
    systemGroupTrigger.focus()
    fireEvent.keyDown(systemGroupTrigger, { key: "ArrowDown" })
    await user.click(await screen.findByRole("option", { name: "Identity" }))

    await user.click(screen.getByRole("checkbox", { name: /có thể thêm/i }))

    await user.click(screen.getByRole("button", { name: /^Lưu và thêm tiếp$/i }))

    await waitFor(() => {
      expect(mockAdminApi.createMenu).toHaveBeenCalledTimes(1)
      expect(mockAdminApi.getMenus).toHaveBeenCalledTimes(2)
    })

    expect(mockAdminApi.createMenu).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Roles",
        controller: "Role",
        systemGroupId: "group-1",
        canAdd: true,
      }),
    )
    expect(screen.getByRole("dialog")).toBeTruthy()
    const dialogButtons = within(screen.getByRole("dialog")).getAllByRole("button")
    expect((dialogButtons.at(-1) as HTMLButtonElement | undefined)?.disabled).toBe(false)
    expect((dialogButtons.at(-2) as HTMLButtonElement | undefined)?.disabled).toBe(false)
    expect((screen.getByRole("textbox", { name: /tên menu/i }) as HTMLInputElement).value).toBe("")
  })

  it("mở dialog chỉnh sửa và lưu để đóng dialog", async () => {
    mockAdminApi.getSystemGroupOptions.mockResolvedValue([
      { label: "Identity", value: "group-1" },
    ])
    mockAdminApi.getMenus
      .mockResolvedValueOnce({
        data: [
          {
            id: "menu-1",
            controller: "User",
            name: "Users",
            systemGroupId: "group-1",
            systemGroup: "Identity",
            sort: 10,
            canView: true,
            canAdd: false,
            canUpdate: false,
            canDelete: false,
            canApprove: false,
            canAnalyze: false,
            isShowMenu: true,
          },
        ],
        totalRow: 1,
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: "menu-1",
            controller: "User",
            name: "Users updated",
            systemGroupId: "group-1",
            systemGroup: "Identity",
            sort: 10,
            canView: true,
            canAdd: false,
            canUpdate: false,
            canDelete: false,
            canApprove: false,
            canAnalyze: false,
            isShowMenu: true,
          },
        ],
        totalRow: 1,
      })

    mockAdminApi.getMenuById.mockResolvedValue({
      id: "menu-1",
      controller: "User",
      name: "Users",
      systemGroupId: "group-1",
      sort: 10,
      canView: true,
      canAdd: false,
      canUpdate: false,
      canDelete: false,
      canApprove: false,
      canAnalyze: false,
      isShowMenu: true,
      folderUpload: "folder-menu-1",
      isActived: true,
    })

    mockAdminApi.updateMenu.mockResolvedValue({
      id: "menu-1",
      controller: "User",
      name: "Users updated",
      systemGroupId: "group-1",
      sort: 10,
      canView: true,
      canAdd: false,
      canUpdate: false,
      canDelete: false,
      canApprove: false,
      canAnalyze: false,
      isShowMenu: true,
      folderUpload: "folder-menu-1",
      isActived: true,
    })

    const user = userEvent.setup()
    render(<MenusPage />)

    await screen.findByText("Users")

    await user.click(screen.getByRole("button", { name: /mở thao tác hàng/i }))
    await user.click(await screen.findByRole("menuitem", { name: /sửa/i }))

    await user.clear(screen.getByRole("textbox", { name: /tên menu/i }))
    await user.type(screen.getByRole("textbox", { name: /tên menu/i }), "Users updated")

    await user.click(screen.getByRole("button", { name: /^Lưu$/i }))

    await waitFor(() => {
      expect(mockAdminApi.updateMenu).toHaveBeenCalledTimes(1)
      expect(mockAdminApi.getMenus).toHaveBeenCalledTimes(2)
    })

    expect(screen.queryByRole("dialog")).toBeNull()
  })
})
