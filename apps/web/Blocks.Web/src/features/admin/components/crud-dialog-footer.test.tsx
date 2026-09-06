// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { CrudDialogFooter } from "./crud-dialog-footer"

describe("CrudDialogFooter", () => {
  it("disables clean save without disabling cancel", async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(
      <CrudDialogFooter
        mode="edit"
        isSaveDisabled
        onCancel={onCancel}
        onSaveAndAddMore={vi.fn()}
        submitIntent="save"
      />,
    )

    expect((screen.getByRole("button", { name: "Lưu" }) as HTMLButtonElement).disabled).toBe(true)
    await user.click(screen.getByRole("button", { name: "Hủy" }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it("freezes all actions while submitting", () => {
    render(
      <CrudDialogFooter
        mode="create"
        isSubmitting
        onCancel={vi.fn()}
        onSaveAndAddMore={vi.fn()}
        submitIntent="save"
      />,
    )

    expect((screen.getByRole("button", { name: "Hủy" }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole("button", { name: "Lưu và thêm tiếp" }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole("button", { name: "Đang lưu..." }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("keeps footer from shrinking into dialog content", () => {
    render(
      <CrudDialogFooter
        mode="edit"
        onCancel={vi.fn()}
        onSaveAndAddMore={vi.fn()}
        submitIntent="save"
      />,
    )

    const footer = screen.getByRole("button", { name: /h\u1EE7y/i }).parentElement
    expect(footer?.className).toContain("shrink-0")
  })
})
