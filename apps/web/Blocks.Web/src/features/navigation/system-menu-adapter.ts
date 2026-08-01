import type { NavNode } from "./types"
import {
  getRouteCatalogEntry,
  getRouteCatalogEntryForMenu,
  normalizeRouteCatalogKey,
} from "./route-catalog"
import type {
  SystemGroupRecord,
  SystemMenuRecord,
  SystemNavigationRecords,
} from "./system-menu-types"

type SystemApiRecord = Record<string, unknown>

function pickApiValue<T>(
  record: SystemApiRecord,
  camelKey: string,
  pascalKey: string,
) {
  if (Object.prototype.hasOwnProperty.call(record, camelKey)) {
    return record[camelKey] as T
  }

  return record[pascalKey] as T
}

function pickApiNumber(
  record: SystemApiRecord,
  camelKey: string,
  pascalKey: string,
) {
  const value = pickApiValue<number | string | undefined>(
    record,
    camelKey,
    pascalKey,
  )

  return typeof value === "number" ? value : Number(value ?? 0)
}

function normalizeGroupRecord(group: SystemGroupRecord): SystemGroupRecord {
  const record = group as unknown as SystemApiRecord

  return {
    id: pickApiValue<string>(record, "id", "Id"),
    name: pickApiValue<string>(record, "name", "Name"),
    sort: pickApiNumber(record, "sort", "Sort"),
    parentId:
      pickApiValue<string | null | undefined>(record, "parentId", "ParentId") ??
      null,
  }
}

function normalizeMenuRecord(menu: SystemMenuRecord): SystemMenuRecord {
  const record = menu as unknown as SystemApiRecord

  return {
    id: pickApiValue<string>(record, "id", "Id"),
    controller: pickApiValue<string>(record, "controller", "Controller"),
    name: pickApiValue<string>(record, "name", "Name"),
    systemGroupId: pickApiValue<string>(
      record,
      "systemGroupId",
      "SystemGroupId",
    ),
    sort: pickApiNumber(record, "sort", "Sort"),
    canView: pickApiValue<boolean>(record, "canView", "CanView"),
    canAdd: pickApiValue<boolean>(record, "canAdd", "CanAdd"),
    canUpdate: pickApiValue<boolean>(record, "canUpdate", "CanUpdate"),
    canDelete: pickApiValue<boolean>(record, "canDelete", "CanDelete"),
    canApprove: pickApiValue<boolean>(record, "canApprove", "CanApprove"),
    canAnalyze: pickApiValue<boolean>(record, "canAnalyze", "CanAnalyze"),
    isShowMenu: pickApiValue<boolean>(record, "isShowMenu", "IsShowMenu"),
    systemGroup: pickApiValue<string | null | undefined>(
      record,
      "systemGroup",
      "SystemGroup",
    ),
  }
}

function sortGroups(groups: SystemGroupRecord[]) {
  return [...groups].sort((a, b) => a.sort - b.sort)
}

function sortMenus(menus: SystemMenuRecord[]) {
  return [...menus].sort((a, b) => a.sort - b.sort)
}

function sortNodes(nodes: NavNode[]) {
  return [...nodes].sort((a, b) => a.sort - b.sort)
}

function getOwnerKeyForGroup(name: string, parentOwnerKey?: string) {
  const normalizedName = normalizeRouteCatalogKey(name)

  if (normalizedName.includes("tradelab")) return "tradelab"
  if (normalizedName.includes("plugin")) return "plugin-runtime"
  if (normalizedName.includes("file")) return "file-service"
  if (
    normalizedName.includes("system") ||
    normalizedName.includes("identity") ||
    normalizedName.includes("hethong") ||
    normalizedName.includes("dinhdanh")
  ) {
    return "system-service"
  }
  if (normalizedName.includes("overview") || normalizedName.includes("workspace")) {
    return "blocks-web"
  }

  return parentOwnerKey ?? "blocks"
}

function getOwnerFromOwnerKey(ownerKey: string): NavNode["owner"] {
  if (ownerKey === "file-service") return "service"
  if (
    ownerKey === "tradelab" ||
    ownerKey === "plugin-runtime" ||
    ownerKey === "ai-video-production"
  ) return "plugin"
  if (ownerKey.includes("plugin")) return "plugin"
  return "system"
}

function getCapability(menu: SystemMenuRecord) {
  if (menu.canAnalyze) return "analyze"
  if (menu.canApprove) return "approve"
  if (menu.canDelete) return "delete"
  if (menu.canUpdate) return "update"
  if (menu.canAdd) return "create"
  return "view"
}

function canReachMenu(menu: SystemMenuRecord) {
  return (
    menu.canView ||
    menu.canAnalyze ||
    menu.canApprove ||
    menu.canDelete ||
    menu.canUpdate ||
    menu.canAdd
  )
}

function buildPresentationSubgroup({
  id,
  title,
  parentId,
  ownerKey,
  sort,
  children,
}: {
  id: string
  title: string
  parentId: string
  ownerKey: string
  sort: number
  children: NavNode[]
}): NavNode {
  return {
    id,
    title,
    kind: "subgroup",
    parentId,
    route: undefined,
    owner: getOwnerFromOwnerKey(ownerKey),
    ownerKey,
    sort,
    isVisible: children.some((child) => child.isVisible),
    status: "active",
    children: sortNodes(children),
  }
}

function buildSyntheticMenuNode({
  id,
  parentId,
  route,
  sort,
}: {
  id: string
  parentId: string
  route: string
  sort: number
}): NavNode | null {
  const routeEntry = getRouteCatalogEntry(route)
  if (!routeEntry) return null

  return {
    id,
    title: routeEntry.title,
    kind: "menu",
    parentId,
    route: routeEntry.route,
    accessRoutes: routeEntry.accessRoutes,
    owner: getOwnerFromOwnerKey(routeEntry.ownerKey),
    ownerKey: routeEntry.ownerKey,
    icon: routeEntry.icon,
    sort,
    capability: routeEntry.capability,
    isVisible: true,
    status: "active",
  }
}

function ensureTradeLabDatasetLeaf(parentGroup: SystemGroupRecord, menus: NavNode[]) {
  const datasetRoute = "/plugins/tradelab/datasets"
  const hasDatasetLeaf = menus.some((menu) => menu.route === datasetRoute)
  const canAccessDataset = menus.some(
    (menu) =>
      menu.route === "/plugins/tradelab" ||
      Boolean(menu.accessRoutes?.includes(datasetRoute)),
  )

  if (hasDatasetLeaf || !canAccessDataset) {
    return sortNodes(menus)
  }

  const datasetLeaf = buildSyntheticMenuNode({
    id: `${parentGroup.id}:tradelab-datasets`,
    parentId: parentGroup.id,
    route: datasetRoute,
    sort: Math.max(...menus.map((menu) => menu.sort), 0) + 10,
  })

  return sortNodes(datasetLeaf ? [...menus, datasetLeaf] : menus)
}

function buildAiVideoProductionBranch(parentGroup: SystemGroupRecord) {
  const operationsLeaf = buildSyntheticMenuNode({
    id: `${parentGroup.id}:ai-video-operations`,
    parentId: `${parentGroup.id}:ai-video-production`,
    route: "/plugins/ai-video",
    sort: 10,
  })

  if (!operationsLeaf) return null

  return buildPresentationSubgroup({
    id: `${parentGroup.id}:ai-video-production`,
    title: "AI Video Production",
    parentId: parentGroup.id,
    ownerKey: "ai-video-production",
    sort: 30,
    children: [{ ...operationsLeaf, title: "Operations" }],
  })
}

function ensureAiVideoProductionBranch(parentGroup: SystemGroupRecord, nodes: NavNode[]) {
  if (nodes.some((node) => node.ownerKey === "ai-video-production" || node.route?.startsWith("/plugins/ai-video"))) {
    return sortNodes(nodes)
  }

  const aiVideoBranch = buildAiVideoProductionBranch(parentGroup)
  return sortNodes(aiVideoBranch ? [...nodes, aiVideoBranch] : nodes)
}

function groupSystemDirectMenus(parentGroup: SystemGroupRecord, menus: NavNode[]) {
  const identityMenus: NavNode[] = []
  const operationsMenus: NavNode[] = []
  const remainingMenus: NavNode[] = []

  for (const menu of menus) {
    if (menu.route?.startsWith("/system/identity/")) {
      identityMenus.push(menu)
    } else if (
      menu.route === "/system/overview" ||
      menu.route === "/system/audit-log" ||
      menu.route === "/system/hermes/overview"
    ) {
      operationsMenus.push(menu)
    } else {
      remainingMenus.push(menu)
    }
  }

  const groupedMenus: NavNode[] = []

  if (identityMenus.length > 0) {
    groupedMenus.push(
      buildPresentationSubgroup({
        id: `${parentGroup.id}:identity-admin`,
        title: "Quản trị định danh",
        parentId: parentGroup.id,
        ownerKey: "system-service",
        sort: 10,
        children: identityMenus,
      }),
    )
  }

  if (operationsMenus.length > 0) {
    groupedMenus.push(
      buildPresentationSubgroup({
        id: `${parentGroup.id}:system-operations`,
        title: "Vận hành hệ thống",
        parentId: parentGroup.id,
        ownerKey: "system-service",
        sort: 20,
        children: operationsMenus,
      }),
    )
  }

  return sortNodes([...groupedMenus, ...remainingMenus])
}

function groupPluginDirectMenus(parentGroup: SystemGroupRecord, menus: NavNode[]) {
  const tradeLabMenus: NavNode[] = []
  const remainingMenus: NavNode[] = []

  for (const menu of menus) {
    if (menu.ownerKey === "tradelab" || menu.route?.startsWith("/plugins/tradelab")) {
      tradeLabMenus.push(menu)
    } else {
      remainingMenus.push(menu)
    }
  }

  if (tradeLabMenus.length === 0) {
    return sortNodes(remainingMenus)
  }

  return sortNodes([
    buildPresentationSubgroup({
      id: `${parentGroup.id}:tradelab`,
      title: "TradeLab",
      parentId: parentGroup.id,
      ownerKey: "tradelab",
      sort: Math.min(...tradeLabMenus.map((menu) => menu.sort), 10),
      children: ensureTradeLabDatasetLeaf(parentGroup, tradeLabMenus),
    }),
    ...remainingMenus,
  ])
}

function applyPresentationGrouping({
  group,
  ownerKey,
  childGroups,
  childMenus,
  depth,
}: {
  group: SystemGroupRecord
  ownerKey: string
  childGroups: NavNode[]
  childMenus: NavNode[]
  depth: number
}) {
  if (childMenus.length === 0) {
    if (ownerKey === "plugin-runtime" && depth === 0) {
      return ensureAiVideoProductionBranch(group, childGroups)
    }

    return sortNodes(childGroups)
  }

  if (ownerKey === "tradelab") {
    return sortNodes([
      ...childGroups,
      ...ensureTradeLabDatasetLeaf(group, childMenus),
    ])
  }

  if (depth !== 0) {
    return sortNodes([...childGroups, ...childMenus])
  }

  if (ownerKey === "system-service") {
    return sortNodes([...childGroups, ...groupSystemDirectMenus(group, childMenus)])
  }

  if (ownerKey === "plugin-runtime") {
    return ensureAiVideoProductionBranch(group, [
      ...childGroups,
      ...groupPluginDirectMenus(group, childMenus),
    ])
  }

  return sortNodes([...childGroups, ...childMenus])
}

function buildGroupNode(
  group: SystemGroupRecord,
  groupByParentId: Map<string | null, SystemGroupRecord[]>,
  menusByGroupId: Map<string, SystemMenuRecord[]>,
  depth: number,
  parentOwnerKey?: string,
  parentId?: string,
): NavNode {
  const ownerKey = getOwnerKeyForGroup(group.name, parentOwnerKey)
  const childGroups = sortGroups(groupByParentId.get(group.id) ?? []).map((child) =>
    buildGroupNode(
      child,
      groupByParentId,
      menusByGroupId,
      depth + 1,
      ownerKey,
      group.id,
    ),
  )
  const childMenus = sortMenus(menusByGroupId.get(group.id) ?? [])
    .map<NavNode | null>((menu) => {
      const routeEntry = getRouteCatalogEntryForMenu(menu.controller, menu.name)
      if (!routeEntry) {
        return null
      }

      return {
        id: menu.id,
        title: routeEntry.title ?? menu.name,
        kind: "menu",
        parentId: group.id,
        route: routeEntry.route,
        accessRoutes: routeEntry.accessRoutes,
        owner: getOwnerFromOwnerKey(routeEntry.ownerKey),
        ownerKey: routeEntry.ownerKey,
        icon: routeEntry.icon,
        sort: menu.sort,
        capability: getCapability(menu),
        isVisible: menu.isShowMenu || canReachMenu(menu),
        status: "active",
      }
    })
    .filter((menu): menu is NavNode => menu !== null)

  const children = applyPresentationGrouping({
    group,
    ownerKey,
    childGroups,
    childMenus,
    depth,
  })

  return {
    id: group.id,
    title: group.name,
    kind: depth === 0 ? "group" : "subgroup",
    parentId,
    route: undefined,
    owner: getOwnerFromOwnerKey(ownerKey),
    ownerKey,
    sort: group.sort,
    isVisible: true,
    status: "active",
    children,
  }
}

export function adaptSystemNavigation({
  groups,
  menus,
}: SystemNavigationRecords): NavNode[] {
  const normalizedGroups = groups.map(normalizeGroupRecord)
  const normalizedMenus = menus.map(normalizeMenuRecord)
  const groupByParentId = new Map<string | null, SystemGroupRecord[]>()
  for (const group of normalizedGroups) {
    const siblings = groupByParentId.get(group.parentId) ?? []
    siblings.push(group)
    groupByParentId.set(group.parentId, siblings)
  }

  const menusByGroupId = new Map<string, SystemMenuRecord[]>()
  for (const menu of normalizedMenus) {
    const siblings = menusByGroupId.get(menu.systemGroupId) ?? []
    siblings.push(menu)
    menusByGroupId.set(menu.systemGroupId, siblings)
  }

  return sortGroups(groupByParentId.get(null) ?? []).map((rootGroup) =>
    buildGroupNode(rootGroup, groupByParentId, menusByGroupId, 0),
  )
}
