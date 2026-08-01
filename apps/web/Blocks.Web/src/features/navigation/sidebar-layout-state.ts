export type SidebarLayoutMode = "expanded" | "collapsed"

export function getSidebarLayoutStorageKey(userId: string) {
  return `blocks.sidebar.layoutMode.${userId}`
}

export function parseSidebarLayoutMode(
  rawValue: string | null,
): SidebarLayoutMode {
  if (rawValue === "collapsed" || rawValue === JSON.stringify("collapsed")) {
    return "collapsed"
  }

  return "expanded"
}

export function toggleSidebarLayoutMode(
  mode: SidebarLayoutMode,
): SidebarLayoutMode {
  return mode === "expanded" ? "collapsed" : "expanded"
}
