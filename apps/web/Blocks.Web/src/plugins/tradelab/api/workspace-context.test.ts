import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ApiClient } from "@/lib/api/client"
import { createApiClient } from "@/lib/api/client"
import { createTradeLabApi } from "./tradelab-api"
import {
  buildTradeLabHeaders,
  clearWorkspaceContext,
  createWorkspaceClient,
  fetchUserWorkspaces,
  getActiveWorkspaceId,
  resolveActiveWorkspace,
  setActiveWorkspaceId,
  type WorkspaceItem,
} from "./workspace-context"

describe("workspace-context", () => {
  beforeEach(() => {
    clearWorkspaceContext()
  })

  it("manages active workspace id in memory", () => {
    expect(getActiveWorkspaceId()).toBeNull()
    setActiveWorkspaceId("ws-100")
    expect(getActiveWorkspaceId()).toBe("ws-100")
    clearWorkspaceContext()
    expect(getActiveWorkspaceId()).toBeNull()
  })

  it("fetches user workspaces from SystemService authorization endpoint", async () => {
    const mockClient: ApiClient = {
      request: vi.fn().mockResolvedValue([
        { id: "ws-1", name: "Alpha" },
        { id: "ws-2", name: "Beta" },
      ]),
    }

    const items = await fetchUserWorkspaces(mockClient)
    expect(mockClient.request).toHaveBeenCalledWith("/api/system/Authorization/workspaces")
    expect(items).toHaveLength(2)
    expect(items[0].name).toBe("Alpha")
  })

  it("normalizes the real SystemService membership envelope through the gateway", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ Success: true, Data: [{ Id: "ws-1", Name: "Alpha" }] }), { status: 200 }))
    const client = createApiClient({ baseUrl: "http://127.0.0.1:5000", getAccessToken: () => "test-token", fetcher })
    await expect(fetchUserWorkspaces(client)).resolves.toEqual([{ id: "ws-1", name: "Alpha" }])
    expect(fetcher.mock.calls[0][0]).toBe("http://127.0.0.1:5000/api/system/Authorization/workspaces")
  })

  it("preserves membership fetch failures instead of reporting no workspace", async () => {
    const mockClient: ApiClient = {
      request: vi.fn().mockRejectedValue(new Error("Network error")),
    }

    await expect(fetchUserWorkspaces(mockClient)).rejects.toThrow("Network error")
  })

  it.each([null, {}, [{ id: "", name: "Bad" }], [{ id: "ws-1" }]])("rejects malformed membership response %j", async (response) => {
    const client: ApiClient = { request: vi.fn().mockResolvedValue(response) }
    await expect(fetchUserWorkspaces(client)).rejects.toThrow("Invalid workspace membership response.")
  })

  it("auto-selects when exactly one active workspace exists", () => {
    const workspaces: WorkspaceItem[] = [{ id: "ws-1", name: "Personal" }]
    const result = resolveActiveWorkspace(workspaces, null)
    expect(result.status).toBe("single_auto")
    expect(result.activeWorkspace).toEqual({ id: "ws-1", name: "Personal" })
  })

  it("requires explicit selection when multiple workspaces exist and no valid selection provided", () => {
    const workspaces: WorkspaceItem[] = [
      { id: "ws-1", name: "Personal" },
      { id: "ws-2", name: "Team" },
    ]
    const result = resolveActiveWorkspace(workspaces, null)
    expect(result.status).toBe("selection_required")
    expect(result.activeWorkspace).toBeNull()
  })

  it("accepts valid selected workspace when multiple exist", () => {
    const workspaces: WorkspaceItem[] = [
      { id: "ws-1", name: "Personal" },
      { id: "ws-2", name: "Team" },
    ]
    const result = resolveActiveWorkspace(workspaces, "ws-2")
    expect(result.status).toBe("ready")
    expect(result.activeWorkspace).toEqual({ id: "ws-2", name: "Team" })
  })

  it("handles empty workspace list", () => {
    const result = resolveActiveWorkspace([], null)
    expect(result.status).toBe("no_workspace")
    expect(result.activeWorkspace).toBeNull()
  })

  it("buildTradeLabHeaders attaches X-Workspace-Id for private requests", () => {
    const headers = buildTradeLabHeaders("ws-1", false)
    expect(headers).toEqual({ "X-Workspace-Id": "ws-1" })
  })

  it("buildTradeLabHeaders does not attach X-Workspace-Id for shared requests", () => {
    const headers = buildTradeLabHeaders("ws-1", true)
    expect(headers).toEqual({})
  })
})


describe("workspace-bound API client", () => {
  let actorId: string | null
  let client: ApiClient

  beforeEach(() => {
    clearWorkspaceContext()
    setActiveWorkspaceId("ws-1")
    actorId = "owner-1"
    client = { request: vi.fn().mockResolvedValue({ id: "owned" }) }
  })

  it("uses verified workspace on private requests and preserves options", async () => {
    const scoped = createWorkspaceClient(client, () => actorId)
    await scoped.request("/api/tradelab/strategies", { method: "POST", body: { name: "Private" }, headers: { "x-workspace-id": "spoof", Accept: "application/json" } })
    expect(client.request).toHaveBeenCalledWith("/api/tradelab/strategies", { method: "POST", body: { name: "Private" }, headers: { Accept: "application/json", "X-Workspace-Id": "ws-1" } })
  })

  it("carries workspace through real domain and HTTP clients without scoping shared coverage", async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ Success: true, Data: { items: [] } }), { status: 200 }))
    const http = createApiClient({ baseUrl: "http://127.0.0.1", getAccessToken: () => "test-token", fetcher })
    const api = createTradeLabApi(createWorkspaceClient(http, () => actorId))
    await api.listStrategies()
    await api.listDatasetCoverage()
    expect(fetcher.mock.calls[0][1].headers).toEqual({ Accept: "application/json", "X-Workspace-Id": "ws-1", Authorization: "Bearer test-token" })
    expect(fetcher.mock.calls[1][1].headers).toEqual({ Accept: "application/json", Authorization: "Bearer test-token" })
  })

  it.each(["/api/tradelab/datasets/coverage", "/api/tradelab/datasets/fill-preview", "/api/tradelab/exchange-symbols", "/api/tradelab/health"])("keeps shared route %s unscoped", async (path) => {
    clearWorkspaceContext()
    const scoped = createWorkspaceClient(client, () => actorId)
    await scoped.request(path, { headers: { "X-Workspace-Id": "spoof" } })
    expect(client.request).toHaveBeenCalledWith(path, { headers: {} })
  })

  it.each(["/api/tradelab/strategies", "/api/tradelab/datasets-private", "/api/tradelab/paper/scheduler/status", "/api/tradelab/paper/safety/status"])("blocks private route %s without workspace", async (path) => {
    clearWorkspaceContext()
    const scoped = createWorkspaceClient(client, () => actorId)
    await expect(scoped.request(path)).rejects.toThrow("Select a verified TradeLab workspace first.")
    expect(client.request).not.toHaveBeenCalled()
  })

  it("blocks calls from obsolete workbench after workspace change", async () => {
    const scoped = createWorkspaceClient(client, () => actorId)
    setActiveWorkspaceId("ws-2")
    await expect(scoped.request("/api/tradelab/strategies")).rejects.toThrow("TradeLab session or workspace changed.")
    expect(client.request).not.toHaveBeenCalled()
  })

  it.each([null, "owner-2"])("blocks obsolete actor %s", async (nextActor) => {
    const scoped = createWorkspaceClient(client, () => actorId)
    actorId = nextActor
    await expect(scoped.request("/api/tradelab/strategies")).rejects.toThrow("TradeLab session or workspace changed.")
    expect(client.request).not.toHaveBeenCalled()
  })

  it("discards delayed response across scope reset even when same IDs return", async () => {
    let resolve: (value: unknown) => void = () => {}
    client.request = vi.fn().mockReturnValue(new Promise((done) => { resolve = done }))
    const scoped = createWorkspaceClient(client, () => actorId)
    const pending = scoped.request("/api/tradelab/strategies")
    clearWorkspaceContext()
    setActiveWorkspaceId("ws-1")
    resolve({ id: "old-data" })
    await expect(pending).rejects.toThrow("TradeLab session or workspace changed.")
  })
})
