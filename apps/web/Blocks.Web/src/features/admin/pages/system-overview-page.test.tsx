// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockAdminApi } = vi.hoisted(() => ({
  mockAdminApi: {
    getRegistrationSettings: vi.fn(),
    updateRegistrationSettings: vi.fn(),
    getRoles: vi.fn(),
    createInvitation: vi.fn(),
  },
}))

vi.mock("@/features/auth/token-store", () => ({
  createBrowserTokenStore: () => ({ getAccessToken: () => null }),
}))
vi.mock("@/lib/api/client", () => ({
  createApiClient: () => ({ request: vi.fn() }),
}))
vi.mock("../system-admin-api", () => ({
  createSystemAdminApi: () => mockAdminApi,
}))

import { SystemOverviewPage } from "./system-overview-page"
import { InvitationsPanel } from "../components/invitations-panel"

describe("minimal administration surfaces", () => {
  beforeEach(() => {
    mockAdminApi.getRegistrationSettings.mockReset()
    mockAdminApi.updateRegistrationSettings.mockReset()
    mockAdminApi.getRoles.mockReset()
    mockAdminApi.createInvitation.mockReset()
    mockAdminApi.getRoles.mockResolvedValue({ data: [{ id: "role-member", name: "User", key: "member", isRegistrationEligible: true }], totalRow: 1 })
  })

  it("saves Registration Settings inside System Overview", async () => {
    mockAdminApi.getRegistrationSettings.mockResolvedValue({
      registrationMode: "admin_provisioned",
      defaultRegistrationRoleId: "role-member",
    })
    mockAdminApi.updateRegistrationSettings.mockResolvedValue({
      registrationMode: "open",
      defaultRegistrationRoleId: "role-member",
    })

    const user = userEvent.setup()
    render(<SystemOverviewPage />)

    const registrationMode = await screen.findByRole("combobox", { name: /chế độ đăng ký/i })
    registrationMode.focus()
    fireEvent.keyDown(registrationMode, { key: "ArrowDown" })
    await user.click(await screen.findByRole("option", { name: /mở đăng ký/i }))
    await user.click(screen.getByRole("button", { name: /lưu cài đặt đăng ký/i }))

    await waitFor(() => expect(mockAdminApi.updateRegistrationSettings).toHaveBeenCalledWith({
      registrationMode: "open",
      defaultRegistrationRoleId: "role-member",
    }))
  })

  it("creates invitation inside Users and reveals token once", async () => {
    mockAdminApi.getRegistrationSettings.mockResolvedValue({
      registrationMode: "open",
      defaultRegistrationRoleId: "role-member",
    })
    mockAdminApi.createInvitation.mockResolvedValue({
      id: "invite-1",
      expiresAt: "2026-09-01T00:00:00Z",
      token: "plain-token-once",
    })

    render(<InvitationsPanel adminApi={mockAdminApi} />)
    const user = userEvent.setup()
    fireEvent.change(screen.getByLabelText(/hết hạn lúc/i), { target: { value: "2026-09-01T12:00" } })
    await user.click(screen.getByRole("button", { name: /tạo lời mời/i }))

    expect(await screen.findByText("plain-token-once")).toBeTruthy()
  })
})
