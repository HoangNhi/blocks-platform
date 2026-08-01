export type SystemGroupRecord = {
  id: string
  name: string
  sort: number
  parentId: string | null
}

export type SystemMenuRecord = {
  id: string
  controller: string
  name: string
  systemGroupId: string
  sort: number
  canView: boolean
  canAdd: boolean
  canUpdate: boolean
  canDelete: boolean
  canApprove: boolean
  canAnalyze: boolean
  isShowMenu: boolean
  systemGroup?: string | null
}

export type SystemNavigationRecords = {
  groups: SystemGroupRecord[]
  menus: SystemMenuRecord[]
}
