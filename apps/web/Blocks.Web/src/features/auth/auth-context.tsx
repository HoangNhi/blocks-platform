/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"

import { ApiError } from "@/lib/api/api-error"
import { createApiClient } from "@/lib/api/client"

import { createAuthApi } from "./auth-api"
import { createBrowserTokenStore, createTokenStore } from "./token-store"
import type {
  AuthSession,
  AuthUser,
  ChangePasswordRequest,
  EditProfileRequest,
  LoginRequest,
  RefreshTokenRequest,
} from "./types"

type AuthStatus = "loading" | "anonymous" | "authenticated" | "forbidden"

type AuthContextValue = {
  session: AuthSession | null
  currentUser: AuthUser | null
  status: AuthStatus
  error: Error | null
  login: (request: LoginRequest) => Promise<AuthSession>
  refreshSession: () => Promise<void>
  refreshCurrentUser: () => Promise<AuthUser>
  editProfile: (request: EditProfileRequest) => Promise<AuthUser>
  changePassword: (request: ChangePasswordRequest) => Promise<AuthUser | null>
  logout: () => Promise<void>
  clearError: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const noopStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
}

function createSessionStore() {
  if (typeof window === "undefined") {
    return createTokenStore(noopStorage)
  }

  return createBrowserTokenStore()
}

function createAuthClient(getAccessToken: () => string | null) {
  return createAuthApi(
    createApiClient({
      baseUrl: import.meta.env.VITE_API_BASE_URL ?? "/",
      getAccessToken,
    }),
  )
}

function isAuthError(error: unknown): error is ApiError {
  return error instanceof ApiError
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const tokenStore = useMemo(() => createSessionStore(), [])
  const authApi = useMemo(
    () => createAuthClient(tokenStore.getAccessToken),
    [tokenStore],
  )
  const initialSession = tokenStore.getSession()
  const [session, setSession] = useState<AuthSession | null>(() => initialSession)
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(
    () => initialSession?.user ?? null,
  )
  const [status, setStatus] = useState<AuthStatus>(() =>
    initialSession ? "loading" : "anonymous",
  )
  const [error, setError] = useState<Error | null>(null)

  function saveCurrentUser(user: AuthUser) {
    const storedSession = tokenStore.getSession() ?? session

    if (storedSession) {
      const nextSession: AuthSession = {
        ...storedSession,
        user,
      }

      tokenStore.saveSession(nextSession)
      setSession(nextSession)
    }

    setCurrentUser(user)
    return user
  }

  useEffect(() => {
    const storedSession = tokenStore.getSession()
    if (!storedSession) {
      return
    }

    void authApi
      .getCurrentUser()
      .then((user) => {
        if (!user) return
        const nextSession: AuthSession = {
          ...storedSession,
          user,
        }

        tokenStore.saveSession(nextSession)
        setSession(nextSession)
        setCurrentUser(user)
        setStatus("authenticated")
      })
      .catch((loadError: unknown) => {
        if (isAuthError(loadError) && loadError.isUnauthorized) {
          tokenStore.clearSession()
          setSession(null)
          setCurrentUser(null)
          setStatus("anonymous")
          return
        }

        if (isAuthError(loadError) && loadError.isForbidden) {
          setError(loadError)
          setStatus("forbidden")
          return
        }

        setError(
          loadError instanceof Error
            ? loadError
            : new Error("Unable to load the signed-in session."),
        )
        setCurrentUser(storedSession.user)
        setStatus("authenticated")
      })
  }, [authApi, tokenStore])

  async function login(request: LoginRequest) {
    setError(null)
    const nextSession = await authApi.login(request)
    tokenStore.saveSession(nextSession)
    setSession(nextSession)
    setCurrentUser(nextSession.user)
    setStatus("authenticated")
    return nextSession
  }

  async function refreshSession() {
    const storedSession = tokenStore.getSession()
    if (!storedSession) {
      return
    }

    const refreshedTokens = await authApi.refresh({
      refreshToken: storedSession.tokens.refreshToken,
    } satisfies RefreshTokenRequest)

    const nextSession: AuthSession = {
      user: currentUser ?? storedSession.user,
      tokens: refreshedTokens,
    }

    tokenStore.saveSession(nextSession)
    setSession(nextSession)
  }

  async function refreshCurrentUser() {
    setError(null)
    const user = await authApi.getCurrentUser()
    return saveCurrentUser(user)
  }

  async function editProfile(request: EditProfileRequest) {
    setError(null)
    const updatedUser = await authApi.editProfile(request)
    saveCurrentUser(updatedUser)

    try {
      return await refreshCurrentUser()
    } catch {
      return updatedUser
    }
  }

  async function changePassword(request: ChangePasswordRequest) {
    setError(null)
    const updatedUser = await authApi.changePassword(request)
    if (!updatedUser) {
      return null
    }

    return saveCurrentUser(updatedUser)
  }

  async function logout() {
    try {
      await authApi.logout()
    } catch {
      // Clear locally even if the server logout fails.
    } finally {
      tokenStore.clearSession()
      setSession(null)
      setCurrentUser(null)
      setStatus("anonymous")
      setError(null)
    }
  }

  function clearError() {
    setError(null)
  }

  const value = {
    session,
    currentUser,
    status,
    error,
    login,
    refreshSession,
    refreshCurrentUser,
    editProfile,
    changePassword,
    logout,
    clearError,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider")
  }

  return context
}
