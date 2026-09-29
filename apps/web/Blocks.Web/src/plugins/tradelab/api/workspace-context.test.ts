import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ApiClient } from "@/lib/api/client"
import {
  buildTradeLabHeaders,
  clearWorkspaceContext,
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
    expect(mockClient.request).toHaveBeenCalledWith("/api/Authorization/workspaces")
    expect(items).toHaveLength(2)
    expect(items[0].name).toBe("Alpha")
  })

  it("returns empty array if fetching workspaces fails", async () => {
    const mockClient: ApiClient = {
      request: vi.fn().mockRejectedValue(new Error("Network error")),
    }

    const items = await fetchUserWorkspaces(mockClient)
    expect(items).toEqual([])
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
