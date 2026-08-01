// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockAdminApi } = vi.hoisted(() => ({
  mockAdminApi: {
    getAuditLogs: vi.fn(),
    getAuditLogById: vi.fn(),
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

import { AuditLogPage } from "./audit-log-page"

describe("AuditLogPage", () => {
  beforeEach(() => {
    mockAdminApi.getAuditLogs.mockReset()
    mockAdminApi.getAuditLogById.mockReset()
  })

  it("recovers from a failed load when filters change", async () => {
    mockAdminApi.getAuditLogs
      .mockRejectedValueOnce(new Error("Audit logs failed hard."))
      .mockResolvedValueOnce({
        data: [
          {
            id: "log-1",
            userId: "user-1",
            userName: "admin",
            action: "LOGIN",
            entityName: "Auth",
            entityId: null,
            oldValues: null,
            newValues: null,
            ipAddress: "127.0.0.1",
            serviceName: "System",
            isSuccess: true,
            errorMessage: null,
            createdAt: "2026-05-12T10:00:00.000Z",
          },
        ],
        totalRow: 1,
      })

    render(<AuditLogPage />)

    await screen.findByText("Audit logs failed hard.")

    fireEvent.change(screen.getByPlaceholderText(/tất cả hành động/i), {
      target: { value: "LOGIN" },
    })

    await waitFor(() => {
      expect(mockAdminApi.getAuditLogs).toHaveBeenCalledTimes(2)
    })

    await screen.findByText("admin")
    expect(screen.queryByText("Audit logs failed hard.")).toBeNull()
  })

  it("mở dialog chi tiết nhật ký từ row action và đóng lại", async () => {
    mockAdminApi.getAuditLogs.mockResolvedValue({
      data: [
        {
          id: "log-1",
          userId: "user-1",
          userName: "admin",
          action: "LOGIN",
          entityName: "Auth",
          entityId: null,
          oldValues: null,
          newValues: null,
          ipAddress: "127.0.0.1",
          serviceName: "System",
          isSuccess: true,
          errorMessage: null,
          createdAt: "2026-05-12T10:00:00.000Z",
        },
      ],
      totalRow: 1,
    })

    mockAdminApi.getAuditLogById.mockResolvedValue({
      id: "log-1",
      userId: "user-1",
      userName: "admin",
      action: "LOGIN",
      entityName: "Auth",
      entityId: null,
      oldValues: "{\"before\":true}",
      newValues: "{\"after\":true}",
      ipAddress: "127.0.0.1",
      serviceName: "System",
      isSuccess: true,
      errorMessage: null,
      createdAt: "2026-05-12T10:00:00.000Z",
    })

    const user = userEvent.setup()

    render(<AuditLogPage />)

    await screen.findByText("admin")

    await user.click(screen.getByRole("button", { name: /mở chi tiết nhật ký/i }))

    expect(await screen.findByRole("dialog")).toBeTruthy()
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByText("LOGIN")).toBeTruthy()
    expect(within(dialog).getByText("Thành công")).toBeTruthy()

    await user.click(screen.getByRole("button", { name: /đóng/i }))

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull()
    })
  })
})
