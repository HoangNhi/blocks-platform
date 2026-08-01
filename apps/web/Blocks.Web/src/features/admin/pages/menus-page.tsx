import { MoreHorizontal } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { ConfirmAction } from "@/features/admin/components/confirm-action"
import { MenuFormDialog, type MenuFormErrors, type MenuFormValues } from "@/features/admin/components/menu-form-dialog"
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
import type { ComboboxOption, MenuDetailModel, MenuModel } from "../types"

const tokenStore = createBrowserTokenStore()
const adminApi = createSystemAdminApi(
  createApiClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? "/",
    getAccessToken: tokenStore.getAccessToken,
  }),
)

function createEmptyMenuForm(): MenuFormValues {
  return {
    id: crypto.randomUUID(),
    controller: "",
    name: "",
    systemGroupId: "",
    sort: 0,
    canView: true,
    canAdd: false,
    canUpdate: false,
    canDelete: false,
    canApprove: false,
    canAnalyze: false,
    isShowMenu: true,
    folderUpload: crypto.randomUUID(),
    isActived: true,
    isEdit: false,
  }
}

function createMenuFormFromDetail(detail: MenuDetailModel): MenuFormValues {
  return {
    id: detail.id,
    controller: detail.controller,
    name: detail.name,
    systemGroupId: detail.systemGroupId,
    sort: detail.sort ?? 0,
    canView: detail.canView,
    canAdd: detail.canAdd,
    canUpdate: detail.canUpdate,
    canDelete: detail.canDelete,
    canApprove: detail.canApprove,
    canAnalyze: detail.canAnalyze,
    isShowMenu: detail.isShowMenu,
    folderUpload: crypto.randomUUID(),
    isActived: detail.isActived ?? true,
    isEdit: true,
  }
}

function validateMenuForm(form: MenuFormValues): MenuFormErrors {
  const errors: MenuFormErrors = {}

  if (!form.name.trim()) {
    errors.name = "Tên menu không được để trống."
  }

  if (!form.controller.trim()) {
    errors.controller = "Controller không được để trống."
  }

  if (!form.systemGroupId.trim()) {
    errors.systemGroupId = "Nhóm hệ thống không được để trống."
  }

  return errors
}

export function MenusPage() {
  const [items, setItems] = useState<MenuModel[]>([])
  const [totalRow, setTotalRow] = useState(0)
  const [request, setRequest] = useState(createDefaultPagingRequest(20))
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [systemGroupOptions, setSystemGroupOptions] = useState<ComboboxOption[]>([])
  const [dialogState, setDialogState] = useState(closeDialogState())
  const [menuForm, setMenuForm] = useState<MenuFormValues>(createEmptyMenuForm())
  const [formErrors, setFormErrors] = useState<MenuFormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const columns = useMemo<SystemColumn<MenuModel>[]>(
    () => [
      { key: "name", header: "Tên menu", cell: (item) => item.name },
      {
        key: "systemGroup",
        header: "Nhóm quyền",
        cell: (item) => item.systemGroup ?? item.systemGroupId,
      },
      { key: "controller", header: "Controller", cell: (item) => item.controller },
      {
        key: "canView",
        header: "Xem",
        cell: (item) => <Checkbox checked={item.canView} disabled aria-label="Có thể xem" />,
        headerClassName: "text-center",
        cellClassName: "text-center",
      },
      {
        key: "canAdd",
        header: "Thêm",
        cell: (item) => <Checkbox checked={item.canAdd} disabled aria-label="Có thể thêm" />,
        headerClassName: "text-center",
        cellClassName: "text-center",
      },
      {
        key: "canUpdate",
        header: "Cập nhật",
        cell: (item) => (
          <Checkbox checked={item.canUpdate} disabled aria-label="Có thể cập nhật" />
        ),
        headerClassName: "text-center",
        cellClassName: "text-center",
      },
      {
        key: "canDelete",
        header: "Xóa",
        cell: (item) => <Checkbox checked={item.canDelete} disabled aria-label="Có thể xóa" />,
        headerClassName: "text-center",
        cellClassName: "text-center",
      },
      {
        key: "canApprove",
        header: "Duyệt",
        cell: (item) => (
          <Checkbox checked={item.canApprove} disabled aria-label="Có thể duyệt" />
        ),
        headerClassName: "text-center",
        cellClassName: "text-center",
      },
      {
        key: "canAnalyze",
        header: "Thống kê",
        cell: (item) => (
          <Checkbox checked={item.canAnalyze} disabled aria-label="Có thể thống kê" />
        ),
        headerClassName: "text-center",
        cellClassName: "text-center",
      },
      {
        key: "status",
        header: "Trạng thái",
        cell: (item) => (
          <Badge
            variant="secondary"
            className={
              item.isShowMenu
                ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-50"
                : ""
            }
          >
            {item.isShowMenu ? "Hiển thị" : "Ẩn"}
          </Badge>
        ),
      },
    ],
    [],
  )

  const loadMenus = useCallback(
    (nextRequest = request) => adminApi.getMenus(nextRequest),
    [request],
  )

  useEffect(() => {
    let active = true

    void loadMenus(request)
      .then((result) => {
        if (!active) return
        setItems(result.data)
        setTotalRow(result.totalRow)
      })
      .catch((loadError: unknown) => {
        if (!active) return
        setError(loadError instanceof Error ? loadError.message : "Không tải được danh sách menu.")
      })
      .finally(() => {
        if (!active) return
        setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [loadMenus, request])

  useEffect(() => {
    let active = true

    void adminApi.getSystemGroupOptions().then((options) => {
      if (!active) return
      setSystemGroupOptions(options)
    })

    return () => {
      active = false
    }
  }, [])

  function refreshMenus() {
    return loadMenus(request).then((result) => {
      setItems(result.data)
      setTotalRow(result.totalRow)
    })
  }

  function closeMenuDialog() {
    setDialogState(closeDialogState())
    setMenuForm(createEmptyMenuForm())
    setFormErrors({})
    setIsSubmitting(false)
  }

  function openCreateMenuDialog() {
    setError(null)
    setFormErrors({})
    setMenuForm(createEmptyMenuForm())
    setDialogState(openCreateDialog())
  }

  async function openEditMenuDialog(id: string) {
    setError(null)
    setFormErrors({})

    try {
      const detail = await adminApi.getMenuById(id)
      setMenuForm(createMenuFormFromDetail(detail))
      setDialogState(openEditDialog(id))
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Không tải được chi tiết menu.")
    }
  }

  async function submitMenuForm(intent: EntityDialogSubmitIntent) {
    if (isSubmitting) return

    const validationErrors = validateMenuForm(menuForm)
    if (Object.keys(validationErrors).length > 0) {
      setFormErrors(validationErrors)
      return
    }

    setFormErrors({})
    setIsSubmitting(true)
    setDialogState((current) => ({ ...current, submitIntent: intent }))

    try {
      const requestBody = {
        id: menuForm.id,
        controller: menuForm.controller.trim(),
        name: menuForm.name.trim(),
        systemGroupId: menuForm.systemGroupId,
        sort: menuForm.sort,
        canView: menuForm.canView,
        canAdd: menuForm.canAdd,
        canUpdate: menuForm.canUpdate,
        canDelete: menuForm.canDelete,
        canApprove: menuForm.canApprove,
        canAnalyze: menuForm.canAnalyze,
        isShowMenu: menuForm.isShowMenu,
        folderUpload: menuForm.folderUpload,
        isActived: menuForm.isActived,
        isEdit: menuForm.isEdit,
      }

      if (dialogState.mode === "edit") {
        await adminApi.updateMenu(requestBody)
      } else {
        await adminApi.createMenu(requestBody)
      }

      await refreshMenus()

      if (intent === "saveAndAddMore" && dialogState.mode === "create") {
        setDialogState(openCreateDialog())
        setMenuForm(createEmptyMenuForm())
        setFormErrors({})
        setIsSubmitting(false)
      } else {
        closeMenuDialog()
      }
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Không thể lưu menu.")
      setIsSubmitting(false)
    }
  }

  async function deleteSelectedMenus() {
    if (selectedIds.length === 0) return

    setError(null)
    setIsLoading(true)

    try {
      await adminApi.deleteMenus(selectedIds)
      setSelectedIds([])

      const refreshed = await loadMenus(request)
      setItems(refreshed.data)
      setTotalRow(refreshed.totalRow)
    } catch (deleteError: unknown) {
      setError(deleteError instanceof Error ? deleteError.message : "Không thể xóa menu.")
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
          <Button onClick={openCreateMenuDialog}>Thêm</Button>
          <ConfirmAction
            label="Xóa"
            confirmLabel="Xác nhận xóa"
            disabled={selectedIds.length === 0}
            onConfirm={deleteSelectedMenus}
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
          emptyTitle="Không có menu"
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
                <DropdownMenuItem onClick={() => void openEditMenuDialog(item.id)}>
                  Sửa
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        />
      }
    >
      <MenuFormDialog
        open={dialogState.isOpen}
        mode={dialogState.mode}
        value={menuForm}
        systemGroupOptions={systemGroupOptions}
        errors={formErrors}
        isSubmitting={isSubmitting}
        submitIntent={dialogState.submitIntent}
        onOpenChange={(open) => {
          if (!open) {
            closeMenuDialog()
          }
        }}
        onChange={setMenuForm}
        onSave={() => void submitMenuForm("save")}
        onSaveAndAddMore={() => void submitMenuForm("saveAndAddMore")}
      />
    </SystemListPageScaffold>
  )
}
