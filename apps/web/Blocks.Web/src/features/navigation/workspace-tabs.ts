import {
  buildBreadcrumb,
  canAccessRoute,
  flattenNavigation,
} from "./navigation-utils"
import type { BreadcrumbItem, NavNode } from "./types"

export const WORKSPACE_TABS_STORAGE_VERSION = 1
export const DEFAULT_WORKSPACE_ROUTE = "/"

export type WorkspaceTab = {
  id: string
  route: string
  title: string
  owner: NavNode["owner"]
  ownerKey: string
  pinned: boolean
  breadcrumb: BreadcrumbItem[]
  icon?: NavNode["icon"]
}

export type SerializedWorkspaceTabs = {
  version: typeof WORKSPACE_TABS_STORAGE_VERSION
  activeRoute: string
  routes: string[]
}

export type WorkspaceTabsState = {
  tabs: WorkspaceTab[]
  activeRoute: string
  candidates: WorkspaceTab[]
}

type ResolveWorkspaceTabsOptions = {
  navigation: NavNode[]
  routes: string[]
  activeRoute: string
}

export function getWorkspaceTabsStorageKey(userId: string) {
  return `blocks.workspace.tabs.${userId}`
}

export function getWorkspaceTabCandidates(navigation: NavNode[]): WorkspaceTab[] {
  const seenRoutes = new Set<string>()
  const candidates = flattenNavigation(navigation)
    .filter((node) => node.kind === "menu" && node.route)
    .filter((node) => canAccessRoute(navigation, node.route ?? ""))
    .filter((node) => {
      if (!node.route || seenRoutes.has(node.route)) {
        return false
      }

      seenRoutes.add(node.route)
      return true
    })
    .map((node) => ({
      id: node.id,
      route: node.route ?? DEFAULT_WORKSPACE_ROUTE,
      title: node.title,
      owner: node.owner,
      ownerKey: node.ownerKey,
      pinned: node.route === DEFAULT_WORKSPACE_ROUTE,
      breadcrumb: buildBreadcrumb(navigation, node.route ?? DEFAULT_WORKSPACE_ROUTE),
      icon: node.icon,
    }))

  if (seenRoutes.has(DEFAULT_WORKSPACE_ROUTE)) {
    return candidates
  }

  return [getDefaultWorkspaceTab(), ...candidates]
}

function getDefaultWorkspaceTab(): WorkspaceTab {
  return {
    id: "platform-overview",
    route: DEFAULT_WORKSPACE_ROUTE,
    title: "Platform Overview",
    owner: "system",
    ownerKey: "blocks-web",
    pinned: true,
    breadcrumb: [
      {
        id: "platform-overview",
        title: "Platform Overview",
        route: DEFAULT_WORKSPACE_ROUTE,
      },
    ],
  }
}

export function resolveWorkspaceTabsState({
  navigation,
  routes,
  activeRoute,
}: ResolveWorkspaceTabsOptions): WorkspaceTabsState {
  const candidates = getWorkspaceTabCandidates(navigation)
  const candidateByRoute = new Map(candidates.map((tab) => [tab.route, tab]))
  const defaultCandidate = candidateByRoute.get(DEFAULT_WORKSPACE_ROUTE)
  const resolvedRoutes = new Set<string>()

  if (defaultCandidate) {
    resolvedRoutes.add(DEFAULT_WORKSPACE_ROUTE)
  }

  for (const route of routes) {
    if (candidateByRoute.has(route)) {
      resolvedRoutes.add(route)
    }
  }

  if (candidateByRoute.has(activeRoute)) {
    resolvedRoutes.add(activeRoute)
  }

  const tabs = [...resolvedRoutes]
    .map((route) => candidateByRoute.get(route))
    .filter((tab): tab is WorkspaceTab => Boolean(tab))

  const nextActiveRoute = candidateByRoute.has(activeRoute)
    ? activeRoute
    : defaultCandidate?.route ?? tabs[0]?.route ?? activeRoute

  return {
    tabs,
    activeRoute: nextActiveRoute,
    candidates,
  }
}

export function openWorkspaceTab(
  state: WorkspaceTabsState,
  route: string,
): WorkspaceTabsState {
  const candidate = state.candidates.find((tab) => tab.route === route)

  if (!candidate) {
    return state
  }

  const hasTab = state.tabs.some((tab) => tab.route === route)
  const tabs = hasTab ? state.tabs : [...state.tabs, candidate]

  return {
    ...state,
    tabs,
    activeRoute: route,
  }
}

export function closeWorkspaceTab(
  state: WorkspaceTabsState,
  route: string,
): WorkspaceTabsState {
  const closingIndex = state.tabs.findIndex((tab) => tab.route === route)
  const closingTab = state.tabs[closingIndex]

  if (!closingTab || closingTab.pinned) {
    return state
  }

  const tabs = state.tabs.filter((tab) => tab.route !== route)
  const activeRoute =
    state.activeRoute === route
      ? (tabs[Math.max(0, closingIndex - 1)]?.route ??
        tabs[closingIndex]?.route ??
        DEFAULT_WORKSPACE_ROUTE)
      : state.activeRoute

  return {
    ...state,
    tabs,
    activeRoute,
  }
}

export function serializeWorkspaceTabs(
  state: WorkspaceTabsState,
): SerializedWorkspaceTabs {
  return {
    version: WORKSPACE_TABS_STORAGE_VERSION,
    activeRoute: state.activeRoute,
    routes: state.tabs.map((tab) => tab.route),
  }
}

export function parseSerializedWorkspaceTabs(
  rawValue: string | null,
): SerializedWorkspaceTabs | null {
  if (!rawValue) {
    return null
  }

  try {
    const parsed = JSON.parse(rawValue) as Partial<SerializedWorkspaceTabs>

    if (
      parsed.version !== WORKSPACE_TABS_STORAGE_VERSION ||
      typeof parsed.activeRoute !== "string" ||
      !Array.isArray(parsed.routes) ||
      parsed.routes.some((route) => typeof route !== "string")
    ) {
      return null
    }

    return {
      version: WORKSPACE_TABS_STORAGE_VERSION,
      activeRoute: parsed.activeRoute,
      routes: parsed.routes,
    }
  } catch {
    return null
  }
}
