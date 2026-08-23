import { MoreHorizontal, ShieldCheck } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ConfirmAction } from "@/features/admin/components/confirm-action"
import { RoleFormDialog, type RoleFormErrors, type RoleFormValues } from "@/features/admin/components/role-form-dialog"
import {
  SystemDataTable,
  type SystemColumn,
} from "@/features/admin/components/system-data-table"
import { SystemListPageScaffold } from "@/features/admin/components/system-list-page-scaffold"
import {
  applyTextSearch,
  changePage,
  changePageSize,
  createDefaultPagingRequest,
  resetPagingRequest,
} from "@/features/admin/system-list-state"
import {
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

const permissionColumns = [
  { key: "isViewed", label: "Xem", capability: "canView" },
  { key: "isAdded", label: "Thêm", capability: "canAdd" },
  { key: "isUpdated", label: "Cập nhật", capability: "canUpdate" },
  { key: "isDeleted", label: "Xóa", capability: "canDelete" },
  { key: "isApproved", label: "Duyệt", capability: "canApprove" },
  { key: "isAnalyzed", label: "Thống kê", capability: "canAnalyze" },
] as const

const tokenStore = createBrowserTokenStore()
const adminApi = createSystemAdminApi(
  createApiClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? "/",
    getAccessToken: tokenStore.getAccessToken,
  }),
)

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

  if (!form.name.trim()) {
    errors.name = "Tên vai trò không được để trống."
  }

  if (!form.key.trim()) {
    errors.key = "Mã vai trò không được để trống."
  }

  return errors
}

export function RolesPage() {
  const [items, setItems] = useState<RoleModel[]>([])
  const [totalRow, setTotalRow] = useState(0)
  const [request, setRequest] = useState(createDefaultPagingRequest(20))
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogState, setDialogState] = useState(closeDialogState())
  const [roleForm, setRoleForm] = useState<RoleFormValues>(createEmptyRoleForm())
  const [formErrors, setFormErrors] = useState<RoleFormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedRoleId, setSelectedRoleId] = useState("")
  const [permissionGroups, setPermissionGroups] = useState<PermissionGroupModel[]>([])
  const [permissionsLoadedForRole, setPermissionsLoadedForRole] = useState<string | null>(null)
  const [permissionError, setPermissionError] = useState<string | null>(null)
  const [permissionErrorRoleId, setPermissionErrorRoleId] = useState<string | null>(null)
  const [permissionMessage, setPermissionMessage] = useState<string | null>(null)
  const [permissionMessageRoleId, setPermissionMessageRoleId] = useState<string | null>(null)
  const [permissionsReloadKey, setPermissionsReloadKey] = useState(0)
  const [isPermissionsSaving, setIsPermissionsSaving] = useState(false)
  const permissionSummaryRef = useRef<HTMLDivElement>(null)

  const effectiveSelectedRoleId = selectedRoleId || items[0]?.id || ""

  useEffect(() => {
    if (!effectiveSelectedRoleId || typeof adminApi.getPermissionsByRole !== "function") {
      return
    }

    let active = true

    void adminApi.getPermissionsByRole(effectiveSelectedRoleId)
      .then((result) => {
        if (!active) return
        setPermissionGroups(result)
        setPermissionsLoadedForRole(effectiveSelectedRoleId)
        setPermissionErrorRoleId(null)
      })
      .catch((loadError: unknown) => {
        if (!active) return
        setPermissionGroups([])
        setPermissionsLoadedForRole(null)
        setPermissionErrorRoleId(effectiveSelectedRoleId)
        setPermissionError(permissionErrorMessage(loadError))
      })

    return () => {
      active = false
    }
  }, [effectiveSelectedRoleId, permissionsReloadKey])

  useEffect(() => {
    if (permissionError && permissionErrorRoleId === effectiveSelectedRoleId) permissionSummaryRef.current?.focus()
  }, [effectiveSelectedRoleId, permissionError, permissionErrorRoleId])

  function permissionErrorMessage(value: unknown) {
    if (value instanceof ApiError && value.isForbidden) {
      return "Bạn không có quyền quản lý phân quyền vai trò."
    }

    return value instanceof Error ? value.message : "Không thể tải hoặc lưu phân quyền vai trò."
  }

  function selectRole(roleId: string) {
    setSelectedRoleId(roleId)
    setPermissionError(null)
    setPermissionErrorRoleId(null)
    setPermissionMessage(null)
    setPermissionMessageRoleId(null)
  }

  function setPermission(menuId: string, key: (typeof permissionColumns)[number]["key"], value: boolean) {
    setPermissionGroups((current) => current.map((group) => ({
      ...group,
      roles: group.roles.map((permission) => permission.menuId === menuId ? { ...permission, [key]: value } : permission),
    })))
    setPermissionError(null)
    setPermissionMessage(null)
    setPermissionMessageRoleId(null)
  }

  async function saveRolePermissions() {
    if (!effectiveSelectedRoleId || isPermissionsSaving || permissionsLoading || typeof adminApi.updatePermissions !== "function") return
    setIsPermissionsSaving(true)
    setPermissionError(null)
    setPermissionMessage(null)
    setPermissionMessageRoleId(null)
    try {
      const result = await adminApi.updatePermissions(permissionGroups.flatMap((group) => group.roles))
      if (result !== true) throw new Error("Máy chủ chưa xác nhận thay đổi phân quyền.")
      const refreshed = await adminApi.getPermissionsByRole(effectiveSelectedRoleId)
      setPermissionGroups(refreshed)
      setPermissionsLoadedForRole(effectiveSelectedRoleId)
      setPermissionMessage("Phân quyền đã được lưu.")
      setPermissionMessageRoleId(effectiveSelectedRoleId)
      setPermissionsReloadKey((current) => current + 1)
    } catch (saveError: unknown) {
      setPermissionError(permissionErrorMessage(saveError))
      setPermissionErrorRoleId(effectiveSelectedRoleId)
    } finally {
      setIsPermissionsSaving(false)
    }
  }

  const selectedRole = items.find((item) => item.id === effectiveSelectedRoleId)
  const showCombinedWorkflow = Boolean(selectedRole)
  const permissionsLoading = Boolean(effectiveSelectedRoleId) && permissionsLoadedForRole !== effectiveSelectedRoleId && permissionErrorRoleId !== effectiveSelectedRoleId

  const columns = useMemo<SystemColumn<RoleModel>[]>(
    () => [
      { key: "name", header: "Tên vai trò", cell: (item) => item.name },
      { key: "key", header: "Mã ổn định", cell: (item) => item.key ?? "Chưa có" },
      { key: "safety", header: "Bảo vệ", cell: (item) => `${item.isSystem ? "Vai trò hệ thống" : "Tùy chỉnh"}; ${item.isRegistrationEligible ? "Được phép đăng ký" : "Không đăng ký"}${item.isDefaultRegistrationRole ? "; Vai trò đăng ký mặc định" : ""}` },
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
            variant="secondary"
            className={
              item.isActived === false
                ? ""
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
        if (!active) return
        setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [loadRoles, request])

  function refreshRoles() {
    return loadRoles(request).then((result) => {
      setItems(result.data)
      setTotalRow(result.totalRow)
    })
  }

  function closeRoleDialog() {
    setDialogState(closeDialogState())
    setRoleForm(createEmptyRoleForm())
    setFormErrors({})
    setIsSubmitting(false)
  }

  function openCreateRoleDialog() {
    setError(null)
    setFormErrors({})
    setRoleForm(createEmptyRoleForm())
    setDialogState(openCreateDialog())
  }

  async function openEditRoleDialog(id: string) {
    setError(null)
    setFormErrors({})

    try {
      const detail = await adminApi.getRoleById(id)
      setRoleForm(createRoleFormFromDetail(detail))
      setDialogState(openEditDialog(id))
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Không tải được chi tiết vai trò.")
    }
  }

  async function submitRoleForm(intent: EntityDialogSubmitIntent) {
    if (isSubmitting) return

    const validationErrors = validateRoleForm(roleForm)
    if (Object.keys(validationErrors).length > 0) {
      setFormErrors(validationErrors)
      return
    }

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

      if (dialogState.mode === "edit") {
        await adminApi.updateRole(requestBody)
      } else {
        await adminApi.createRole(requestBody)
      }

      await refreshRoles()

      if (intent === "saveAndAddMore" && dialogState.mode === "create") {
        setDialogState(openCreateDialog())
        setRoleForm(createEmptyRoleForm())
        setFormErrors({})
        setIsSubmitting(false)
      } else {
        closeRoleDialog()
      }
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Không thể lưu vai trò.")
      setIsSubmitting(false)
    }
  }

  async function deleteSelectedRoles() {
    if (selectedIds.length === 0) return

    setError(null)
    setIsLoading(true)

    try {
      await adminApi.deleteRoles(selectedIds)
      setSelectedIds([])

      const refreshed = await loadRoles(request)
      setItems(refreshed.data)
      setTotalRow(refreshed.totalRow)
    } catch (deleteError: unknown) {
      setError(deleteError instanceof Error ? deleteError.message : "Không thể xóa vai trò.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <SystemListPageScaffold
      onResetFilters={() => {
        setError(null)
        setIsLoading(true)
        setSearchTerm("")
        setSelectedIds([])
        setRequest(resetPagingRequest(request.pageSize))
      }}
      filterContent={
        <div className="grid gap-3 md:grid-cols-[minmax(0,420px)]">
          <Input
            value={searchTerm}
            placeholder="Tìm kiếm..."
            onChange={(event) => setSearchTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                setError(null)
                setIsLoading(true)
                setRequest((current) => applyTextSearch(current, searchTerm))
              }
            }}
          />
        </div>
      }
      actions={
        <>
          <Button onClick={openCreateRoleDialog}>Thêm</Button>
          <ConfirmAction
            label="Xóa"
            confirmLabel="Xác nhận xóa"
            disabled={selectedIds.length === 0}
            onConfirm={deleteSelectedRoles}
          />
        </>
      }
      tableContent={
        <SystemDataTable
          columns={columns}
          items={items}
          getRowKey={(item) => item.id}
          selection={{
            selectedIds,
            onSelectedIdsChange: setSelectedIds,
          }}
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
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => selectRole(item.id)}>
                  <ShieldCheck className="size-4" aria-hidden="true" />
                  Mở Roles &amp; Permissions
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => void openEditRoleDialog(item.id)}>
                  Sửa
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        />
      }
    >
      <RoleFormDialog
        open={dialogState.isOpen}
        mode={dialogState.mode}
        value={roleForm}
        errors={formErrors}
        isSubmitting={isSubmitting}
        submitIntent={dialogState.submitIntent}
        onOpenChange={(open) => {
          if (!open) {
            closeRoleDialog()
          }
        }}
        onChange={setRoleForm}
        onSave={() => void submitRoleForm("save")}
        onSaveAndAddMore={() => void submitRoleForm("saveAndAddMore")}
      />
       {showCombinedWorkflow && selectedRole ? (
         <Card>
           <CardHeader>
             <CardTitle>Roles &amp; Permissions: {selectedRole.name}</CardTitle>
             <p className="text-sm text-muted-foreground">Mã ổn định: {selectedRole.key ?? "Chưa có"}. {selectedRole.isSystem ? "Vai trò hệ thống, được bảo vệ." : "Vai trò tùy chỉnh."} {selectedRole.isRegistrationEligible ? "Được phép đăng ký." : "Không dùng cho đăng ký."} {selectedRole.isDefaultRegistrationRole ? "Vai trò đăng ký mặc định." : ""}</p>
           </CardHeader>
           <CardContent className="grid gap-3">
             <div className="flex flex-wrap gap-2">
               {items.map((role) => <Button key={role.id} type="button" variant={role.id === effectiveSelectedRoleId ? "secondary" : "outline"} onClick={() => selectRole(role.id)}>{role.name}</Button>)}
               <Button type="button" onClick={() => void saveRolePermissions()} disabled={isPermissionsSaving || permissionsLoading}>{isPermissionsSaving ? "Đang lưu..." : "Lưu phân quyền"}</Button>
             </div>
             {permissionError && permissionErrorRoleId === effectiveSelectedRoleId ? <Alert ref={permissionSummaryRef} tabIndex={-1} variant="destructive" role="alert"><AlertTitle>Không thể xử lý phân quyền</AlertTitle><AlertDescription>{permissionError}</AlertDescription></Alert> : null}
             {permissionMessage && permissionMessageRoleId === effectiveSelectedRoleId ? <Alert role="status"><AlertTitle>Đã lưu</AlertTitle><AlertDescription>{permissionMessage}</AlertDescription></Alert> : null}
             <div className="overflow-x-auto">
               <Table><TableHeader><TableRow><TableHead>Quyền</TableHead>{permissionColumns.map((column) => <TableHead key={column.key} className="text-center">{column.label}</TableHead>)}</TableRow></TableHeader><TableBody>{permissionsLoading ? <TableRow><TableCell colSpan={permissionColumns.length + 1} className="py-8 text-center text-sm text-muted-foreground">Đang tải phân quyền...</TableCell></TableRow> : permissionGroups.flatMap((group) => group.roles).map((permission) => <TableRow key={permission.menuId}><TableCell><span>{permission.name ?? permission.menuId}</span><span className="ml-2 text-xs text-muted-foreground">{permission.permissionKey ?? permission.menuId}</span></TableCell>{permissionColumns.map((column) => { const supported = permission[column.capability]; return <TableCell key={`${permission.menuId}-${column.key}`} className="text-center">{supported ? <Checkbox checked={permission[column.key]} onCheckedChange={(checked) => setPermission(permission.menuId, column.key, checked === true)} aria-label={`${column.label} ${permission.name ?? permission.menuId}`} /> : <Button type="button" variant="ghost" size="sm" disabled aria-label={`${column.label} ${permission.name ?? permission.menuId} không được hỗ trợ; không thể cấp quyền`} title={`${column.label} không được hỗ trợ; không thể cấp quyền`}>Không hỗ trợ</Button>}</TableCell> })}</TableRow>)}</TableBody></Table>
             </div>
           </CardContent>
         </Card>
       ) : null}
    </SystemListPageScaffold>
  )
}
