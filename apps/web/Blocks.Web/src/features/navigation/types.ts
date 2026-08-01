import type { LucideIcon } from "lucide-react"

export type NavNodeKind = "group" | "subgroup" | "menu"
export type NavNodeOwner = "system" | "service" | "plugin"
export type NavNodeStatus = "active" | "draft" | "disabled"
export type NavCapability =
  | "view"
  | "create"
  | "update"
  | "delete"
  | "approve"
  | "analyze"

export type NavNode = {
  id: string
  title: string
  kind: NavNodeKind
  parentId?: string
  route?: string
  accessRoutes?: string[]
  owner: NavNodeOwner
  ownerKey: string
  icon?: LucideIcon
  sort: number
  capability?: NavCapability
  isVisible: boolean
  status: NavNodeStatus
  children?: NavNode[]
}

export type BreadcrumbItem = {
  id: string
  title: string
  route?: string
}
