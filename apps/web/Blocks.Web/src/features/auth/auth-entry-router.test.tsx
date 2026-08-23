// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { AuthProvider } from "./auth-context"

const { mockAuthApi } = vi.hoisted(() => ({
  mockAuthApi: {
    getRegistrationAvailability: vi.fn(),
    register: vi.fn(),
    login: vi.fn(),
    getCurrentUser: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
    editProfile: vi.fn(),
    changePassword: vi.fn(),
  },
}))

vi.mock("./auth-api", () => ({
  createAuthApi: () => mockAuthApi,
}))
vi.mock("@/features/auth/token-store", () => ({
  createBrowserTokenStore: () => ({
    getAccessToken: () => null,
    getSession: () => null,
    saveSession: () => undefined,
    clearSession: () => undefined,
    getRefreshToken: () => null,
  }),
}))
vi.mock("@/lib/api/client", () => ({
  createApiClient: () => ({ request: vi.fn() }),
}))

import { AuthEntryRouter } from "./auth-entry-router"

function renderRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <AuthEntryRouter />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe("AuthEntryRouter", () => {
  beforeEach(() => {
    mockAuthApi.getRegistrationAvailability.mockReset()
    mockAuthApi.register.mockReset()
  })

  it("shows unavailable registration without privileged controls", async () => {
    mockAuthApi.getRegistrationAvailability.mockResolvedValue({ isAvailable: false })

    renderRoute("/register")

    expect((await screen.findByRole("alert")).textContent).toContain("Đăng ký hiện không khả dụng")
    expect(screen.getByRole("link", { name: /đăng nhập/i }).getAttribute("href")).toBe("/login")
    expect(screen.queryByLabelText(/vai trò|chế độ đăng ký/i)).toBeNull()
  })

  it("registers through one public form and returns to login", async () => {
    mockAuthApi.getRegistrationAvailability.mockResolvedValue({ isAvailable: true })
    mockAuthApi.register.mockResolvedValue({
      id: "user-1",
      username: "member",
      email: "member@example.test",
      fullname: "Thành viên",
      workspaceId: "workspace-1",
    })

    const user = userEvent.setup()
    renderRoute("/register?invitationToken=invite-1")

    await user.type(await screen.findByRole("textbox", { name: /tên đăng nhập/i }), "member")
    await user.type(screen.getByRole("textbox", { name: /email/i }), "member@example.test")
    await user.type(screen.getByRole("textbox", { name: /họ và tên/i }), "Thành viên")
    await user.type(screen.getByLabelText(/mật khẩu/i), "a-secure-password")
    await user.click(screen.getByRole("button", { name: /tạo tài khoản/i }))

    await waitFor(() => expect(mockAuthApi.register).toHaveBeenCalledWith({
      username: "member",
      email: "member@example.test",
      fullname: "Thành viên",
      password: "a-secure-password",
      invitationToken: "invite-1",
    }))
    expect(await screen.findByRole("heading", { name: /chào mừng trở lại/i })).toBeTruthy()
    expect((screen.getByRole("textbox", { name: /tên đăng nhập/i }) as HTMLInputElement).value).toBe("member")
    expect(screen.getByRole("status").textContent).toContain("Tài khoản đã được tạo")
  })
})
