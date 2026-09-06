// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { RolePermissionMatrix } from "./role-permission-matrix"

const groups = [{
  systemGroup: "Identity",
  roles: [
    {
      id: "permission-1", roleId: "role-1", menuId: "menu-1", name: "Registration", permissionKey: "registration",
      isViewed: false, isAdded: false, isUpdated: false, isDeleted: false, isApproved: false, isAnalyzed: false,
      canView: true, canAdd: false, canUpdate: false, canDelete: false, canApprove: false, canAnalyze: false,
    },
    {
      id: "permission-2", roleId: "role-1", menuId: "menu-2", name: "Files", permissionKey: "files",
      isViewed: false, isAdded: false, isUpdated: false, isDeleted: false, isApproved: false, isAnalyzed: false,
      canView: true, canAdd: true, canUpdate: true, canDelete: true, canApprove: false, canAnalyze: false,
    },
  ],
}]

const groupsWithMultipleSections = [
  ...groups,
  {
    systemGroup: "Automation",
    roles: [
      {
        id: "permission-3", roleId: "role-1", menuId: "menu-3", name: "Pipelines", permissionKey: "pipelines",
        isViewed: false, isAdded: false, isUpdated: false, isDeleted: false, isApproved: false, isAnalyzed: false,
        canView: true, canAdd: true, canUpdate: false, canDelete: false, canApprove: false, canAnalyze: false,
      },
    ],
  },
]

describe("RolePermissionMatrix", () => {
  it("uses vertical group tabs and renders one active group table", async () => {
    const user = userEvent.setup()
    render(<RolePermissionMatrix permissionGroups={groupsWithMultipleSections} changedCellCount={0} />)

    expect(screen.getByRole("tablist").getAttribute("aria-orientation")).toBe("vertical")
    expect(screen.getByRole("tab", { name: /Identity 2/i })).toBeTruthy()
    expect(screen.getByRole("tab", { name: /Automation 1/i })).toBeTruthy()
    const activeGroupTab = screen.getByRole("tab", { name: /Identity 2/i })
    expect(activeGroupTab.className).toContain("data-[state=active]:bg-accent")
    expect(activeGroupTab.className).toContain("data-[state=active]:border-l-primary")
    expect(within(activeGroupTab).getByText("2", { exact: true }).getAttribute("data-variant")).toBe("default")
    expect(within(screen.getByRole("tab", { name: /Automation 1/i })).getByText("1", { exact: true }).getAttribute("data-variant")).toBe("secondary")
    expect(screen.getByText("Registration")).toBeTruthy()
    expect(screen.queryByText("Pipelines")).toBeNull()
    expect(screen.getAllByRole("table")).toHaveLength(1)

    await user.click(screen.getByRole("tab", { name: /Automation 1/i }))

    expect(screen.getByText("Pipelines")).toBeTruthy()
    expect(screen.queryByText("Registration")).toBeNull()
    expect(screen.getAllByRole("table")).toHaveLength(1)
  })

  it("activates first matching group when search changes sections", async () => {
    const user = userEvent.setup()
    render(<RolePermissionMatrix permissionGroups={groupsWithMultipleSections} changedCellCount={0} />)

    await user.type(screen.getByRole("textbox", { name: "Tìm kiếm quyền" }), "pipeline")

    expect(screen.getByRole("tab", { name: /Automation 1/i }).getAttribute("data-state")).toBe("active")
    expect(screen.getByText("Pipelines")).toBeTruthy()
    expect(screen.queryByText("Registration")).toBeNull()
  })

  it("keeps groups visible and renders unsupported actions quietly", () => {
    render(<RolePermissionMatrix permissionGroups={groups} changedCellCount={0} />)

    expect(screen.getByText("Identity")).toBeTruthy()
    expect(screen.getByText("Files")).toBeTruthy()
    const tableScrollViewport = screen.getByRole("table").parentElement?.parentElement
    expect(tableScrollViewport?.className).toContain("min-h-0")
    expect(tableScrollViewport?.className).toContain("overflow-auto")
    expect(screen.getByRole("tablist").className).toContain("overflow-y-auto")
    const checkbox = screen.getByRole("checkbox", { name: /xem registration/i })
    expect(checkbox.parentElement?.className).toContain("items-center")
    expect(checkbox.parentElement?.className).toContain("justify-center")
    expect(checkbox.closest("td")?.className).toContain("[&:has([role=checkbox])]:pr-2")
    expect(screen.getByRole("img", { name: /duyệt files không được hỗ trợ/i })).toBeTruthy()
    expect(screen.queryByRole("checkbox", { name: /duyệt files/i })).toBeNull()
  })

  it("keeps every permission when group name matches search", async () => {
    const user = userEvent.setup()
    render(<RolePermissionMatrix permissionGroups={groups} changedCellCount={0} />)

    await user.type(screen.getByRole("textbox", { name: "Tìm kiếm quyền" }), "identity")

    expect(screen.getByText("Registration")).toBeTruthy()
    expect(screen.getByText("Files")).toBeTruthy()
  })

  it("reports edits and supports undo", async () => {
    const user = userEvent.setup()
    const onPermissionChange = vi.fn()
    const onUndo = vi.fn()
    render(<RolePermissionMatrix permissionGroups={groups} changedCellCount={2} onPermissionChange={onPermissionChange} onUndo={onUndo} />)

    await user.click(screen.getByRole("checkbox", { name: /xem registration/i }))
    await user.click(screen.getByRole("button", { name: "Hoàn tác" }))

    expect(onPermissionChange).toHaveBeenCalledWith("menu-1", "isViewed", true)
    expect(onUndo).toHaveBeenCalledTimes(1)
    expect(screen.getByText("2 thay đổi chưa lưu")).toBeTruthy()
  })

  it("shows retry for permission load errors", () => {
    render(<RolePermissionMatrix permissionGroups={[]} changedCellCount={0} error="Denied" onRetry={vi.fn()} />)

    expect(screen.getByText("Denied")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Thử lại" })).toBeTruthy()
  })

  it("does not claim synchronized state before permissions load", () => {
    render(<RolePermissionMatrix permissionGroups={[]} changedCellCount={0} status="loading" isLoading />)

    expect(screen.getByText("Đang tải")).toBeTruthy()
    expect(screen.queryByText("Đã đồng bộ")).toBeNull()
  })
})
