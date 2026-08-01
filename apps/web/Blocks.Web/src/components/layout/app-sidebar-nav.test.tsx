// @vitest-environment jsdom
import type { ComponentProps } from "react"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { describe, expect, it, vi } from "vitest"

import { AppSidebarNav } from "./app-sidebar-nav"
import type {
  AuthUser,
  EditProfileRequest,
} from "@/features/auth/types"
import type { NavNode } from "@/features/navigation/types"

const user: AuthUser = {
  id: "admin",
  username: "admin",
  fullname: "Quản trị",
  roleId: "admin-role",
  roleName: "Quản trị",
  email: "admin@example.test",
  avatar: null,
}

const navigation: NavNode[] = [
  {
    id: "system",
    title: "HỆ THỐNG",
    kind: "group",
    owner: "system",
    ownerKey: "system-service",
    sort: 10,
    isVisible: true,
    status: "active",
    children: [
      {
        id: "identity",
        title: "Quản trị định danh",
        kind: "subgroup",
        parentId: "system",
        owner: "system",
        ownerKey: "system-service",
        sort: 10,
        isVisible: true,
        status: "active",
        children: [
          {
            id: "users",
            title: "Users",
            kind: "menu",
            parentId: "identity",
            route: "/system/identity/users",
            owner: "system",
            ownerKey: "system-service",
            sort: 10,
            capability: "view",
            isVisible: true,
            status: "active",
          },
        ],
      },
    ],
  },
  {
    id: "plugins",
    title: "Plugins",
    kind: "group",
    owner: "plugin",
    ownerKey: "plugin-runtime",
    sort: 20,
    isVisible: true,
    status: "active",
    children: [
      {
        id: "tradelab",
        title: "TradeLab",
        kind: "subgroup",
        parentId: "plugins",
        owner: "plugin",
        ownerKey: "tradelab",
        sort: 10,
        isVisible: true,
        status: "active",
        children: [
          {
            id: "strategy-lab",
            title: "Strategy Lab",
            kind: "menu",
            parentId: "tradelab",
            route: "/plugins/tradelab",
            accessRoutes: ["/plugins/tradelab/datasets"],
            owner: "plugin",
            ownerKey: "tradelab",
            sort: 10,
            isVisible: true,
            status: "active",
          },
            {
              id: "datasets",
              title: "Datasets",
              kind: "menu",
              parentId: "tradelab",
              route: "/plugins/tradelab/datasets",
              owner: "plugin",
              ownerKey: "tradelab",
              sort: 20,
              isVisible: true,
              status: "active",
            },
        ],
      },
    ],
  },
]

const defaultEditProfile = vi.fn(async (request: EditProfileRequest) => ({
  ...user,
  fullname: request.fullName,
  email: request.email,
}))
const defaultChangePassword = vi.fn(async () => undefined)

function renderNav(props: Partial<ComponentProps<typeof AppSidebarNav>> = {}) {
  return render(
    <MemoryRouter initialEntries={[props.activeRoute ?? "/"]}>
      <AppSidebarNav
        navigation={navigation}
        currentUser={user}
        openSubgroupIds={["identity"]}
        activeRoute="/"
        onToggleSubgroup={vi.fn()}
        onLogout={vi.fn()}
        onEditProfile={defaultEditProfile}
        onChangePassword={defaultChangePassword}
        {...props}
      />
    </MemoryRouter>,
  )
}

describe("AppSidebarNav", () => {
  it("renders nested system route links", () => {
    renderNav()
    expect(screen.getByRole("link", { name: "Users" }).getAttribute("href")).toBe(
      "/system/identity/users",
    )
  })

  it("không hiển thị nhãn nhóm gốc mặc định nhưng vẫn giữ các nhánh điều hướng", () => {
    renderNav()

    expect(screen.queryByText("HỆ THỐNG")).toBeNull()
    expect(screen.queryByText("Plugins")).toBeNull()
    expect(screen.getByRole("button", { name: /Quản trị định danh/i })).toBeTruthy()
    expect(screen.getByRole("button", { name: /TradeLab/i })).toBeTruthy()
  })
  it("renders active leaf without overlay pseudo classes that can cover text", () => {
    renderNav({ activeRoute: "/system/identity/users" })

    const usersLink = screen.getByRole("link", { name: "Users" })

    expect(usersLink.getAttribute("aria-current")).toBe("page")
    expect(usersLink.className).not.toContain("before:")
  })

  it("renders plugin parents as collapsible branches and reveals route leaves", async () => {
    const actor = userEvent.setup()
    const onToggleSubgroup = vi.fn()

    renderNav({ onToggleSubgroup, openSubgroupIds: [] })

    await actor.click(screen.getByRole("button", { name: /TradeLab/i }))

    expect(onToggleSubgroup).toHaveBeenCalledWith("tradelab")

    renderNav({ openSubgroupIds: ["tradelab"] })
    expect(screen.getByRole("link", { name: /Strategy Lab/i }).getAttribute("href")).toBe(
      "/plugins/tradelab",
    )
  })


  it("keeps only the exact route leaf active when another leaf lists it as an access route", () => {
    renderNav({
      activeRoute: "/plugins/tradelab/datasets",
      openSubgroupIds: ["tradelab"],
    })

    expect(screen.getByRole("link", { name: "Datasets" }).getAttribute("aria-current")).toBe(
      "page",
    )
    expect(screen.getByRole("link", { name: "Strategy Lab" }).getAttribute("aria-current")).toBe(
      null,
    )
  })

  it("opens account dropdown with profile, password and logout actions", async () => {
    const actor = userEvent.setup()

    renderNav()
    await actor.click(screen.getByRole("button", { name: /Mở menu tài khoản/i }))
    const menu = await screen.findByRole("menu")

    expect(within(menu).getByRole("menuitem", { name: /Hồ sơ cá nhân/i })).toBeTruthy()
    expect(within(menu).getByRole("menuitem", { name: /Đổi mật khẩu/i })).toBeTruthy()
    expect(within(menu).getByRole("menuitem", { name: /Đăng xuất/i })).toBeTruthy()
  })

  it("opens profile dialog from the account menu", async () => {
    const actor = userEvent.setup()

    renderNav()
    await actor.click(screen.getByRole("button", { name: /Mở menu tài khoản/i }))
    await actor.click(await screen.findByRole("menuitem", { name: /Hồ sơ cá nhân/i }))

    expect(await screen.findByRole("dialog", { name: /Hồ sơ cá nhân/i })).toBeTruthy()
    expect(screen.getByRole("textbox", { name: /Họ và tên/i })).toBeTruthy()
    expect(screen.getByRole("textbox", { name: /Email/i })).toBeTruthy()
  })

  it("validates the change password dialog before calling the API", async () => {
    const onChangePassword = vi.fn(async () => undefined)
    const actor = userEvent.setup()

    renderNav({ onChangePassword })
    await actor.click(screen.getByRole("button", { name: /Mở menu tài khoản/i }))
    await actor.click(await screen.findByRole("menuitem", { name: /Đổi mật khẩu/i }))
    await actor.click(await screen.findByRole("button", { name: /^Lưu$/i }))

    expect(await screen.findByText(/Mật khẩu cũ không được để trống/i)).toBeTruthy()
    expect(onChangePassword).not.toHaveBeenCalled()
  })

  it("keeps plugin routes reachable in collapsed icon-rail mode", async () => {
    const actor = userEvent.setup()

    renderNav({
      layoutMode: "collapsed",
      openSubgroupIds: [],
    })

    await actor.click(screen.getByRole("button", { name: "TradeLab" }))

    expect(await screen.findByRole("menuitem", { name: "Strategy Lab" })).toBeTruthy()
    expect(screen.getByRole("menuitem", { name: "Datasets" })).toBeTruthy()
  })

  it("keeps direct route leaves accessible in collapsed icon-rail mode", async () => {
    const actor = userEvent.setup()

    renderNav({
      layoutMode: "collapsed",
      activeRoute: "/system/identity/users",
    })

    await actor.click(screen.getByRole("button", { name: "Quản trị định danh" }))

    expect(screen.getByRole("link", { name: "Users" })).toBeTruthy()
  })
})
