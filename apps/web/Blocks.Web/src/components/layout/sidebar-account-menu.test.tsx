// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { SidebarAccountMenu } from "./sidebar-account-menu"

const currentUser = {
  id: "admin",
  username: "admin",
  fullname: "Admin User",
  roleId: "admin-role",
  roleName: "Administrator",
  email: "admin@example.test",
  avatar: null,
}

describe("SidebarAccountMenu compact mode", () => {
  it("renders an avatar-only trigger and still opens the dropdown", async () => {
    const actor = userEvent.setup()

    render(
      <SidebarAccountMenu
        compact
        currentUser={currentUser}
        onLogout={vi.fn()}
        onEditProfile={vi.fn()}
        onChangePassword={vi.fn()}
      />,
    )

    await actor.click(screen.getByRole("button", { name: "Mở menu tài khoản" }))

    const menu = await screen.findByRole("menu")
    expect(within(menu).getByRole("menuitem", { name: /Hồ sơ cá nhân/i })).toBeTruthy()
    expect(within(menu).getByRole("menuitem", { name: /Đổi mật khẩu/i })).toBeTruthy()
    expect(within(menu).getByRole("menuitem", { name: /Đăng xuất/i })).toBeTruthy()
  })
})
