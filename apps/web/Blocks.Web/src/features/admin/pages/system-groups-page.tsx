import { MoreHorizontal } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

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
import {
  SystemDataTable,
  type SystemColumn,
} from "@/features/admin/components/system-data-table"
import { SystemListPageScaffold } from "@/features/admin/components/system-list-page-scaffold"
import { SystemGroupFormDialog, type SystemGroupFormErrors, type SystemGroupFormValues } from "@/features/admin/components/system-group-form-dialog"
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
import type { ComboboxOption, SystemGroupDetailModel, SystemGroupModel } from "../types"

const tokenStore = createBrowserTokenStore()
const adminApi = createSystemAdminApi(
  createApiClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? "/",
    getAccessToken: tokenStore.getAccessToken,
  }),
)

function createEmptySystemGroupForm(): SystemGroupFormValues {
  return {
    id: crypto.randomUUID(),
    name: "",
    sort: 0,
    parentId: null,
    folderUpload: crypto.randomUUID(),
    isActived: true,
    isEdit: false,
  }
}

function createSystemGroupFormFromDetail(detail: SystemGroupDetailModel): SystemGroupFormValues {
  return {
    id: detail.id,
    name: detail.name,
    sort: detail.sort ?? 0,
    parentId: detail.parentId,
    folderUpload: crypto.randomUUID(),
    isActived: detail.isActived ?? true,
    isEdit: true,
  }
}

function validateSystemGroupForm(form: SystemGroupFormValues): SystemGroupFormErrors {
  const errors: SystemGroupFormErrors = {}

  if (!form.name.trim()) {
    errors.name = "Tên nhóm không được để trống."
  }

  return errors
}

function normalizeParentOptions(options: ComboboxOption[]) {
  return options.map((option) => ({
    label: option.label,
    value: option.value,
  }))
}

export function SystemGroupsPage() {
  const [items, setItems] = useState<SystemGroupModel[]>([])
  const [totalRow, setTotalRow] = useState(0)
  const [request, setRequest] = useState(createDefaultPagingRequest(20))
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [parentOptions, setParentOptions] = useState<ComboboxOption[]>([])
  const [dialogState, setDialogState] = useState(closeDialogState())
  const [systemGroupForm, setSystemGroupForm] = useState<SystemGroupFormValues>(
    createEmptySystemGroupForm(),
  )
  const [formErrors, setFormErrors] = useState<SystemGroupFormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const columns = useMemo<SystemColumn<SystemGroupModel>[]>(
    () => [
      { key: "name", header: "Tên nhóm", cell: (item) => item.name },
      { key: "parent", header: "Nhóm cha", cell: (item) => item.parent ?? "-" },
      {
        key: "sort",
        header: "Thứ tự",
        cell: (item) => item.sort ?? 0,
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

  const loadSystemGroups = useCallback(
    (nextRequest = request) => adminApi.getSystemGroups(nextRequest),
    [request],
  )

  useEffect(() => {
    let active = true

    void loadSystemGroups(request)
      .then((result) => {
        if (!active) return
        setItems(result.data)
        setTotalRow(result.totalRow)
      })
      .catch((loadError: unknown) => {
        if (!active) return
        setError(loadError instanceof Error ? loadError.message : "Không tải được danh sách nhóm hệ thống.")
      })
      .finally(() => {
        if (!active) return
        setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [loadSystemGroups, request])

  useEffect(() => {
    let active = true

    void adminApi.getSystemGroupParentOptions().then((options) => {
      if (!active) return
      setParentOptions(normalizeParentOptions(options))
    })

    return () => {
      active = false
    }
  }, [])

  function refreshSystemGroups() {
    return loadSystemGroups(request).then((result) => {
      setItems(result.data)
      setTotalRow(result.totalRow)
    })
  }

  function closeSystemGroupDialog() {
    setDialogState(closeDialogState())
    setSystemGroupForm(createEmptySystemGroupForm())
    setFormErrors({})
    setIsSubmitting(false)
  }

  function openCreateSystemGroupDialog() {
    setError(null)
    setFormErrors({})
    setSystemGroupForm(createEmptySystemGroupForm())
    setDialogState(openCreateDialog())
  }

  async function openEditSystemGroupDialog(id: string) {
    setError(null)
    setFormErrors({})

    try {
      const detail = await adminApi.getSystemGroupById(id)
      setSystemGroupForm(createSystemGroupFormFromDetail(detail))
      setDialogState(openEditDialog(id))
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Không tải được chi tiết nhóm hệ thống.")
    }
  }

  async function submitSystemGroupForm(intent: EntityDialogSubmitIntent) {
    if (isSubmitting) return

    const validationErrors = validateSystemGroupForm(systemGroupForm)
    if (Object.keys(validationErrors).length > 0) {
      setFormErrors(validationErrors)
      return
    }

    setFormErrors({})
    setIsSubmitting(true)
    setDialogState((current) => ({ ...current, submitIntent: intent }))

    try {
      const requestBody = {
        id: systemGroupForm.id,
        name: systemGroupForm.name.trim(),
        parentId: systemGroupForm.parentId,
        sort: systemGroupForm.sort,
        folderUpload: systemGroupForm.folderUpload,
        isActived: systemGroupForm.isActived,
        isEdit: systemGroupForm.isEdit,
      }

      if (dialogState.mode === "edit") {
        await adminApi.updateSystemGroup(requestBody)
      } else {
        await adminApi.createSystemGroup(requestBody)
      }

      await refreshSystemGroups()

      if (intent === "saveAndAddMore" && dialogState.mode === "create") {
        setDialogState(openCreateDialog())
        setSystemGroupForm(createEmptySystemGroupForm())
        setFormErrors({})
        setIsSubmitting(false)
      } else {
        closeSystemGroupDialog()
      }
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Không thể lưu nhóm hệ thống.")
      setIsSubmitting(false)
    }
  }

  async function deleteSelectedSystemGroups() {
    if (selectedIds.length === 0) return

    setError(null)
    setIsLoading(true)

    try {
      await adminApi.deleteSystemGroups(selectedIds)
      setSelectedIds([])

      const refreshed = await loadSystemGroups(request)
      setItems(refreshed.data)
      setTotalRow(refreshed.totalRow)
    } catch (deleteError: unknown) {
      setError(
        deleteError instanceof Error ? deleteError.message : "Không thể xóa nhóm hệ thống.",
      )
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
          <Button onClick={openCreateSystemGroupDialog}>Thêm</Button>
          <ConfirmAction
            label="Xóa"
            confirmLabel="Xác nhận xóa"
            disabled={selectedIds.length === 0}
            onConfirm={deleteSelectedSystemGroups}
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
          emptyTitle="Không có nhóm hệ thống"
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
                <DropdownMenuItem onClick={() => void openEditSystemGroupDialog(item.id)}>
                  Sửa
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        />
      }
    >
      <SystemGroupFormDialog
        open={dialogState.isOpen}
        mode={dialogState.mode}
        value={systemGroupForm}
        parentOptions={parentOptions}
        errors={formErrors}
        isSubmitting={isSubmitting}
        submitIntent={dialogState.submitIntent}
        onOpenChange={(open) => {
          if (!open) {
            closeSystemGroupDialog()
          }
        }}
        onChange={setSystemGroupForm}
        onSave={() => void submitSystemGroupForm("save")}
        onSaveAndAddMore={() => void submitSystemGroupForm("saveAndAddMore")}
      />
    </SystemListPageScaffold>
  )
}
