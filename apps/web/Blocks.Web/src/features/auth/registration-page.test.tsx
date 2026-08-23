import { describe, expect, it, vi } from "vitest"

import type { ApiClient } from "@/lib/api/client"

import { createAuthApi } from "./auth-api"

const requestMock = vi.fn()
const request = requestMock as unknown as ApiClient["request"]

describe("registration auth API", () => {
  it("reads availability and sends strict public registration payload", async () => {
    requestMock.mockResolvedValueOnce({ isAvailable: true }).mockResolvedValueOnce({
      id: "user-1",
      username: "member",
      email: "member@example.test",
      fullname: "Thành viên",
      workspaceId: "workspace-1",
    })
    const api = createAuthApi({ request })

    await expect(api.getRegistrationAvailability()).resolves.toEqual({ isAvailable: true })
    await expect(api.register({
      username: "member",
      email: "member@example.test",
      fullname: "Thành viên",
      password: "a-secure-password",
      invitationToken: "invite-token",
    })).resolves.toMatchObject({ username: "member" })

    expect(requestMock).toHaveBeenNthCalledWith(1, "/api/system/Auth/registration-availability")
    expect(requestMock).toHaveBeenNthCalledWith(2, "/api/system/Auth/register", {
      method: "POST",
      body: {
        username: "member",
        email: "member@example.test",
        fullname: "Thành viên",
        password: "a-secure-password",
        invitationToken: "invite-token",
      },
    })
  })
})
