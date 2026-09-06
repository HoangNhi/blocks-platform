import { MoreHorizontal, Plus, ShieldCheck, Trash2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  RoleFormDialog,
  type RoleDialogTab,
  type RoleFormErrors,
  type RoleFormValues,
} from "@/features/admin/components/role-form-dialog"
import { DataTable, type DataTableColumn } from "@/components/data-table/data-table"
import { DataTableToolbar } from "@/components/data-table/data-table-toolbar"
import {
  applyRoleFilters,
  applyTextSearch,
  changePage,
  changePageSize,
  createDefaultRolePagingRequest,
  resetRoleFilters,
} from "@/features/admin/system-list-state"
import {
  canUseSaveAndAddMore,
  closeDialogState,
  openCreateDialog,
  openEditDialog,
  type EntityDialogSubmitIntent,
} from "@/features/admin/entity-dialog-state"
import { WORKSPACE_DIRTY_EVENT } from "@/features/navigation/workspace-tabs"
import { createBrowserTokenStore } from "@/features/auth/token-store"
import { ApiError } from "@/lib/api/api-error"
import { createApiClient } from "@/lib/api/client"

import { clonePermissionGroups, diffPermissionGroups, type RolePermissionKey } from "../role-permission-state"
import { createSystemAdminApi } from "../system-admin-api"
import type { PermissionGroupModel, RoleDetailModel, RoleModel, RolePagingRequest } from "../types"

const tokenStore = createBrowserTokenStore()
const adminApi = createSystemAdminApi(
  createApiClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? "/",
    getAccessToken: tokenStore.getAccessToken,
  }),
)

const roleDateFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "medium",
  timeStyle: "short",
})
const rolesRoute = "/system/identity/roles"

type PermissionLoadStatus = "idle" | "loading" | "ready" | "error"
type RoleDetailLoadStatus = "idle" | "loading" | "ready" | "error"
type RoleFilterKey = "isActived" | "isSystem" | "isRegistrationEligible"

function createEmptyRoleForm(): RoleFormValues {
  return {
    id: crypto.randomUUID(),
    name: "",
    key: "",
    isRegistrationEligible: false,
    folderUpload: crypto.randomUUID(),
    isActived: true,
    isEdit: false,
    sort: 0,
  }
}

function createRoleFormFromDetail(detail: RoleDetailModel): RoleFormValues {
  return {
    id: detail.id,
    name: detail.name,
    key: detail.key ?? "",
    isRegistrationEligible: detail.isRegistrationEligible ?? false,
    folderUpload: detail.folderUpload || crypto.randomUUID(),
    isActived: detail.isActived ?? true,
    isEdit: true,
    sort: detail.sort ?? 0,
  }
}

function createRoleFormFromModel(role: RoleModel): RoleFormValues {
  return {
    id: role.id,
    name: role.name,
    key: role.key ?? "",
    isRegistrationEligible: role.isRegistrationEligible ?? false,
    folderUpload: crypto.randomUUID(),
    isActived: role.isActived ?? true,
    isEdit: true,
    sort: role.sort ?? 0,
  }
}

function validateRoleForm(form: RoleFormValues): RoleFormErrors {
  const errors: RoleFormErrors = {}
  if (!form.name.trim()) errors.name = "Tên vai trò không được để trống."
  if (!form.key.trim()) errors.key = "Mã vai trò không được để trống."
  return errors
}

function formatRoleDate(value?: string | null) {
  if (!value) return "—"
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? "—" : roleDateFormatter.format(date)
}

function filterValue(value: boolean | undefined) {
  return value === undefined ? "all" : value ? "true" : "false"
}

function parseFilterValue(value: string) {
  return value === "all" ? undefined : value === "true"
}

function isMetadataChanged(current: RoleFormValues, baseline: RoleFormValues | null) {
  if (!baseline) return false
  return (
    current.name.trim() !== baseline.name.trim()
    || current.key.trim() !== baseline.key.trim()
    || current.isRegistrationEligible !== baseline.isRegistrationEligible
    || current.isActived !== baseline.isActived
  )
}

function getPermissionErrorMessage(value: unknown) {
  if (value instanceof ApiError && value.isForbidden) {
    return "Bạn không có quyền quản lý phân quyền vai trò."
  }
  return value instanceof Error ? value.message : "Không thể tải hoặc lưu phân quyền vai trò."
}

function getListErrorMessage(value: unknown) {
  return value instanceof Error ? value.message : "Không tải được danh sách vai trò."
}

export function RolesPage() {
  const [items, setItems] = useState<RoleModel[]>([])
  const [totalRow, setTotalRow] = useState(0)
  const [request, setRequest] = useState<RolePagingRequest>(createDefaultRolePagingRequest(20))
  const [searchTerm, setSearchTerm] = useState("")
  const [filtersOpen, setFiltersOpen] = useState(true)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogState, setDialogState] = useState(closeDialogState())
  const [dialogInitialTab, setDialogInitialTab] = useState<RoleDialogTab>("details")
  const [roleMetadata, setRoleMetadata] = useState<RoleModel | undefined>()
  const [roleDetailStatus, setRoleDetailStatus] = useState<RoleDetailLoadStatus>("idle")
  const [roleDetailError, setRoleDetailError] = useState<string | null>(null)
  const [roleForm, setRoleForm] = useState<RoleFormValues>(createEmptyRoleForm())
  const [metadataBaseline, setMetadataBaseline] = useState<RoleFormValues | null>(null)
  const [formErrors, setFormErrors] = useState<RoleFormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [permissionGroups, setPermissionGroups] = useState<PermissionGroupModel[]>([])
  const [baselinePermissionGroups, setBaselinePermissionGroups] = useState<PermissionGroupModel[]>([])
  const [permissionStatus, setPermissionStatus] = useState<PermissionLoadStatus>("idle")
  const [permissionError, setPermissionError] = useState<string | null>(null)
  const [isBulkDeleteDialogOpen, setIsBulkDeleteDialogOpen] = useState(false)
  const [bulkDeleteError, setBulkDeleteError] = useState<string | null>(null)
  const [isDeletingRoles, setIsDeletingRoles] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<RoleModel | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [isDeletingRole, setIsDeletingRole] = useState(false)
  const [isDiscardDialogOpen, setIsDiscardDialogOpen] = useState(false)
  const dialogSessionRef = useRef(0)
  const dialogRoleIdRef = useRef<string | null>(null)
  const listRequestRef = useRef(0)

  const metadataDirty = dialogState.mode === "edit" && isMetadataChanged(roleForm, metadataBaseline)
  const permissionDiff = useMemo(
    () => diffPermissionGroups(permissionGroups, baselinePermissionGroups),
    [baselinePermissionGroups, permissionGroups],
  )
  const permissionsDirty = permissionDiff.changedCellCount > 0
  const hasUnsavedChanges = metadataDirty || permissionsDirty
  const activeFilterCount = [request.isActived, request.isSystem, request.isRegistrationEligible].filter(
    (value) => value !== undefined,
  ).length

  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent(WORKSPACE_DIRTY_EVENT, {
          detail: { route: rolesRoute, isDirty: hasUnsavedChanges },
        }),
      )
    }, 0)

    return () => window.clearTimeout(timer)
  }, [hasUnsavedChanges])

  useEffect(() => () => {
    window.dispatchEvent(
      new CustomEvent(WORKSPACE_DIRTY_EVENT, {
        detail: { route: rolesRoute, isDirty: false },
      }),
    )
  }, [])

  const columns = useMemo<DataTableColumn<RoleModel>[]>(
    () => [
      {
        key: "role",
        header: "Vai trò",
        cell: (item) => (
          <div className="min-w-[240px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">{item.name}</span>
              <Badge variant={item.isSystem || item.isProtected ? "secondary" : "outline"}>
                {item.isSystem || item.isProtected ? "Hệ thống" : "Tùy chỉnh"}
              </Badge>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{item.key || "—"}</div>
          </div>
        ),
      },
      {
        key: "registration",
        header: "Đăng ký",
        cell: (item) => (
          <Badge variant={item.isRegistrationEligible ? "secondary" : "outline"}>
            {item.isRegistrationEligible ? "Được phép" : "Không được phép"}
          </Badge>
        ),
      },
      {
        key: "createdAt",
        header: "Ngày tạo",
        cell: (item) => formatRoleDate(item.createdAt),
      },
      {
        key: "updatedAt",
        header: "Ngày cập nhật",
        cell: (item) => formatRoleDate(item.updatedAt),
      },
      {
        key: "status",
        header: "Trạng thái",
        cell: (item) => (
          <Badge
            variant={item.isActived === false ? "outline" : "secondary"}
            className={
              item.isActived === false
                ? "text-muted-foreground"
                : "bg-emerald-50 text-emerald-700 hover:bg-emerald-50"
            }
          >
            {item.isActived === false ? "Không hoạt động" : "Hoạt động"}
          </Badge>
        ),
      },
    ],
    [],
  )

  const loadRoles = useCallback((nextRequest: RolePagingRequest) => adminApi.getRoles(nextRequest), [])

  useEffect(() => {
    const requestId = ++listRequestRef.current
    let active = true
    void loadRoles(request)
      .then((result) => {
        if (!active || requestId !== listRequestRef.current) return
        setItems(result.data)
        setTotalRow(result.totalRow)
        setError(null)
      })
      .catch((loadError: unknown) => {
        if (!active || requestId !== listRequestRef.current) return
        setError(getListErrorMessage(loadError))
      })
      .finally(() => {
        if (active && requestId === listRequestRef.current) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [loadRoles, request])

  useEffect(() => () => {
    listRequestRef.current += 1
  }, [])

  useEffect(() => {
    const nextSearch = searchTerm.trim()
    if (nextSearch === (request.textSearch ?? "")) return

    const timeout = window.setTimeout(() => {
      setError(null)
      setIsLoading(true)
      setSelectedIds([])
      setRequest((current) => applyTextSearch(current, searchTerm))
    }, 300)

    return () => window.clearTimeout(timeout)
  }, [request.textSearch, searchTerm])

  async function refreshRoles(nextRequest = request) {
    const requestId = ++listRequestRef.current
    setIsLoading(true)

    try {
      const result = await loadRoles(nextRequest)
      if (requestId === listRequestRef.current) {
        setItems(result.data)
        setTotalRow(result.totalRow)
        setError(null)
      }
      return result
    } catch (refreshError) {
      if (requestId === listRequestRef.current) {
        setError(getListErrorMessage(refreshError))
      }
      throw refreshError
    } finally {
      if (requestId === listRequestRef.current) setIsLoading(false)
    }
  }

  function startListChange(update: (current: RolePagingRequest) => RolePagingRequest) {
    setError(null)
    setIsLoading(true)
    setSelectedIds([])
    setRequest(update)
  }

  function resetPermissionState() {
    setPermissionGroups([])
    setBaselinePermissionGroups([])
    setPermissionStatus("idle")
    setPermissionError(null)
  }

  function resetDialogState() {
    dialogSessionRef.current += 1
    dialogRoleIdRef.current = null
    setDialogState(closeDialogState())
    setDialogInitialTab("details")
    setRoleMetadata(undefined)
    setRoleDetailStatus("idle")
    setRoleDetailError(null)
    setRoleForm(createEmptyRoleForm())
    setMetadataBaseline(null)
    setFormErrors({})
    setIsSubmitting(false)
    resetPermissionState()
  }

  function closeRoleDialog(force = false) {
    if (isSubmitting && !force) return
    if (!force && hasUnsavedChanges) {
      setIsDiscardDialogOpen(true)
      return
    }
    resetDialogState()
  }

  function discardRoleDialogChanges() {
    if (isSubmitting) return
    setIsDiscardDialogOpen(false)
    resetDialogState()
  }

  function openCreateRoleDialog() {
    setError(null)
    dialogSessionRef.current += 1
    dialogRoleIdRef.current = null
    setRoleMetadata(undefined)
    setRoleDetailStatus("ready")
    setRoleDetailError(null)
    setRoleForm(createEmptyRoleForm())
    setMetadataBaseline(null)
    setFormErrors({})
    resetPermissionState()
    setDialogInitialTab("details")
    setDialogState(openCreateDialog())
  }

  async function loadRoleDetail(id: string, session: number) {
    if (session !== dialogSessionRef.current || dialogRoleIdRef.current !== id) return

    setRoleDetailStatus("loading")
    setRoleDetailError(null)

    try {
      const detail = await adminApi.getRoleById(id)
      if (session !== dialogSessionRef.current || dialogRoleIdRef.current !== id) return

      const metadata = { ...(items.find((item) => item.id === id) ?? {}), ...detail } as RoleModel
      const nextForm = createRoleFormFromDetail(detail)
      setRoleMetadata(metadata)
      setRoleForm(nextForm)
      setMetadataBaseline({ ...nextForm })
      setRoleDetailStatus("ready")
    } catch (loadError: unknown) {
      if (session !== dialogSessionRef.current || dialogRoleIdRef.current !== id) return
      setRoleDetailStatus("error")
      setRoleDetailError(getListErrorMessage(loadError))
    }
  }

  function openEditRoleDialog(id: string, initialTab: RoleDialogTab = "details") {
    const session = dialogSessionRef.current + 1
    dialogSessionRef.current = session
    dialogRoleIdRef.current = id
    setError(null)
    setFormErrors({})
    const listRole = items.find((item) => item.id === id)
    setRoleMetadata(listRole)
    setRoleForm(listRole ? createRoleFormFromModel(listRole) : { ...createEmptyRoleForm(), id, isEdit: true })
    setMetadataBaseline(null)
    setRoleDetailStatus("loading")
    setRoleDetailError(null)
    setDialogInitialTab(initialTab)
    resetPermissionState()
    setDialogState(openEditDialog(id))

    void loadRoleDetail(id, session)
    if (initialTab === "permissions") void loadPermissions(id, session)
  }

  function retryRoleDetail() {
    const id = dialogRoleIdRef.current
    if (!id || dialogState.mode !== "edit") return
    void loadRoleDetail(id, dialogSessionRef.current)
  }

  async function loadPermissions(roleId: string | null, session: number) {
    if (!roleId || session !== dialogSessionRef.current || dialogRoleIdRef.current !== roleId) return

    setPermissionStatus("loading")
    setPermissionError(null)

    try {
      const permissions = await adminApi.getPermissionsByRole(roleId)
      if (session !== dialogSessionRef.current || dialogRoleIdRef.current !== roleId) return

      setPermissionGroups(clonePermissionGroups(permissions))
      setBaselinePermissionGroups(clonePermissionGroups(permissions))
      setPermissionStatus("ready")
    } catch (loadError: unknown) {
      if (session !== dialogSessionRef.current || dialogRoleIdRef.current !== roleId) return
      setPermissionStatus("error")
      setPermissionError(getPermissionErrorMessage(loadError))
    }
  }

  function handleDialogTabChange(tab: RoleDialogTab) {
    if (tab === "permissions" && permissionStatus === "idle") {
      void loadPermissions(dialogRoleIdRef.current, dialogSessionRef.current)
    }
  }

  function setPermission(menuId: string, key: RolePermissionKey, value: boolean) {
    setPermissionGroups((current) =>
      current.map((group) => ({
        ...group,
        roles: group.roles.map((permission) =>
          permission.menuId === menuId ? { ...permission, [key]: value } : permission,
        ),
      })),
    )
    setPermissionError(null)
  }

  function undoPermissions() {
    setPermissionGroups(clonePermissionGroups(baselinePermissionGroups))
    setPermissionError(null)
  }

  async function submitRoleForm(intent: EntityDialogSubmitIntent) {
    if (isSubmitting) return

    const validationErrors = validateRoleForm(roleForm)
    if (Object.keys(validationErrors).length > 0) {
      setFormErrors(validationErrors)
      return
    }

    const isEditMode = dialogState.mode === "edit"
    if (isEditMode && (roleDetailStatus !== "ready" || !hasUnsavedChanges)) return

    setFormErrors({})
    setIsSubmitting(true)
    setDialogState((current) => ({ ...current, submitIntent: intent }))

    try {
      const details = {
        name: roleForm.name.trim(),
        key: roleForm.key.trim(),
        isRegistrationEligible: roleForm.isRegistrationEligible,
        isActived: roleForm.isActived ?? true,
      }

      if (isEditMode) {
        const saveRequest = {
          id: roleForm.id,
          ...(metadataDirty ? { details } : {}),
          ...(permissionsDirty ? { permissions: permissionDiff.changedRows } : {}),
        }
        await adminApi.saveRole(saveRequest)

        try {
          await refreshRoles()
          toast.success("Cập nhật vai trò thành công", {
            description: "Vai trò " + details.name + " đã được cập nhật.",
          })
        } catch (refreshError: unknown) {
          setError(getListErrorMessage(refreshError))
          toast.warning("Vai trò đã được lưu", {
            description: "Không làm mới được danh sách. Hãy thử Làm mới để xem dữ liệu mới nhất.",
          })
        }

        closeRoleDialog(true)
        return
      }

      await adminApi.createRole({
        ...roleForm,
        name: details.name,
        key: details.key,
        isRegistrationEligible: details.isRegistrationEligible,
        isActived: details.isActived,
      })

      try {
        await refreshRoles()
        toast.success("Thêm vai trò thành công", {
          description: "Vai trò " + details.name + " đã được thêm.",
        })
      } catch (refreshError: unknown) {
        setError(getListErrorMessage(refreshError))
        toast.warning("Vai trò đã được tạo", {
          description: "Không làm mới được danh sách. Hãy thử Làm mới để xem dữ liệu mới nhất.",
        })
      }

      if (intent === "saveAndAddMore" && canUseSaveAndAddMore("create")) {
        setDialogState(openCreateDialog())
        setRoleForm(createEmptyRoleForm())
        setFormErrors({})
        setRoleMetadata(undefined)
        setMetadataBaseline(null)
        resetPermissionState()
        setIsSubmitting(false)
      } else {
        closeRoleDialog(true)
      }
    } catch (saveError: unknown) {
      const message = getPermissionErrorMessage(saveError)
      toast.error("Không thể xác nhận việc lưu vai trò", {
        description: message + " Không thử lại tự động; bản nháp vẫn được giữ lại.",
      })
      setIsSubmitting(false)
    }
  }

  function openBulkDeleteDialog() {
    if (selectedIds.length === 0 || isDeletingRoles) return
    setBulkDeleteError(null)
    setIsBulkDeleteDialogOpen(true)
  }

  function closeBulkDeleteDialog() {
    if (isDeletingRoles) return
    setBulkDeleteError(null)
    setIsBulkDeleteDialogOpen(false)
  }

  function openDeleteRoleDialog(role: RoleModel) {
    if (isDeletingRole) return
    setDeleteError(null)
    setDeleteTarget(role)
  }

  function closeDeleteRoleDialog() {
    if (isDeletingRole) return
    setDeleteError(null)
    setDeleteTarget(null)
  }

  async function confirmDeleteRole() {
    if (!deleteTarget || isDeletingRole) return

    const role = deleteTarget
    setDeleteError(null)
    setIsDeletingRole(true)
    setIsLoading(true)

    try {
      await adminApi.deleteRoles([role.id])
      setSelectedIds((current) => current.filter((id) => id !== role.id))
      setDeleteTarget(null)
      const result = await refreshRoles()
      if (result.data.length === 0 && result.totalRow > 0 && request.pageIndex > 1) {
        setRequest((current) => changePage(current, current.pageIndex - 1))
      }
      toast.success("Xóa vai trò thành công", {
        description: `Vai trò ${role.name} đã được xóa.`,
      })
    } catch (deleteLoadError: unknown) {
      const message = getListErrorMessage(deleteLoadError)
      setDeleteError(message)
      setError(message)
      toast.error("Không thể xóa vai trò", { description: message })
    } finally {
      setIsDeletingRole(false)
      setIsLoading(false)
    }
  }

  async function confirmDeleteRoles() {
    if (selectedIds.length === 0 || isDeletingRoles) return

    const deletedCount = selectedIds.length
    setIsDeletingRoles(true)
    setBulkDeleteError(null)
    setIsLoading(true)

    try {
      await adminApi.deleteRoles(selectedIds)
      setSelectedIds([])
      setIsBulkDeleteDialogOpen(false)
      const result = await refreshRoles()
      if (result.data.length === 0 && result.totalRow > 0 && request.pageIndex > 1) {
        setRequest((current) => changePage(current, current.pageIndex - 1))
      }
      toast.success("Đã xóa " + deletedCount + " vai trò")
    } catch (deleteError: unknown) {
      const message = getListErrorMessage(deleteError)
      setBulkDeleteError(message)
      setError(message)
      toast.error("Không thể xóa vai trò", { description: message })
    } finally {
      setIsDeletingRoles(false)
      setIsLoading(false)
    }
  }

  function updateRoleFilter(key: RoleFilterKey, value: boolean | undefined) {
    startListChange((current) =>
      applyRoleFilters(current, {
        isActived: key === "isActived" ? value : current.isActived,
        isSystem: key === "isSystem" ? value : current.isSystem,
        isRegistrationEligible: key === "isRegistrationEligible" ? value : current.isRegistrationEligible,
      }),
    )
  }

  function resetFilters() {
    startListChange((current) => resetRoleFilters(current))
  }

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1500px] flex-col gap-5 overflow-hidden px-4 py-5 md:px-6">
      <div className="shrink-0 space-y-1 border-b pb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Vai trò</h1>
        <p className="text-sm text-muted-foreground">Quản lý vai trò và thiết lập quyền truy cập hệ thống.</p>
      </div>

      <Card className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden rounded-xl border-platform-border bg-background py-0 shadow-none ring-0">
        <DataTableToolbar
            searchValue={searchTerm}
            onSearchChange={setSearchTerm}
            searchPlaceholder="Tìm theo tên hoặc mã vai trò..."
            searchAriaLabel="Tìm kiếm vai trò"
            filterOpen={filtersOpen}
            onFilterOpenChange={setFiltersOpen}
            activeFilterCount={activeFilterCount}
            filterContent={<><div className="rounded-lg border p-3">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div className="grid flex-1 gap-3 md:grid-cols-3">
                  <label className="grid gap-2 text-xs font-medium text-muted-foreground">
                    Trạng thái
                    <Select value={filterValue(request.isActived)} onValueChange={(value) => updateRoleFilter("isActived", parseFilterValue(value))}>
                      <SelectTrigger className="h-10 w-full" aria-label="Lọc trạng thái"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="all">Tất cả trạng thái</SelectItem><SelectItem value="true">Hoạt động</SelectItem><SelectItem value="false">Không hoạt động</SelectItem></SelectContent>
                    </Select>
                  </label>
                  <label className="grid gap-2 text-xs font-medium text-muted-foreground">
                    Loại vai trò
                    <Select value={filterValue(request.isSystem)} onValueChange={(value) => updateRoleFilter("isSystem", parseFilterValue(value))}>
                      <SelectTrigger className="h-10 w-full" aria-label="Lọc loại vai trò"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="all">Tất cả loại</SelectItem><SelectItem value="true">Hệ thống</SelectItem><SelectItem value="false">Tùy chỉnh</SelectItem></SelectContent>
                    </Select>
                  </label>
                  <label className="grid gap-2 text-xs font-medium text-muted-foreground">
                    Đăng ký
                    <Select value={filterValue(request.isRegistrationEligible)} onValueChange={(value) => updateRoleFilter("isRegistrationEligible", parseFilterValue(value))}>
                      <SelectTrigger className="h-10 w-full" aria-label="Lọc quyền đăng ký"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="all">Tất cả</SelectItem><SelectItem value="true">Được phép</SelectItem><SelectItem value="false">Không được phép</SelectItem></SelectContent>
                    </Select>
                  </label>
                </div>
                <Button type="button" variant="outline" onClick={resetFilters}>Đặt lại bộ lọc</Button>
              </div>
            </div></>}
            actions={<>
              <Button type="button" variant="outline" className="text-destructive hover:text-destructive" onClick={openBulkDeleteDialog} disabled={selectedIds.length === 0}><Trash2 className="size-4" aria-hidden="true" />{selectedIds.length > 0 ? `Xóa danh sách (${selectedIds.length})` : "Xóa danh sách"}</Button>
              <Button type="button" onClick={openCreateRoleDialog}><Plus className="size-4" aria-hidden="true" />Thêm vai trò</Button>
            </>}
          />

        <DataTable
          variant="embedded"
          showRefresh
          className="min-h-0 flex-1"
          columns={columns}
          items={items}
           getRowKey={(item) => item.id}
           getRowLabel={(item) => item.name}
           isRowSelectable={(item) => item.canDelete !== false}
           getRowSelectionDisabledReason={(item) => item.deleteBlockedReason ?? "Vai trò này không thể bị xóa."}
           selection={{ selectedIds, onSelectedIdsChange: setSelectedIds }}
          pageIndex={request.pageIndex}
          pageSize={request.pageSize}
          totalRow={totalRow}
          onPageChange={(pageIndex) => startListChange((current) => changePage(current, pageIndex))}
          onPageSizeChange={(pageSize) => startListChange((current) => changePageSize(current, pageSize))}
          onRefresh={() => {
            setError(null)
            setIsLoading(true)
            setSelectedIds([])
            setRequest((current) => ({ ...current }))
          }}
          isLoading={isLoading}
          error={error}
          emptyTitle="Không có vai trò"
          emptyDescription="Không có dữ liệu phù hợp với bộ lọc hiện tại."
          rowActions={(item) => (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={"Mở thao tác hàng " + item.name}>
                  <MoreHorizontal className="size-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>Thao tác</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void openEditRoleDialog(item.id, "details")}>Cập nhật</DropdownMenuItem>
                <DropdownMenuItem onClick={() => void openEditRoleDialog(item.id, "permissions")}>
                  <ShieldCheck className="size-4" aria-hidden="true" />
                  Phân quyền
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => openDeleteRoleDialog(item)}>Xóa</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        />
      </Card>

      <RoleFormDialog
        key={`${dialogState.mode ?? "closed"}:${dialogState.entityId ?? "new"}:${dialogInitialTab}`}
        open={dialogState.isOpen}
        mode={dialogState.mode}
         value={roleForm}
         roleMetadata={roleMetadata}
         errors={formErrors}
         isSubmitting={isSubmitting}
         detailStatus={roleDetailStatus}
         detailError={roleDetailError}
         isSaveDisabled={dialogState.mode === "edit" && (roleDetailStatus !== "ready" || !hasUnsavedChanges)}
        submitIntent={dialogState.submitIntent}
        permissionGroups={permissionGroups}
        changedCellCount={permissionDiff.changedCellCount}
        permissionStatus={permissionStatus}
        isPermissionsLoading={permissionStatus === "loading"}
        permissionError={permissionError}
        initialTab={dialogInitialTab}
         onOpenChange={(open) => {
           if (!open) closeRoleDialog()
         }}
         onRetryDetails={retryRoleDetail}
         onTabChange={handleDialogTabChange}
        onChange={setRoleForm}
        onPermissionChange={setPermission}
        onRetryPermissions={() => void loadPermissions(dialogRoleIdRef.current, dialogSessionRef.current)}
        onUndoPermissions={undoPermissions}
        onSave={() => void submitRoleForm("save")}
        onSaveAndAddMore={() => void submitRoleForm("saveAndAddMore")}
      />

      <AlertDialog
        open={isDiscardDialogOpen}
        onOpenChange={(open) => {
          if (!open && !isSubmitting) setIsDiscardDialogOpen(false)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rời khỏi chỉnh sửa?</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có thay đổi chưa lưu. Đóng cửa sổ sẽ loại bỏ các thay đổi này.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>Ở lại</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isSubmitting}
              onClick={(event) => {
                event.preventDefault()
                discardRoleDialogChanges()
              }}
            >
              Bỏ thay đổi
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={isBulkDeleteDialogOpen}
        onOpenChange={(open) => {
          if (open) setIsBulkDeleteDialogOpen(true)
          else closeBulkDeleteDialog()
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa danh sách vai trò</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn xóa <strong>{selectedIds.length} vai trò</strong> đã chọn? Hành động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {selectedIds.length > 0 ? (
            <div className="max-h-32 overflow-y-auto rounded-lg border bg-muted/20 p-3">
              <p className="mb-2 text-sm font-medium">Vai trò đã chọn</p>
              <ul className="grid gap-1 text-sm text-muted-foreground">
                {items.filter((item) => selectedIds.includes(item.id)).map((item) => <li key={item.id}>{item.name}</li>)}
              </ul>
            </div>
          ) : null}
          {bulkDeleteError ? <p role="alert" className="text-sm text-destructive">{bulkDeleteError}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingRoles} onClick={closeBulkDeleteDialog}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeletingRoles || selectedIds.length === 0}
              onClick={(event) => {
                event.preventDefault()
                void confirmDeleteRoles()
              }}
            >
              {isDeletingRoles ? "Đang xóa..." : "Xác nhận xóa"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) closeDeleteRoleDialog()
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa vai trò</AlertDialogTitle>
            <AlertDialogDescription>
              Bạn có chắc muốn xóa vai trò <strong>{deleteTarget?.name}</strong>? Hành động này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError ? <p role="alert" className="text-sm text-destructive">{deleteError}</p> : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingRole} onClick={closeDeleteRoleDialog}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isDeletingRole || !deleteTarget}
              onClick={(event) => {
                event.preventDefault()
                void confirmDeleteRole()
              }}
            >
              {isDeletingRole ? "Đang xóa..." : "Xóa vai trò"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

