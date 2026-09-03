import { Filter, MoreHorizontal, Plus, Search, ShieldCheck, Trash2 } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { ConfirmAction } from "@/features/admin/components/confirm-action"
import {
  RoleFormDialog,
  type RoleDialogTab,
  type RoleFormErrors,
  type RoleFormValues,
  type RolePermissionKey,
} from "@/features/admin/components/role-form-dialog"
import { SystemDataTable, type SystemColumn } from "@/features/admin/components/system-data-table"
import {
  applyTextSearch,
  changePage,
  changePageSize,
  createDefaultPagingRequest,
  resetPagingRequest,
} from "@/features/admin/system-list-state"
import {
  canUseSaveAndAddMore,
  closeDialogState,
  openCreateDialog,
  openEditDialog,
  type EntityDialogSubmitIntent,
} from "@/features/admin/entity-dialog-state"
import { createBrowserTokenStore } from "@/features/auth/token-store"
import { ApiError } from "@/lib/api/api-error"
import { createApiClient } from "@/lib/api/client"

import { createSystemAdminApi } from "../system-admin-api"
import type { PermissionGroupModel, RoleDetailModel, RoleModel } from "../types"

const tokenStore = createBrowserTokenStore()
const adminApi = createSystemAdminApi(
  createApiClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? "/",
    getAccessToken: tokenStore.getAccessToken,
  }),
)

const permissionKeys: RolePermissionKey[] = [
  "isViewed",
  "isAdded",
  "isUpdated",
  "isDeleted",
  "isApproved",
  "isAnalyzed",
]

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
    folderUpload: crypto.randomUUID(),
    isActived: detail.isActived ?? true,
    isEdit: true,
    sort: detail.sort ?? 0,
  }
}

function validateRoleForm(form: RoleFormValues): RoleFormErrors {
  const errors: RoleFormErrors = {}
  if (!form.name.trim()) errors.name = "Tên vai trò không được để trống."
  if (!form.key.trim()) errors.key = "Mã vai trò không được để trống."
  return errors
}

function clonePermissionGroups(groups: PermissionGroupModel[]) {
  return groups.map((group) => ({
    ...group,
    roles: group.roles.map((permission) => ({ ...permission })),
  }))
}

function permissionsAreDirty(current: PermissionGroupModel[], baseline: PermissionGroupModel[]) {
  const baselineByMenuId = new Map(
    baseline.flatMap((group) => group.roles).map((permission) => [permission.menuId, permission]),
  )

  return current.some((group) =>
    group.roles.some((permission) => {
      const previous = baselineByMenuId.get(permission.menuId)
      return Boolean(previous && permissionKeys.some((key) => permission[key] !== previous[key]))
    }),
  )
}

export function RolesPage() {
  const [items, setItems] = useState<RoleModel[]>([])
  const [totalRow, setTotalRow] = useState(0)
  const [request, setRequest] = useState(createDefaultPagingRequest(20))
  const [searchTerm, setSearchTerm] = useState("")
  const [filtersOpen, setFiltersOpen] = useState(true)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogState, setDialogState] = useState(closeDialogState())
  const [dialogInitialTab, setDialogInitialTab] = useState<RoleDialogTab>("details")
  const [roleForm, setRoleForm] = useState<RoleFormValues>(createEmptyRoleForm())
  const [formErrors, setFormErrors] = useState<RoleFormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [permissionGroups, setPermissionGroups] = useState<PermissionGroupModel[]>([])
  const [baselinePermissionGroups, setBaselinePermissionGroups] = useState<PermissionGroupModel[]>([])
  const [isPermissionsLoading, setIsPermissionsLoading] = useState(false)
  const [permissionError, setPermissionError] = useState<string | null>(null)

  const permissionsDirty = useMemo(
    () => permissionsAreDirty(permissionGroups, baselinePermissionGroups),
    [baselinePermissionGroups, permissionGroups],
  )

  const columns = useMemo<SystemColumn<RoleModel>[]>(
    () => [
      {
        key: "role",
        header: "Vai trò",
        cell: (item) => (
          <div className="min-w-[220px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-foreground">{item.name}</span>
              {item.isSystem ? <Badge variant="secondary">Hệ thống</Badge> : null}
              {item.isDefaultRegistrationRole ? <Badge variant="outline">Mặc định đăng ký</Badge> : null}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{item.key ?? "Chưa có mã ổn định"}</div>
          </div>
        ),
      },
      {
        key: "registration",
        header: "Đăng ký",
        cell: (item) => (
          <Badge variant={item.isRegistrationEligible ? "secondary" : "outline"}>
            {item.isRegistrationEligible ? "Được phép" : "Không áp dụng"}
          </Badge>
        ),
      },
      {
        key: "createdAt",
        header: "Ngày tạo",
        cell: (item) => (item.createdAt ? new Date(item.createdAt).toLocaleString() : "-"),
      },
      {
        key: "updatedAt",
        header: "Ngày cập nhật",
        cell: (item) => (item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "-"),
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

  const loadRoles = useCallback(
    (nextRequest = request) => adminApi.getRoles(nextRequest),
    [request],
  )

  useEffect(() => {
    let active = true
    void loadRoles(request)
      .then((result) => {
        if (!active) return
        setItems(result.data)
        setTotalRow(result.totalRow)
      })
      .catch((loadError: unknown) => {
        if (!active) return
        setError(loadError instanceof Error ? loadError.message : "Không tải được danh sách vai trò.")
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [loadRoles, request])

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

  function refreshRoles() {
    return loadRoles(request).then((result) => {
      setItems(result.data)
      setTotalRow(result.totalRow)
    })
  }

  function permissionErrorMessage(value: unknown) {
    if (value instanceof ApiError && value.isForbidden) {
      return "Bạn không có quyền quản lý phân quyền vai trò."
    }
    return value instanceof Error ? value.message : "Không thể tải hoặc lưu phân quyền vai trò."
  }

  function resetPermissionState() {
    setPermissionGroups([])
    setBaselinePermissionGroups([])
    setPermissionError(null)
    setIsPermissionsLoading(false)
  }

  function closeRoleDialog() {
    setDialogState(closeDialogState())
    setDialogInitialTab("details")
    setRoleForm(createEmptyRoleForm())
    setFormErrors({})
    setIsSubmitting(false)
    resetPermissionState()
  }

  function openCreateRoleDialog() {
    setError(null)
    setFormErrors({})
    resetPermissionState()
    setDialogInitialTab("details")
    setRoleForm(createEmptyRoleForm())
    setDialogState(openCreateDialog())
  }

  async function openEditRoleDialog(id: string, initialTab: RoleDialogTab = "details") {
    setError(null)
    setFormErrors({})
    setPermissionError(null)
    setIsPermissionsLoading(true)
    setDialogInitialTab(initialTab)

    try {
      const [detail, permissions] = await Promise.all([
        adminApi.getRoleById(id),
        adminApi.getPermissionsByRole(id),
      ])
      setRoleForm(createRoleFormFromDetail(detail))
      setPermissionGroups(clonePermissionGroups(permissions))
      setBaselinePermissionGroups(clonePermissionGroups(permissions))
      setDialogState(openEditDialog(id))
    } catch (loadError: unknown) {
      const message = permissionErrorMessage(loadError)
      setPermissionError(message)
      setError(message)
    } finally {
      setIsPermissionsLoading(false)
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

  async function submitRoleForm(intent: EntityDialogSubmitIntent) {
    if (isSubmitting) return

    const validationErrors = validateRoleForm(roleForm)
    if (Object.keys(validationErrors).length > 0) {
      setFormErrors(validationErrors)
      return
    }

    const isEditMode = dialogState.mode === "edit"
    setFormErrors({})
    setIsSubmitting(true)
    setDialogState((current) => ({ ...current, submitIntent: intent }))

    try {
      const requestBody = {
        id: roleForm.id,
        name: roleForm.name.trim(),
        key: roleForm.key.trim(),
        isRegistrationEligible: roleForm.isRegistrationEligible,
        folderUpload: roleForm.folderUpload,
        isActived: roleForm.isActived,
        isEdit: roleForm.isEdit,
        sort: roleForm.sort,
      }

      if (isEditMode) {
        await adminApi.updateRole(requestBody)
        if (permissionsDirty) {
          const result = await adminApi.updatePermissions(permissionGroups.flatMap((group) => group.roles))
          if (result !== true) throw new Error("Máy chủ chưa xác nhận thay đổi phân quyền.")
        }
      } else {
        await adminApi.createRole(requestBody)
      }

      await refreshRoles()
      toast.success(isEditMode ? "Cập nhật vai trò thành công" : "Thêm vai trò thành công", {
        description: isEditMode
          ? `Vai trò ${requestBody.name} và phân quyền đã được cập nhật.`
          : `Vai trò ${requestBody.name} đã được thêm.`,
      })

      if (intent === "saveAndAddMore" && !isEditMode && canUseSaveAndAddMore("create")) {
        setDialogState(openCreateDialog())
        setRoleForm(createEmptyRoleForm())
        setFormErrors({})
        setIsSubmitting(false)
      } else {
        closeRoleDialog()
      }
    } catch (saveError: unknown) {
      const message = permissionErrorMessage(saveError)
      setPermissionError(message)
      toast.error("Không thể lưu vai trò", { description: message })
      setIsSubmitting(false)
    }
  }

  async function deleteSelectedRoles() {
    if (selectedIds.length === 0) return

    const deletedCount = selectedIds.length
    setError(null)
    setIsLoading(true)

    try {
      await adminApi.deleteRoles(selectedIds)
      setSelectedIds([])
      await refreshRoles()
      toast.success(`Đã xóa ${deletedCount} vai trò`)
    } catch (deleteError: unknown) {
      const message = deleteError instanceof Error ? deleteError.message : "Không thể xóa vai trò."
      setError(message)
      toast.error("Không thể xóa vai trò", { description: message })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[1500px] flex-col gap-5 overflow-hidden px-4 py-5 md:px-6">
      <div className="shrink-0 space-y-1 border-b pb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Vai trò</h1>
        <p className="text-sm text-muted-foreground">
          Quản lý vai trò và thiết lập quyền truy cập hệ thống.
        </p>
      </div>

      <Card className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden rounded-xl border-platform-border bg-background py-0 shadow-none ring-0">
        <div className="shrink-0 border-b p-4">
          <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
            <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex min-w-0 flex-1 gap-2">
                <div className="relative min-w-0 flex-1 xl:max-w-[460px]">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                  <Input
                    value={searchTerm}
                    placeholder="Tìm theo tên hoặc mã vai trò..."
                    className="pl-9"
                    onChange={(event) => setSearchTerm(event.target.value)}
                  />
                </div>
                <CollapsibleTrigger asChild>
                  <Button type="button" variant={filtersOpen ? "secondary" : "outline"} className="gap-2">
                    <Filter className="size-4" aria-hidden="true" />
                    Bộ lọc
                  </Button>
                </CollapsibleTrigger>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <ConfirmAction
                  label={selectedIds.length > 0 ? `Xóa danh sách (${selectedIds.length})` : "Xóa danh sách"}
                  confirmLabel="Xác nhận xóa"
                  disabled={selectedIds.length === 0}
                  onConfirm={deleteSelectedRoles}
                  icon={<Trash2 className="size-4" aria-hidden="true" />}
                />
                <Button type="button" onClick={openCreateRoleDialog}>
                  <Plus className="size-4" aria-hidden="true" />
                  Thêm vai trò
                </Button>
              </div>
            </div>

            <CollapsibleContent className="mt-3">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/20 px-3 py-2.5">
                <div className="text-sm text-muted-foreground">
                  Tìm kiếm áp dụng cho tên và mã vai trò. Các thuộc tính bảo vệ và đăng ký được hiển thị trực tiếp trong lưới.
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchTerm("")
                    setSelectedIds([])
                    setError(null)
                    setIsLoading(true)
                    setRequest(resetPagingRequest(request.pageSize))
                  }}
                >
                  Đặt lại
                </Button>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        <SystemDataTable
          variant="embedded"
          showRefresh
          className="min-h-0 flex-1"
          columns={columns}
          items={items}
          getRowKey={(item) => item.id}
          selection={{ selectedIds, onSelectedIdsChange: setSelectedIds }}
          pageIndex={request.pageIndex}
          pageSize={request.pageSize}
          totalRow={totalRow}
          onPageChange={(pageIndex) => {
            setError(null)
            setIsLoading(true)
            setRequest((current) => changePage(current, pageIndex))
          }}
          onPageSizeChange={(pageSize) => {
            setError(null)
            setIsLoading(true)
            setRequest((current) => changePageSize(current, pageSize))
          }}
          onRefresh={() => {
            setError(null)
            setIsLoading(true)
            setRequest((current) => ({ ...current }))
          }}
          isLoading={isLoading}
          error={error}
          emptyTitle="Không có vai trò"
          emptyDescription="Không có dữ liệu phù hợp với bộ lọc hiện tại."
          rowActions={(item) => (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="size-4" aria-hidden="true" />
                  <span className="sr-only">Mở thao tác hàng</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuLabel>Thao tác</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void openEditRoleDialog(item.id, "details")}>
                  Sửa
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void openEditRoleDialog(item.id, "permissions")}>
                  <ShieldCheck className="size-4" aria-hidden="true" />
                  Phân quyền
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        />
      </Card>

      <RoleFormDialog
        open={dialogState.isOpen}
        mode={dialogState.mode}
        value={roleForm}
        errors={formErrors}
        isSubmitting={isSubmitting}
        submitIntent={dialogState.submitIntent}
        permissionGroups={permissionGroups}
        isPermissionsLoading={isPermissionsLoading}
        permissionError={permissionError}
        permissionsDirty={permissionsDirty}
        initialTab={dialogInitialTab}
        onOpenChange={(open) => {
          if (!open) closeRoleDialog()
        }}
        onChange={setRoleForm}
        onPermissionChange={setPermission}
        onSave={() => void submitRoleForm("save")}
        onSaveAndAddMore={() => void submitRoleForm("saveAndAddMore")}
      />
    </div>
  )
}
