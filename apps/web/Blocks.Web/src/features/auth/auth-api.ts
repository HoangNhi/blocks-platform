import { ApiError } from "@/lib/api/api-error"
import type { ApiClient } from "@/lib/api/client"

import type {
  AuthSession,
  AuthUser,
  ChangePasswordRequest,
  EditProfileRequest,
  LoginRequest,
  LoginResponse,
  RefreshTokenRequest,
  TokenPair,
} from "./types"

type AuthApiOptions = Pick<ApiClient, "request">

type AuthApiRecord = Record<string, unknown>

function pickApiValue<T>(
  record: AuthApiRecord,
  camelKey: string,
  pascalKey: string,
) {
  if (Object.prototype.hasOwnProperty.call(record, camelKey)) {
    return record[camelKey] as T
  }

  return record[pascalKey] as T
}

function pickAuthFullname(record: AuthApiRecord) {
  return (
    pickApiValue<string | undefined>(record, "fullname", "Fullname") ??
    pickApiValue<string>(record, "fullName", "FullName")
  )
}

function mapAuthUser(response: AuthUser): AuthUser {
  const record = response as unknown as AuthApiRecord

  return {
    id: String(pickApiValue<string>(record, "id", "Id")),
    username: pickApiValue<string>(record, "username", "Username"),
    fullname: pickAuthFullname(record),
    roleId: String(pickApiValue<string>(record, "roleId", "RoleId")),
    roleName: pickApiValue<string | null | undefined>(
      record,
      "roleName",
      "RoleName",
    ),
    email: pickApiValue<string>(record, "email", "Email"),
    avatar: pickApiValue<string | null | undefined>(record, "avatar", "Avatar"),
  }
}

function buildDevelopmentSession(username: string): AuthSession {
  const normalizedUsername = username.trim() || "developer"
  const displayName = normalizedUsername
    .split(/[._-]/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ")

  return {
    user: {
      id: `dev-${normalizedUsername}`,
      username: normalizedUsername,
      fullname: displayName || "Development User",
      roleId: "dev-role",
      roleName: "Administrator",
      email: `${normalizedUsername}@example.test`,
      avatar: null,
    },
    tokens: {
      accessToken: "dev-access-token",
      refreshToken: "dev-refresh-token",
    },
  }
}

function mapLoginResponse(response: LoginResponse): AuthSession {
  const record = response as unknown as AuthApiRecord

  return {
    user: mapAuthUser(response),
    tokens: {
      accessToken: pickApiValue<string>(record, "accessToken", "AccessToken"),
      refreshToken: pickApiValue<string>(record, "refreshToken", "RefreshToken"),
    },
  }
}

function isDevelopmentAuthFallbackEnabled() {
  return (
    import.meta.env.DEV &&
    import.meta.env.VITE_ENABLE_DEV_AUTH_FALLBACK === "true"
  )
}

function isTransportFailure(error: unknown) {
  return error instanceof TypeError
}

export function createAuthApi(client: AuthApiOptions) {
  return {
    login: async (body: LoginRequest) => {
      try {
        const response = await client.request<LoginResponse>(
          "/api/system/Auth/login",
          {
            method: "POST",
            body,
          },
        )

        return mapLoginResponse(response)
      } catch (error) {
        if (
          isDevelopmentAuthFallbackEnabled() &&
          isTransportFailure(error) &&
          !(error instanceof ApiError)
        ) {
          return buildDevelopmentSession(body.username)
        }

        throw error
      }
    },
    refresh: (body: RefreshTokenRequest) =>
      client.request<TokenPair>("/api/system/Auth/refresh-token", {
        method: "POST",
        body,
      }),
    logout: () =>
      client.request<void>("/api/system/Auth/logout", {
        method: "POST",
      }),
    getCurrentUser: async () =>
      mapAuthUser(
        await client.request<AuthUser>("/api/system/User/get-current-user"),
      ),
    editProfile: async (body: EditProfileRequest) =>
      mapAuthUser(
        await client.request<AuthUser>("/api/system/User/edit-profile", {
          method: "PUT",
          body,
        }),
      ),
    changePassword: async (body: ChangePasswordRequest) => {
      const response = await client.request<AuthUser | null>(
        "/api/system/User/change-password",
        {
          method: "PUT",
          body,
        },
      )

      return response ? mapAuthUser(response) : undefined
    },
  }
}
