import {
  Blocks,
  Bot,
  Database,

  LayoutGrid,
  ListTree,
  ScrollText,
  UserRound,
  UsersRound,
} from "lucide-react"

import type { LucideIcon } from "lucide-react"
import type { NavCapability } from "./types"

export type RouteCatalogEntry = {
  key: string
  route: string
  title: string
  ownerKey: string
  icon?: LucideIcon
  capability: NavCapability
  accessRoutes?: string[]
  aliases?: string[]
}

const routeCatalog: RouteCatalogEntry[] = [
  {
    key: "admin.registration",
    route: "/system/overview",
    title: "System Overview",
    ownerKey: "system-service",
    icon: Blocks,
    capability: "view",
    aliases: ["system overview", "tổng quan hệ thống", "tong quan he thong"],
  },
  {
    key: "workspace.home",
    route: "/system/hermes/overview",
    accessRoutes: ["/"],
    title: "Hermes Overview",
    ownerKey: "system-service",
    icon: Blocks,
    capability: "view",
    aliases: ["hermes overview", "tổng quan hermes", "tong quan hermes"],
  },
  {
    key: "admin.audit",
    route: "/system/audit-log",
    title: "Audit Log",
    ownerKey: "system-service",
    icon: ScrollText,
    capability: "view",
    aliases: ["audit log", "nhật ký", "nhat ky", "nhật ký hệ thống", "nhat ky he thong"],
  },
  {
    key: "admin.users",
    route: "/system/identity/users",
    title: "Users",
    ownerKey: "system-service",
    icon: UserRound,
    capability: "view",
    aliases: ["users", "user", "tài khoản", "tai khoan", "người dùng", "nguoi dung", "user management"],
  },
  {
    key: "admin.roles",
    route: "/system/identity/roles",
    title: "Roles",
    ownerKey: "system-service",
    icon: UsersRound,
    capability: "view",
    aliases: ["roles", "role", "vai trò", "vai tro", "role management"],
  },
  {
    key: "admin.plugins",
    route: "/system/identity/menus",
    title: "Menus",
    ownerKey: "system-service",
    icon: ListTree,
    capability: "view",
    aliases: ["menus", "menu", "quản lý menu", "quan ly menu"],
  },
  {
    key: "admin.permissions",
    route: "/system/identity/system-groups",
    title: "System Groups",
    ownerKey: "system-service",
    icon: LayoutGrid,
    capability: "view",
    aliases: ["systemgroup", "systemgroups", "system groups", "nhóm hệ thống", "nhom he thong"],
  },

  {
    key: "tradelab.strategies",
    route: "/plugins/tradelab",
    title: "Strategy Lab",
    ownerKey: "tradelab",
    icon: Bot,
    capability: "analyze",
    accessRoutes: ["/plugins/tradelab/datasets"],
    aliases: ["trade lab", "tradelab", "strategy lab", "chiến lược", "chien luoc"],
  },
  {
    key: "tradelab.datasets",
    route: "/plugins/tradelab/datasets",
    title: "Datasets",
    ownerKey: "tradelab",
    icon: Database,
    capability: "analyze",
    aliases: ["datasets", "dataset catalog", "dữ liệu", "du lieu"],
  },
  {
    key: "ai-video.projects",
    route: "/plugins/ai-video",
    title: "AI Video Production",
    ownerKey: "ai-video-production",
    icon: Bot,
    capability: "view",
    accessRoutes: ["/plugins/ai-video/runs/:runId"],
    aliases: ["ai video", "ai video production", "video production", "ai-video"],
  },
]

export function normalizeRouteCatalogKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase()
}

function getRouteCatalogCandidates(entry: RouteCatalogEntry) {
  return [entry.key, entry.route, entry.title, ...(entry.aliases ?? [])].map(
    normalizeRouteCatalogKey,
  )
}

export function getRouteCatalogEntry(value: string) {
  const normalizedValue = normalizeRouteCatalogKey(value)
  return routeCatalog.find((entry) =>
    getRouteCatalogCandidates(entry).includes(normalizedValue),
  ) ?? null
}

export function getRouteCatalogEntries() {
  return routeCatalog
}

export function getRouteCatalogEntryForMenu(
  permissionKey: string | null | undefined,
  controller: string,
  name: string,
) {
  return (
    getRouteCatalogEntry(permissionKey ?? "") ??
    getRouteCatalogEntry(controller) ??
    getRouteCatalogEntry(name) ??
    null
  )
}
