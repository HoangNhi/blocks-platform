import { describe, expect, it } from "vitest"

import { createTokenStore } from "./token-store"
import type { AuthSession } from "./types"

function createMemoryStorage() {
  const data = new Map<string, string>()

  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
  }
}

const session: AuthSession = {
  user: {
    id: "user-1",
    username: "admin",
    fullname: "Admin User",
    roleId: "role-1",
    roleName: "Administrator",
    email: "admin@example.test",
  },
  tokens: {
    accessToken: "access-1",
    refreshToken: "refresh-1",
  },
}

describe("token store", () => {
  it("saves and reads the session", () => {
    const store = createTokenStore(createMemoryStorage())

    store.saveSession(session)

    expect(store.getSession()).toEqual(session)
    expect(store.getAccessToken()).toBe("access-1")
  })

  it("clears invalid or removed sessions", () => {
    const storage = createMemoryStorage()
    const store = createTokenStore(storage)

    storage.setItem("blocks.auth.session", "{")

    expect(store.getSession()).toBeNull()
    expect(store.getAccessToken()).toBeNull()
  })

  it("clears a saved session", () => {
    const store = createTokenStore(createMemoryStorage())

    store.saveSession(session)
    store.clearSession()

    expect(store.getSession()).toBeNull()
  })
})
