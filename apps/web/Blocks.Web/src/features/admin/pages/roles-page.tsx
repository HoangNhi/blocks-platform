import { MoreHorizontal, ShieldCheck } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
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
import { createApiClient } from "@/lib/api/client"

import { createSystemAdminApi } from "../system-admin-api"
import type { RoleDetailModel, RoleModel } from "../types"

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

  const columns = useMemo<SystemColumn<RoleModel>[]>(
    () => [
      { key: "name", header: "Tên gói", cell: (item) => item.name },
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
                <DropdownMenuItem asChild>
                  <Link to={`/system/identity/permissions?roleId=${encodeURIComponent(item.id)}`}>
                    <ShieldCheck className="size-4" aria-hidden="true" />
                    Phân quyền
                  </Link>
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
    </SystemListPageScaffold>
  )
}
