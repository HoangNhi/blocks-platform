import { afterEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/lib/api/api-error"
import type { ApiClient } from "@/lib/api/client"

import { createAuthApi } from "./auth-api"
import type { AuthUser, LoginResponse, TokenPair } from "./types"

describe("auth API", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("logs in through the auth endpoint and maps a session", async () => {
    const requestMock = vi.fn(async () => ({
      id: "user-1",
      username: "admin",
      fullname: "Admin User",
      roleId: "role-1",
      roleName: "Administrator",
      email: "admin@example.test",
      avatar: null,
      accessToken: "access-1",
      refreshToken: "refresh-1",
    } satisfies LoginResponse))
    const request = requestMock as unknown as ApiClient["request"]
    const api = createAuthApi({ request })

    const session = await api.login({
      username: "admin",
      password: "secret",
    })

    expect(requestMock).toHaveBeenCalledWith("/api/system/Auth/login", {
      method: "POST",
      body: {
        username: "admin",
        password: "secret",
      },
    })
    expect(session.user.fullname).toBe("Admin User")
    expect(session.tokens.accessToken).toBe("access-1")
  })

  it("maps PascalCase login responses from System Service", async () => {
    const requestMock = vi.fn(async () => ({
      Id: "user-1",
      Username: "admin",
      Fullname: "Admin User",
      RoleId: "role-1",
      RoleName: "Administrator",
      Email: "admin@example.test",
      Avatar: null,
      AccessToken: "access-1",
      RefreshToken: "refresh-1",
    }) as unknown as LoginResponse & Record<string, unknown>)
    const request = requestMock as unknown as ApiClient["request"]
    const api = createAuthApi({ request })

    const session = await api.login({
      username: "admin",
      password: "secret",
    })

    expect(session).toEqual({
      user: {
        id: "user-1",
        username: "admin",
        fullname: "Admin User",
        roleId: "role-1",
        roleName: "Administrator",
        email: "admin@example.test",
        avatar: null,
      },
      tokens: {
        accessToken: "access-1",
        refreshToken: "refresh-1",
      },
    })
  })

  it("stores only safe user fields from login responses", async () => {
    const requestMock = vi.fn(async () => ({
      id: "user-1",
      username: "admin",
      fullname: "Admin User",
      roleId: "role-1",
      roleName: "Administrator",
      email: "admin@example.test",
      avatar: null,
      password: "hashed-password",
      Password: "pascal-hashed-password",
      createdBy: "system",
      accessToken: "access-1",
      refreshToken: "refresh-1",
    }) as LoginResponse & Record<string, unknown>)
    const request = requestMock as unknown as ApiClient["request"]
    const api = createAuthApi({ request })

    const session = await api.login({
      username: "admin",
      password: "secret",
    })

    expect(session.user).toEqual({
      id: "user-1",
      username: "admin",
      fullname: "Admin User",
      roleId: "role-1",
      roleName: "Administrator",
      email: "admin@example.test",
      avatar: null,
    })
  })

  it("does not use development fallback unless explicitly enabled", async () => {
    const authError = new Error("Network unavailable")
    const requestMock = vi.fn(async () => {
      throw authError
    })
    const request = requestMock as unknown as ApiClient["request"]
    const api = createAuthApi({ request })

    await expect(
      api.login({
        username: "admin",
        password: "secret",
      }),
    ).rejects.toBe(authError)
  })

  it("does not use development fallback for non-transport errors", async () => {
    vi.stubEnv("VITE_ENABLE_DEV_AUTH_FALLBACK", "true")
    const parseError = new Error("The server returned invalid JSON.")
    const requestMock = vi.fn(async () => {
      throw parseError
    })
    const request = requestMock as unknown as ApiClient["request"]
    const api = createAuthApi({ request })

    await expect(
      api.login({
        username: "admin",
        password: "secret",
      }),
    ).rejects.toBe(parseError)
  })

  it("keeps API authentication errors out of development fallback", async () => {
    const requestMock = vi.fn(async () => {
      throw new ApiError("Invalid login", 401)
    })
    const request = requestMock as unknown as ApiClient["request"]
    const api = createAuthApi({ request })

    await expect(
      api.login({
        username: "admin",
        password: "wrong",
      }),
    ).rejects.toMatchObject({
      message: "Invalid login",
      statusCode: 401,
    })
  })

  it("uses development fallback only when the opt-in flag is enabled", async () => {
    vi.stubEnv("VITE_ENABLE_DEV_AUTH_FALLBACK", "true")
    const requestMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch")
    })
    const request = requestMock as unknown as ApiClient["request"]
    const api = createAuthApi({ request })

    const session = await api.login({
      username: "local.dev",
      password: "secret",
    })

    expect(session.user).toMatchObject({
      id: "dev-local.dev",
      username: "local.dev",
      roleName: "Administrator",
    })
    expect(session.tokens.accessToken).toBe("dev-access-token")
  })

  it("refreshes tokens through the auth endpoint", async () => {
    const requestMock = vi.fn(async () => ({
      accessToken: "access-2",
      refreshToken: "refresh-2",
    } satisfies TokenPair))
    const request = requestMock as unknown as ApiClient["request"]
    const api = createAuthApi({ request })

    await expect(
      api.refresh({
        refreshToken: "refresh-1",
      }),
    ).resolves.toEqual({
      accessToken: "access-2",
      refreshToken: "refresh-2",
    })

    expect(requestMock).toHaveBeenCalledWith("/api/system/Auth/refresh-token", {
      method: "POST",
      body: {
        refreshToken: "refresh-1",
      },
    })
  })

  it("loads the current user from System Service", async () => {
    const requestMock = vi.fn(async () => ({
      id: "user-1",
      username: "admin",
      fullname: "Admin User",
      roleId: "role-1",
      roleName: "Administrator",
      email: "admin@example.test",
      avatar: null,
    } satisfies AuthUser))
    const request = requestMock as unknown as ApiClient["request"]
    const api = createAuthApi({ request })

    await expect(api.getCurrentUser()).resolves.toMatchObject({
      username: "admin",
    })

    expect(requestMock).toHaveBeenCalledWith("/api/system/User/get-current-user")
  })

  it("maps PascalCase current user responses from System Service", async () => {
    const requestMock = vi.fn(async () => ({
      Id: "user-1",
      Username: "admin",
      Fullname: "Admin User",
      RoleId: "role-1",
      RoleName: "Administrator",
      Email: "admin@example.test",
      Avatar: null,
    }) as unknown as AuthUser & Record<string, unknown>)
    const request = requestMock as unknown as ApiClient["request"]
    const api = createAuthApi({ request })

    await expect(api.getCurrentUser()).resolves.toEqual({
      id: "user-1",
      username: "admin",
      fullname: "Admin User",
      roleId: "role-1",
      roleName: "Administrator",
      email: "admin@example.test",
      avatar: null,
    })
  })

  it("stores only safe user fields from current user responses", async () => {
    const requestMock = vi.fn(async () => ({
      id: "user-1",
      username: "admin",
      fullname: "Admin User",
      roleId: "role-1",
      roleName: "Administrator",
      email: "admin@example.test",
      avatar: null,
      password: "hashed-password",
      Password: "pascal-hashed-password",
      updatedBy: "system",
    }) as AuthUser & Record<string, unknown>)
    const request = requestMock as unknown as ApiClient["request"]
    const api = createAuthApi({ request })

    await expect(api.getCurrentUser()).resolves.toEqual({
      id: "user-1",
      username: "admin",
      fullname: "Admin User",
      roleId: "role-1",
      roleName: "Administrator",
      email: "admin@example.test",
      avatar: null,
    })
  })


  it("updates the current user profile through System Service", async () => {
    const requestMock = vi.fn(async () => ({
      id: "user-1",
      username: "admin",
      fullname: "Quản trị mới",
      roleId: "role-1",
      roleName: "Administrator",
      email: "new-admin@example.test",
      avatar: null,
    } satisfies AuthUser))
    const request = requestMock as unknown as ApiClient["request"]
    const api = createAuthApi({ request })

    await expect(
      api.editProfile({
        fullName: "Quản trị mới",
        email: "new-admin@example.test",
        avatar: null,
      }),
    ).resolves.toMatchObject({
      fullname: "Quản trị mới",
      email: "new-admin@example.test",
    })

    expect(requestMock).toHaveBeenCalledWith("/api/system/User/edit-profile", {
      method: "PUT",
      body: {
        fullName: "Quản trị mới",
        email: "new-admin@example.test",
        avatar: null,
      },
    })
  })

  it("changes the current user password through System Service", async () => {
    const requestMock = vi.fn(async () => null)
    const request = requestMock as unknown as ApiClient["request"]
    const api = createAuthApi({ request })

    await api.changePassword({
      oldPassword: "Abc@123",
      newPassword: "Abc@456",
      confirmNewPassword: "Abc@456",
    })

    expect(requestMock).toHaveBeenCalledWith("/api/system/User/change-password", {
      method: "PUT",
      body: {
        oldPassword: "Abc@123",
        newPassword: "Abc@456",
        confirmNewPassword: "Abc@456",
      },
    })
  })

  it("logs out through the auth endpoint", async () => {
    const requestMock = vi.fn(async () => null)
    const request = requestMock as unknown as ApiClient["request"]
    const api = createAuthApi({ request })

    await api.logout()

    expect(requestMock).toHaveBeenCalledWith("/api/system/Auth/logout", {
      method: "POST",
    })
  })
})
