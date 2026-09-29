import type { ApiClient } from "@/lib/api/client"

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

export function getActiveWorkspaceId(): string | null {
  return currentWorkspaceId
}

export function setActiveWorkspaceId(id: string | null): void {
  currentWorkspaceId = id
}

export function clearWorkspaceContext(): void {
  currentWorkspaceId = null
}

export async function fetchUserWorkspaces(apiClient: ApiClient): Promise<WorkspaceItem[]> {
  try {
    const response = await apiClient.request<WorkspaceItem[]>("/api/Authorization/workspaces")
    return Array.isArray(response) ? response : []
  } catch {
    return []
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
