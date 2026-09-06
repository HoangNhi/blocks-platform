// @vitest-environment jsdom

import { fireEvent, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"

import { RoleFormDialog, type RoleFormValues } from "./role-form-dialog"

const value = {
  id: "role-1",
  name: "Member",
  key: "member",
  isRegistrationEligible: false,
  folderUpload: "folder-role-1",
  isActived: true,
  isEdit: true,
  sort: 0,
}

const baseProps = {
  open: true,
  mode: "edit" as const,
  value,
  roleMetadata: {
    id: "role-1",
    name: "Member",
    key: "member",
    isSystem: true,
    isProtected: true,
    canDeactivate: false,
    deactivationBlockedReason: "Vai trò hệ thống hoặc bảo vệ không thể vô hiệu hóa",
  },
  errors: {},
  isSubmitting: false,
  submitIntent: "save" as const,
  permissionGroups: [],
  changedCellCount: 0,
  permissionStatus: "ready" as const,
  onOpenChange: vi.fn(),
  onChange: vi.fn(),
  onSave: vi.fn(),
  onSaveAndAddMore: vi.fn(),
}

describe("RoleFormDialog", () => {
  it("uses same edit dialog for both tabs and reports tab changes", async () => {
    const user = userEvent.setup()
    const onTabChange = vi.fn()

    render(<RoleFormDialog {...baseProps} onTabChange={onTabChange} />)

    const dialog = screen.getByRole("dialog")
    expect(dialog.className).toContain("sm:max-w-[min(96vw,1400px)]")
    const tabList = within(dialog).getByRole("tablist")
    expect(tabList.getAttribute("data-variant")).toBe("line")
    expect(tabList.className).toContain("w-full")
    expect(tabList.className).toContain("justify-start")
    expect(within(dialog).getByRole("tab", { name: /thông tin/i })).toBeTruthy()
    expect(within(dialog).getByRole("tab", { name: /phân quyền/i })).toBeTruthy()
    expect((within(dialog).getByRole("textbox", { name: /mã vai trò ổn định/i }) as HTMLInputElement).disabled).toBe(true)

    await user.click(within(dialog).getByRole("tab", { name: /phân quyền/i }))
    const permissionsPanel = within(dialog).getByRole("tabpanel")
    expect(permissionsPanel.className).toContain("flex")
    expect(permissionsPanel.className).toContain("flex-col")
    expect(onTabChange).toHaveBeenCalledWith("permissions")
  })

  it("stays open when clicking outside", async () => {
    const onOpenChange = vi.fn()

    render(<RoleFormDialog {...baseProps} onOpenChange={onOpenChange} />)

    await new Promise((resolve) => setTimeout(resolve, 0))
    const overlay = document.querySelector('[data-slot="dialog-overlay"]')
    expect(overlay).toBeTruthy()
    fireEvent.pointerDown(overlay as Element)

    expect(onOpenChange).not.toHaveBeenCalled()
    expect(screen.getByRole("dialog")).toBeTruthy()
  })

  it("allows custom role keys to be edited", async () => {
    const user = userEvent.setup()

    function ControlledDialog() {
      const [currentValue, setCurrentValue] = useState<RoleFormValues>(value)

      return (
        <RoleFormDialog
          {...baseProps}
          value={currentValue}
          roleMetadata={{ ...baseProps.roleMetadata, isSystem: false, isProtected: false }}
          onChange={setCurrentValue}
        />
      )
    }

    render(<ControlledDialog />)

    const keyInput = screen.getByRole("textbox", { name: /mã vai trò ổn định/i }) as HTMLInputElement
    expect(keyInput.disabled).toBe(false)

    await user.clear(keyInput)
    await user.type(keyInput, "editor")

    expect(keyInput.value).toBe("editor")
  })

  it("shows metadata only for create mode", () => {
    render(
      <RoleFormDialog
        {...baseProps}
        mode="create"
        value={{ ...value, id: "role-new", name: "", key: "", isEdit: false }}
      />,
    )

    const dialog = screen.getByRole("dialog")
    expect(within(dialog).queryByRole("tab", { name: /phân quyền/i })).toBeNull()
    expect(within(dialog).getByRole("textbox", { name: /tên vai trò/i })).toBeTruthy()
  })
})
