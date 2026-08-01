import { describe, expect, it, vi } from "vitest"

import { createApiClient } from "./client"

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  })
}

describe("API client", () => {
  it("builds URLs from base URL and query values", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({ success: true, data: { ok: true } }),
    )
    const client = createApiClient({
      baseUrl: "http://localhost:5000/",
      getAccessToken: () => null,
      fetcher,
    })

    await client.request<{ ok: boolean }>("/api/system/User/get-by-id", {
      query: { id: "abc", empty: null },
    })

    const firstCall = fetcher.mock.calls[0] as unknown as
      | [string, RequestInit?]
      | undefined

    expect(firstCall?.[0]).toBe(
      "http://localhost:5000/api/system/User/get-by-id?id=abc",
    )
  })

  it("attaches bearer token when available", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({ success: true, data: { ok: true } }),
    )
    const client = createApiClient({
      baseUrl: "http://localhost:5000",
      getAccessToken: () => "token-1",
      fetcher,
    })

    await client.request<{ ok: boolean }>("/api/system/User/get-current-user")

    const firstCall = fetcher.mock.calls[0] as unknown as
      | [string, RequestInit?]
      | undefined
    const init = firstCall?.[1] as RequestInit
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer token-1",
    )
  })

  it("parses PascalCase unauthorized envelopes", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({ Success: false, StatusCode: 401, Message: "No token" }),
    )
    const client = createApiClient({
      baseUrl: "http://localhost:5000",
      getAccessToken: () => null,
      fetcher,
    })

    await expect(
      client.request("/api/system/User/get-current-user"),
    ).rejects.toMatchObject({
      message: "No token",
      statusCode: 401,
    })
  })

  it("sends JSON request bodies", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({ success: true, data: { id: "1" } }),
    )
    const client = createApiClient({
      baseUrl: "http://localhost:5000",
      getAccessToken: () => null,
      fetcher,
    })

    await client.request("/api/system/Auth/login", {
      method: "POST",
      body: { username: "admin", password: "secret" },
    })

    const firstCall = fetcher.mock.calls[0] as unknown as
      | [string, RequestInit?]
      | undefined
    const init = firstCall?.[1] as RequestInit
    expect(init.method).toBe("POST")
    expect(init.body).toBe(
      JSON.stringify({ username: "admin", password: "secret" }),
    )
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/json",
    )
  })

  it("sends FormData bodies without JSON content type", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({ Success: true, Data: [{ FileUrl: "sar-embeds/files/id/report.pdf" }] }),
    )
    const client = createApiClient({
      baseUrl: "http://localhost:5000",
      getAccessToken: () => "token-1",
      fetcher,
    })
    const formData = new FormData()
    formData.append("FolderName", "phase3-smoke")

    await client.request("/api/files/UploadFile/embed", {
      method: "POST",
      body: formData,
    })

    const firstCall = fetcher.mock.calls[0] as unknown as
      | [string, RequestInit?]
      | undefined
    const init = firstCall?.[1] as RequestInit
    const headers = init.headers as Record<string, string>

    expect(init.method).toBe("POST")
    expect(init.body).toBe(formData)
    expect(headers.Authorization).toBe("Bearer token-1")
    expect(headers["Content-Type"]).toBeUndefined()
  })
})
