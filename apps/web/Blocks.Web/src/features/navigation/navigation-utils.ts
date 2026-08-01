import type { BreadcrumbItem, NavNode } from "./types"

function sortNodes(nodes: NavNode[]) {
  return [...nodes].sort((a, b) => a.sort - b.sort)
}

const alwaysAllowedReadinessRoutes = new Set([
  "/plugins/installed",
  "/plugins/activity",
  "/plugins/manifests",
  "/services/files/library",
  "/services/files/storage-providers",
])

function matchesRoutePattern(pattern: string, route: string) {
  const patternParts = pattern.split("/")
  const routeParts = route.split("/")
  return patternParts.length === routeParts.length
    && patternParts.every((part, index) => part.startsWith(":") || part === routeParts[index])
}

export function getVisibleNavigation(nodes: NavNode[]): NavNode[] {
  return sortNodes(nodes)
    .filter((node) => node.isVisible)
    .map((node) => ({
      ...node,
      children: node.children ? getVisibleNavigation(node.children) : undefined,
    }))
}

export function flattenNavigation(nodes: NavNode[]): NavNode[] {
  return getVisibleNavigation(nodes).flatMap((node) => [
    node,
    ...(node.children ? flattenNavigation(node.children) : []),
  ])
}

export function findActiveTrailByRoute(
  nodes: NavNode[],
  route: string,
): NavNode[] {
  for (const node of getVisibleNavigation(nodes)) {
    if (node.route === route) {
      return [node]
    }

    if (node.children) {
      const childTrail = findActiveTrailByRoute(node.children, route)

      if (childTrail.length > 0) {
        return [node, ...childTrail]
      }
    }
  }

  return []
}

export function buildBreadcrumb(
  nodes: NavNode[],
  route: string,
): BreadcrumbItem[] {
  return findActiveTrailByRoute(nodes, route).map((node) => ({
    id: node.id,
    title: node.title,
    route: node.route,
  }))
}

export function getParentSubgroupIdsForRoute(
  nodes: NavNode[],
  route: string,
): string[] {
  return findActiveTrailByRoute(nodes, route)
    .filter((node) => node.kind === "subgroup")
    .map((node) => node.id)
}

export function findFirstMenuRoute(nodes: NavNode[]): string {
  return (
    flattenNavigation(nodes).find((node) => node.kind === "menu" && node.route)
      ?.route ?? "/"
  )
}

export function canAccessRoute(nodes: NavNode[], route: string) {
  if (alwaysAllowedReadinessRoutes.has(route)) {
    return true
  }

  for (const node of sortNodes(nodes)) {
    if (
      node.route === route
      || node.accessRoutes?.some((accessRoute) => matchesRoutePattern(accessRoute, route))
    ) {
      return true
    }

    if (node.children && canAccessRoute(node.children, route)) {
      return true
    }
  }

  return false
}
