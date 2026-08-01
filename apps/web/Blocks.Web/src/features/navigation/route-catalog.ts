import {
  Activity,
  Blocks,
  Bot,
  Database,
  FileArchive,
  LayoutGrid,
  ListTree,
  LockKeyhole,
  ScrollText,
  Settings,
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
    key: "systemoverview",
    route: "/system/overview",
    title: "System Overview",
    ownerKey: "system-service",
    icon: Blocks,
    capability: "view",
    aliases: ["system overview", "tổng quan hệ thống", "tong quan he thong"],
  },
  {
    key: "hermes",
    route: "/system/hermes/overview",
    title: "Hermes Overview",
    ownerKey: "system-service",
    icon: Blocks,
    capability: "view",
    aliases: ["hermes overview", "tổng quan hermes", "tong quan hermes"],
  },
  {
    key: "auditlog",
    route: "/system/audit-log",
    title: "Audit Log",
    ownerKey: "system-service",
    icon: ScrollText,
    capability: "view",
    aliases: ["audit log", "nhật ký", "nhat ky", "nhật ký hệ thống", "nhat ky he thong"],
  },
  {
    key: "user",
    route: "/system/identity/users",
    title: "Users",
    ownerKey: "system-service",
    icon: UserRound,
    capability: "view",
    aliases: ["users", "user", "tài khoản", "tai khoan", "người dùng", "nguoi dung", "user management"],
  },
  {
    key: "role",
    route: "/system/identity/roles",
    title: "Roles",
    ownerKey: "system-service",
    icon: UsersRound,
    capability: "view",
    accessRoutes: ["/system/identity/permissions"],
    aliases: ["roles", "role", "vai trò", "vai tro", "role management"],
  },
  {
    key: "menu",
    route: "/system/identity/menus",
    title: "Menus",
    ownerKey: "system-service",
    icon: ListTree,
    capability: "view",
    aliases: ["menus", "menu", "quản lý menu", "quan ly menu"],
  },
  {
    key: "systemgroup",
    route: "/system/identity/system-groups",
    title: "System Groups",
    ownerKey: "system-service",
    icon: LayoutGrid,
    capability: "view",
    aliases: ["systemgroup", "systemgroups", "system groups", "nhóm hệ thống", "nhom he thong"],
  },
  {
    key: "permissionmatrix",
    route: "/system/identity/permissions",
    title: "Permission Matrix",
    ownerKey: "system-service",
    icon: LockKeyhole,
    capability: "view",
    aliases: ["permissionmatrix", "permission matrix", "phân quyền", "phan quyen", "quyền", "quyen"],
  },
  {
    key: "filelibrary",
    route: "/services/files/library",
    title: "Library",
    ownerKey: "file-service",
    icon: FileArchive,
    capability: "view",
    aliases: ["file library", "library", "thư viện", "thu vien"],
  },
  {
    key: "storageproviders",
    route: "/services/files/storage-providers",
    title: "Storage Providers",
    ownerKey: "file-service",
    icon: Settings,
    capability: "view",
    aliases: ["storage providers", "storage", "nhà cung cấp lưu trữ", "nha cung cap luu tru"],
  },
  {
    key: "installedplugins",
    route: "/plugins/installed",
    title: "Installed Plugins",
    ownerKey: "plugin-runtime",
    icon: LayoutGrid,
    capability: "view",
    aliases: ["installed plugins", "plugins", "plugin đã cài", "plugin da cai"],
  },
  {
    key: "pluginactivity",
    route: "/plugins/activity",
    title: "Plugin Activity",
    ownerKey: "plugin-runtime",
    icon: Activity,
    capability: "view",
    aliases: ["plugin activity", "activity", "hoạt động plugin", "hoat dong plugin"],
  },
  {
    key: "pluginmanifests",
    route: "/plugins/manifests",
    title: "Manifests",
    ownerKey: "plugin-runtime",
    icon: ScrollText,
    capability: "view",
    aliases: ["plugin manifests", "manifests", "manifest"],
  },
  {
    key: "tradelab",
    route: "/plugins/tradelab",
    title: "Strategy Lab",
    ownerKey: "tradelab",
    icon: Bot,
    capability: "analyze",
    accessRoutes: ["/plugins/tradelab/datasets"],
    aliases: ["trade lab", "tradelab", "strategy lab", "chiến lược", "chien luoc"],
  },
  {
    key: "tradelabdatasets",
    route: "/plugins/tradelab/datasets",
    title: "Datasets",
    ownerKey: "tradelab",
    icon: Database,
    capability: "analyze",
    aliases: ["datasets", "dataset catalog", "dữ liệu", "du lieu"],
  },
  {
    key: "aivideoproduction",
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

export function getRouteCatalogEntryForMenu(controller: string, name: string) {
  return (
    getRouteCatalogEntry(controller) ??
    getRouteCatalogEntry(name) ??
    null
  )
}