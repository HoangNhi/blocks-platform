import type { AuthSession } from "./types"

export const AUTH_SESSION_KEY = "blocks.auth.session"

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">

export function createTokenStore(storage: StorageLike) {
  function getSession() {
    const rawValue = storage.getItem(AUTH_SESSION_KEY)
    if (!rawValue) {
      return null
    }

    try {
      return JSON.parse(rawValue) as AuthSession
    } catch {
      storage.removeItem(AUTH_SESSION_KEY)
      return null
    }
  }

  function saveSession(session: AuthSession) {
    storage.setItem(AUTH_SESSION_KEY, JSON.stringify(session))
  }

  function clearSession() {
    storage.removeItem(AUTH_SESSION_KEY)
  }

  function getAccessToken() {
    return getSession()?.tokens.accessToken ?? null
  }

  function getRefreshToken() {
    return getSession()?.tokens.refreshToken ?? null
  }

  return {
    getSession,
    saveSession,
    clearSession,
    getAccessToken,
    getRefreshToken,
  }
}

export function createBrowserTokenStore() {
  return createTokenStore(window.localStorage)
}
