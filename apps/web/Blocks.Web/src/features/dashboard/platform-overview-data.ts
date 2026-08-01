import {
  AlertTriangle,
  Database,
  KeyRound,
  PlugZap,
  Server,
  ShieldCheck,
} from "lucide-react"

export const platformStats = [
  {
    label: "Service uptime",
    value: "99.8%",
    helper: "System and File services responding",
    tone: "success" as const,
    icon: Server,
  },
  {
    label: "Security posture",
    value: "Good",
    helper: "2 roles need review",
    tone: "primary" as const,
    icon: ShieldCheck,
  },
  {
    label: "Storage capacity",
    value: "62%",
    helper: "248 files, 3 providers",
    tone: "info" as const,
    icon: Database,
  },
  {
    label: "Plugin risk",
    value: "Draft",
    helper: "Registry contract not connected",
    tone: "warning" as const,
    icon: PlugZap,
  },
]

export const platformHealthRows = [
  {
    id: "system-service",
    label: "System Service",
    description: "Auth, users, roles, menus, audit",
    badge: "S",
    tone: "primary" as const,
    status: "Online",
    statusTone: "success" as const,
  },
  {
    id: "file-service",
    label: "File Service",
    description: "Storage, upload, retrieval, avatars",
    badge: "F",
    tone: "info" as const,
    status: "Online",
    statusTone: "success" as const,
  },
  {
    id: "plugin-runtime",
    label: "Plugin Runtime",
    description: "Readiness-only until registry contracts exist",
    badge: "P",
    tone: "plugin" as const,
    status: "Draft",
    statusTone: "warning" as const,
  },
]

export const adminAttentionRows = [
  {
    id: "permission-coverage",
    label: "Permission coverage",
    description: "Roles mapped to menu capabilities",
    value: "82%",
    progress: 82,
    tone: "primary" as const,
  },
  {
    id: "orphaned-navigation",
    label: "Orphaned navigation",
    description: "Menus without active parent or route target",
    value: "2",
    progress: 18,
    tone: "warning" as const,
  },
  {
    id: "storage-pressure",
    label: "Storage pressure",
    description: "Capacity and provider checks",
    value: "OK",
    progress: 62,
    tone: "info" as const,
  },
]

export const adminQuickActions = [
  {
    title: "Review roles",
    description: "Audit role permission coverage.",
    route: "/system/identity/roles",
    icon: KeyRound,
  },
  {
    title: "Manage menus",
    description: "Fix groups, subgroups and routes.",
    route: "/system/identity/menus",
    icon: AlertTriangle,
  },
  {
    title: "Check storage",
    description: "Inspect providers and capacity.",
    route: "/services/files/storage-providers",
    icon: Database,
  },
  {
    title: "Plugin readiness",
    description: "Review routes that still depend on future runtime contracts.",
    route: "/plugins/installed",
    icon: PlugZap,
  },
]

export const recentPlatformActivity = [
  {
    id: "role-permissions",
    title: "Role permissions updated",
    area: "Identity / Roles",
    time: "12m ago",
    tone: "primary" as const,
  },
  {
    id: "file-provider",
    title: "File provider health checked",
    area: "File Service / Storage Providers",
    time: "34m ago",
    tone: "info" as const,
  },
  {
    id: "plugin-draft",
    title: "Plugin routes remain in readiness mode",
    area: "Plugins / Readiness",
    time: "Current scope",
    tone: "plugin" as const,
  },
]
