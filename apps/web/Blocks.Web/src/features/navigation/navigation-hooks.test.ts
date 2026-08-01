import { afterEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "@/lib/api/api-error"

import { resolveNavigationLoadFailure } from "./navigation-hooks"

describe("navigation load failure policy", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("does not use development navigation fallback by default", () => {
    const result = resolveNavigationLoadFailure(new TypeError("Failed to fetch"))

    expect(result).toMatchObject({
      kind: "error",
      error: expect.any(TypeError),
    })
  })

  it("uses development navigation fallback only when explicitly enabled", () => {
    vi.stubEnv("VITE_ENABLE_DEV_NAVIGATION_FALLBACK", "true")

    const result = resolveNavigationLoadFailure(new TypeError("Failed to fetch"))

    expect(result.kind).toBe("fallback")
    expect(result.kind === "fallback" ? result.navigation.length : 0).toBeGreaterThan(0)
  })

  it("keeps unauthorized navigation errors out of development fallback", () => {
    vi.stubEnv("VITE_ENABLE_DEV_NAVIGATION_FALLBACK", "true")

    const result = resolveNavigationLoadFailure(new ApiError("No token", 401))

    expect(result).toMatchObject({
      kind: "error",
      error: expect.objectContaining({ statusCode: 401 }),
    })
  })

  it("keeps forbidden navigation errors out of development fallback", () => {
    vi.stubEnv("VITE_ENABLE_DEV_NAVIGATION_FALLBACK", "true")

    const result = resolveNavigationLoadFailure(new ApiError("Access denied", 403))

    expect(result).toMatchObject({
      kind: "error",
      error: expect.objectContaining({ statusCode: 403 }),
    })
  })

  it("does not use development fallback for non-transport errors", () => {
    vi.stubEnv("VITE_ENABLE_DEV_NAVIGATION_FALLBACK", "true")

    const result = resolveNavigationLoadFailure(new Error("Invalid menu payload"))

    expect(result).toMatchObject({
      kind: "error",
      error: expect.objectContaining({ message: "Invalid menu payload" }),
    })
  })
})
