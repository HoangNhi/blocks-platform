import type { ApiClient } from "@/lib/api/client"
import type { ApiRequestOptions } from "@/lib/api/types"

export type WorkspaceItem = {
  id: string
  name: string
}

export type WorkspaceResolutionStatus =
  | "ready"
  | "single_auto"
  | "selection_required"
  | "no_workspace"

export type WorkspaceResolution = {
  status: WorkspaceResolutionStatus
  activeWorkspace: WorkspaceItem | null
}

let currentWorkspaceId: string | null = null
let workspaceRevision = 0

export function getActiveWorkspaceId(): string | null {
  return currentWorkspaceId
}

export function setActiveWorkspaceId(id: string | null): void {
  workspaceRevision += 1
  currentWorkspaceId = id
}

export function clearWorkspaceContext(): void {
  workspaceRevision += 1
  currentWorkspaceId = null
}

export async function fetchUserWorkspaces(apiClient: ApiClient): Promise<WorkspaceItem[]> {
  const response = await apiClient.request<unknown>("/api/system/Authorization/workspaces")
  if (!Array.isArray(response)) throw new Error("Invalid workspace membership response.")
  const workspaces = response.map((item: unknown) => {
    if (!item || typeof item !== "object") throw new Error("Invalid workspace membership response.")
    const record = item as Record<string, unknown>
    const id = record.id ?? record.Id
    const name = record.name ?? record.Name
    if (typeof id !== "string" || !id.trim() || typeof name !== "string") throw new Error("Invalid workspace membership response.")
    return { id, name }
  })
  if (new Set(workspaces.map((item) => item.id)).size !== workspaces.length) {
    throw new Error("Invalid workspace membership response.")
  }
  return workspaces
}

export function createWorkspaceClient(client: ApiClient, getActorId: () => string | null): ApiClient {
  const actorId = getActorId()
  const workspaceId = currentWorkspaceId
  const revision = workspaceRevision

  function assertCurrentScope() {
    if (!actorId || actorId !== getActorId() || revision !== workspaceRevision) {
      throw new Error("TradeLab session or workspace changed.")
    }
  }

  return {
    async request<T>(path: string, options: ApiRequestOptions = {}) {
      assertCurrentScope()
      const isSharedRoute = /^\/api\/tradelab\/(?:datasets(?:\/|$)|exchange-symbols(?:\/|$)|health$)/.test(path)
      if (!isSharedRoute && !workspaceId) {
        throw new Error("Select a verified TradeLab workspace first.")
      }
      const headers = Object.fromEntries(Object.entries(options.headers ?? {})
        .filter(([name]) => name.toLowerCase() !== "x-workspace-id"))
      const response = await client.request<T>(path, {
        ...options,
        headers: { ...headers, ...buildTradeLabHeaders(workspaceId, isSharedRoute) },
      })
      assertCurrentScope()
      return response
    },
  }
}

export function resolveActiveWorkspace(
  workspaces: WorkspaceItem[],
  selectedId?: string | null,
): WorkspaceResolution {
  if (!workspaces || workspaces.length === 0) {
    return { status: "no_workspace", activeWorkspace: null }
  }

  if (workspaces.length === 1) {
    return { status: "single_auto", activeWorkspace: workspaces[0] }
  }

  if (selectedId) {
    const matched = workspaces.find((w) => w.id === selectedId)
    if (matched) {
      return { status: "ready", activeWorkspace: matched }
    }
  }

  // When multiple workspaces exist and no valid selection matches, do NOT guess!
  return { status: "selection_required", activeWorkspace: null }
}

export function buildTradeLabHeaders(
  workspaceId?: string | null,
  isSharedRoute: boolean = false,
): Record<string, string> {
  if (isSharedRoute || !workspaceId) {
    return {}
  }
  return { "X-Workspace-Id": workspaceId }
}
