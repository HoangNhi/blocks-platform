// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.setConfig({ testTimeout: 10000 })

const { mockAdminApi } = vi.hoisted(() => ({
  mockAdminApi: {
    getSystemGroups: vi.fn(),
    getSystemGroupParentOptions: vi.fn(),
    getSystemGroupById: vi.fn(),
    createSystemGroup: vi.fn(),
    updateSystemGroup: vi.fn(),
    deleteSystemGroups: vi.fn(),
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

import { SystemGroupsPage } from "./system-groups-page"

describe("SystemGroupsPage", () => {
  beforeEach(() => {
    mockAdminApi.getSystemGroups.mockReset()
    mockAdminApi.getSystemGroupParentOptions.mockReset()
    mockAdminApi.getSystemGroupById.mockReset()
    mockAdminApi.createSystemGroup.mockReset()
    mockAdminApi.updateSystemGroup.mockReset()
    mockAdminApi.deleteSystemGroups.mockReset()
  })

  it("mở dialog tạo mới, chọn nhóm cha và lưu để thêm tiếp", async () => {
    mockAdminApi.getSystemGroupParentOptions.mockResolvedValue([
      { label: "System", value: "group-root" },
    ])
    mockAdminApi.getSystemGroups
      .mockResolvedValueOnce({
        data: [
          {
            id: "group-root",
            name: "System",
            parentId: null,
            parent: null,
            sort: 10,
            isActived: true,
          },
        ],
        totalRow: 1,
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: "group-root",
            name: "System",
            parentId: null,
            parent: null,
            sort: 10,
            isActived: true,
          },
          {
            id: "group-identity",
            name: "Identity",
            parentId: "group-root",
            parent: "System",
            sort: 20,
            isActived: true,
          },
        ],
        totalRow: 2,
      })

    mockAdminApi.createSystemGroup.mockResolvedValue({
      id: "group-identity",
      name: "Identity",
      parentId: "group-root",
      parent: "System",
      sort: 20,
      isActived: true,
      folderUpload: "folder-group-identity",
    })

    const user = userEvent.setup()
    render(<SystemGroupsPage />)

    await screen.findByText("System")

    await user.click(screen.getByRole("button", { name: /^Thêm$/i }))
    await user.type(screen.getByRole("textbox", { name: /tên nhóm/i }), "Identity")

    const parentTrigger = screen.getByRole("combobox", { name: /nhóm cha/i })
    parentTrigger.focus()
    fireEvent.keyDown(parentTrigger, { key: "ArrowDown" })
    await user.click(await screen.findByRole("option", { name: "System" }))

    await user.click(screen.getByRole("button", { name: /^Lưu và thêm tiếp$/i }))

    await waitFor(() => {
      expect(mockAdminApi.createSystemGroup).toHaveBeenCalledTimes(1)
      expect(mockAdminApi.getSystemGroups).toHaveBeenCalledTimes(2)
    })

    expect(mockAdminApi.createSystemGroup).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Identity",
        parentId: "group-root",
      }),
    )
    expect(screen.getByRole("dialog")).toBeTruthy()
    const dialogButtons = within(screen.getByRole("dialog")).getAllByRole("button")
    expect((dialogButtons.at(-1) as HTMLButtonElement | undefined)?.disabled).toBe(false)
    expect((dialogButtons.at(-2) as HTMLButtonElement | undefined)?.disabled).toBe(false)
    expect((screen.getByRole("textbox", { name: /tên nhóm/i }) as HTMLInputElement).value).toBe("")
  })

  it("mở dialog chỉnh sửa và lưu để đóng dialog", async () => {
    mockAdminApi.getSystemGroupParentOptions.mockResolvedValue([
      { label: "System", value: "group-root" },
    ])
    mockAdminApi.getSystemGroups
      .mockResolvedValueOnce({
        data: [
          {
            id: "group-root",
            name: "System",
            parentId: null,
            parent: null,
            sort: 10,
            isActived: true,
          },
          {
            id: "group-identity",
            name: "Identity",
            parentId: "group-root",
            parent: "System",
            sort: 20,
            isActived: true,
          },
        ],
        totalRow: 2,
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: "group-root",
            name: "System",
            parentId: null,
            parent: null,
            sort: 10,
            isActived: true,
          },
          {
            id: "group-identity",
            name: "Identity updated",
            parentId: "group-root",
            parent: "System",
            sort: 20,
            isActived: true,
          },
        ],
        totalRow: 2,
      })

    mockAdminApi.getSystemGroupById.mockResolvedValue({
      id: "group-identity",
      name: "Identity",
      parentId: "group-root",
      parent: "System",
      sort: 20,
      isActived: true,
      folderUpload: "folder-group-identity",
    })

    mockAdminApi.updateSystemGroup.mockResolvedValue({
      id: "group-identity",
      name: "Identity updated",
      parentId: "group-root",
      parent: "System",
      sort: 20,
      isActived: true,
      folderUpload: "folder-group-identity",
    })

    const user = userEvent.setup()
    render(<SystemGroupsPage />)

    await screen.findByText("Identity")

    await user.click(screen.getAllByRole("button", { name: /mở thao tác hàng/i })[1])
    await user.click(await screen.findByRole("menuitem", { name: /sửa/i }))

    await user.clear(screen.getByRole("textbox", { name: /tên nhóm/i }))
    await user.type(screen.getByRole("textbox", { name: /tên nhóm/i }), "Identity updated")

    await user.click(screen.getByRole("button", { name: /^Lưu$/i }))

    await waitFor(() => {
      expect(mockAdminApi.updateSystemGroup).toHaveBeenCalledTimes(1)
      expect(mockAdminApi.getSystemGroups).toHaveBeenCalledTimes(2)
    })

    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("xóa các dòng đã chọn bằng confirm flow", async () => {
    mockAdminApi.getSystemGroupParentOptions.mockResolvedValue([])
    mockAdminApi.getSystemGroups
      .mockResolvedValueOnce({
        data: [
          {
            id: "group-root",
            name: "System",
            parentId: null,
            parent: null,
            sort: 10,
            isActived: true,
          },
        ],
        totalRow: 1,
      })
      .mockResolvedValueOnce({
        data: [],
        totalRow: 0,
      })

    mockAdminApi.deleteSystemGroups.mockResolvedValue("group-root")

    const user = userEvent.setup()
    render(<SystemGroupsPage />)

    await screen.findByText("System")

    const checkboxes = screen.getAllByRole("checkbox")
    fireEvent.click(checkboxes[1])

    await user.click(screen.getByRole("button", { name: /xóa/i }))
    await user.click(screen.getByRole("button", { name: /xác nhận xóa/i }))

    await waitFor(() => {
      expect(mockAdminApi.deleteSystemGroups).toHaveBeenCalledWith(["group-root"])
    })

    await screen.findByText(/không có nhóm hệ thống/i)
  })
})
