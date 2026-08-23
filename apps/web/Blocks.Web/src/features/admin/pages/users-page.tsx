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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { InvitationsPanel } from "../components/invitations-panel"
import { ConfirmAction } from "@/features/admin/components/confirm-action"
import { UserFormDialog, type UserFormErrors, type UserFormValues } from "@/features/admin/components/user-form-dialog"
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
  canUseSaveAndAddMore,
  closeDialogState,
  openCreateDialog,
  openEditDialog,
  type EntityDialogSubmitIntent,
} from "@/features/admin/entity-dialog-state"
import { createBrowserTokenStore } from "@/features/auth/token-store"
import { createFilesApi } from "@/features/files/files-api"
import { createApiClient } from "@/lib/api/client"

import { createSystemAdminApi } from "../system-admin-api"
import type { ComboboxOption, UserDetailModel, UserModel } from "../types"

const tokenStore = createBrowserTokenStore()
const apiClient = createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? "/",
  getAccessToken: tokenStore.getAccessToken,
})
const adminApi = createSystemAdminApi(apiClient)
const filesApi = createFilesApi(apiClient)

function createEmptyUserForm(): UserFormValues {
  return {
    id: crypto.randomUUID(),
    username: "",
    fullname: "",
    email: "",
    roleId: "",
    password: "",
    passwordToken: "",
    avatar: null,
    avatarFile: null,
    folderUpload: crypto.randomUUID(),
    isActived: true,
    isEdit: false,
    sort: 0,
  }
}

function createUserFormFromDetail(detail: UserDetailModel): UserFormValues {
  return {
    id: detail.id,
    username: detail.username,
    fullname: detail.fullname,
    email: detail.email,
    roleId: detail.roleId,
    password: "",
    passwordToken: detail.password,
    avatar: detail.avatar ?? null,
    avatarFile: null,
    folderUpload: crypto.randomUUID(),
    isActived: detail.isActived ?? true,
    isEdit: true,
    sort: detail.sort ?? 0,
  }
}

function normalizeRoleOptions(items: { id: string; name: string }[]): ComboboxOption[] {
  return items.map((item) => ({
    label: item.name,
    value: item.id,
  }))
}

function validateUserForm(form: UserFormValues, isEditMode: boolean): UserFormErrors {
  const errors: UserFormErrors = {}

  if (!form.username.trim()) {
    errors.username = "Tên đăng nhập không được để trống."
  }

  if (!form.fullname.trim()) {
    errors.fullname = "Họ và tên không được để trống."
  }

  if (!form.email.trim()) {
    errors.email = "Email không được để trống."
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = "Email không hợp lệ."
  }

  if (!form.roleId.trim()) {
    errors.roleId = "Vai trò không được để trống."
  }

  if (!isEditMode && !form.password.trim()) {
    errors.password = "Mật khẩu không được để trống."
  }

  return errors
}

export function UsersPage() {
  const [items, setItems] = useState<UserModel[]>([])
  const [totalRow, setTotalRow] = useState(0)
  const [request, setRequest] = useState(createDefaultPagingRequest(20))
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [roleOptions, setRoleOptions] = useState<ComboboxOption[]>([])
  const [dialogState, setDialogState] = useState(closeDialogState())
  const [userForm, setUserForm] = useState<UserFormValues>(createEmptyUserForm())
  const [formErrors, setFormErrors] = useState<UserFormErrors>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const columns = useMemo<SystemColumn<UserModel>[]>(
    () => [
      { key: "username", header: "Tên đăng nhập", cell: (item) => item.username },
      { key: "fullname", header: "Họ và tên", cell: (item) => item.fullname },
      {
        key: "role",
        header: "Vai trò",
        cell: (item) => item.roleName ?? item.role ?? "Chưa gán",
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

  const loadUsers = useCallback(
    (nextRequest = request) => adminApi.getUsers(nextRequest),
    [request],
  )

  useEffect(() => {
    let active = true

    void loadUsers(request)
      .then((result) => {
        if (!active) return
        setItems(result.data)
        setTotalRow(result.totalRow)
      })
      .catch((loadError: unknown) => {
        if (!active) return
        setError(loadError instanceof Error ? loadError.message : "Không tải được danh sách tài khoản.")
      })
      .finally(() => {
        if (!active) return
        setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [loadUsers, request])

  useEffect(() => {
    let active = true

    void adminApi
      .getRoles({ pageIndex: 1, pageSize: 100, textSearch: "" })
      .then((result) => {
        if (!active) return
        setRoleOptions(normalizeRoleOptions(result.data))
      })
      .catch(() => {
        if (!active) return
        setRoleOptions([])
      })

    return () => {
      active = false
    }
  }, [])

  function refreshUsers() {
    return loadUsers(request).then((result) => {
      setItems(result.data)
      setTotalRow(result.totalRow)
    })
  }

  function closeUserDialog() {
    setDialogState(closeDialogState())
    setUserForm(createEmptyUserForm())
    setFormErrors({})
    setIsSubmitting(false)
  }

  function openCreateUserDialog() {
    setError(null)
    setFormErrors({})
    setUserForm(createEmptyUserForm())
    setDialogState(openCreateDialog())
  }

  async function openEditUserDialog(id: string) {
    setError(null)
    setFormErrors({})

    try {
      const detail = await adminApi.getUserById(id)
      setUserForm(createUserFormFromDetail(detail))
      setDialogState(openEditDialog(id))
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "Không tải được chi tiết tài khoản.")
    }
  }

  async function submitUserForm(intent: EntityDialogSubmitIntent) {
    if (isSubmitting) return

    const isEditMode = dialogState.mode === "edit"
    const validationErrors = validateUserForm(userForm, isEditMode)

    if (Object.keys(validationErrors).length > 0) {
      setFormErrors(validationErrors)
      return
    }

    const password = isEditMode
      ? userForm.password.trim() || userForm.passwordToken
      : userForm.password.trim()

    if (!password) {
      setFormErrors((current) => ({
        ...current,
        password: "Mật khẩu không được để trống.",
      }))
      return
    }

    setFormErrors({})
    setIsSubmitting(true)
    setDialogState((current) => ({ ...current, submitIntent: intent }))

    try {
      if (userForm.avatarFile) {
        await filesApi.uploadTemporary({
          folderName: userForm.folderUpload,
          files: [userForm.avatarFile],
        })
      }

      const requestBody = {
        id: userForm.id,
        username: userForm.username.trim(),
        fullname: userForm.fullname.trim(),
        password,
        roleId: userForm.roleId,
        email: userForm.email.trim(),
        avatar: userForm.avatar,
        folderUpload: userForm.folderUpload,
        isActived: userForm.isActived,
        isEdit: userForm.isEdit,
        sort: userForm.sort,
      }

      if (isEditMode) {
        await adminApi.updateUser(requestBody)
      } else {
        await adminApi.createUser(requestBody)
      }

      await refreshUsers()

      if (intent === "saveAndAddMore" && !isEditMode && canUseSaveAndAddMore("create")) {
        setDialogState(openCreateDialog())
        setUserForm(createEmptyUserForm())
        setFormErrors({})
        setIsSubmitting(false)
      } else {
        closeUserDialog()
      }
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Không thể lưu tài khoản.")
      setIsSubmitting(false)
    }
  }

  async function deleteSelectedUsers() {
    if (selectedIds.length === 0) return

    setError(null)
    setIsLoading(true)

    try {
      await adminApi.deleteUsers(selectedIds)
      setSelectedIds([])

      const refreshed = await loadUsers(request)
      setItems(refreshed.data)
      setTotalRow(refreshed.totalRow)
    } catch (deleteError: unknown) {
      setError(
        deleteError instanceof Error ? deleteError.message : "Không thể xóa tài khoản.",
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Tabs defaultValue="users" className="h-full min-h-0">
      <TabsList>
        <TabsTrigger value="users">Tài khoản</TabsTrigger>
        <TabsTrigger value="invitations">Lời mời</TabsTrigger>
      </TabsList>
      <TabsContent value="users" className="min-h-0 flex-1">
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
          <Button onClick={openCreateUserDialog}>Thêm</Button>
          <ConfirmAction
            label="Xóa"
            confirmLabel="Xác nhận xóa"
            disabled={selectedIds.length === 0}
            onConfirm={deleteSelectedUsers}
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
          emptyTitle="Không có tài khoản"
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
                <DropdownMenuItem onClick={() => void openEditUserDialog(item.id)}>
                  Sửa
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        />
      }
    >
      <UserFormDialog
        open={dialogState.isOpen}
        mode={dialogState.mode}
        value={userForm}
        roleOptions={roleOptions}
        errors={formErrors}
        isSubmitting={isSubmitting}
        submitIntent={dialogState.submitIntent}
        onOpenChange={(open) => {
          if (!open) {
            closeUserDialog()
          }
        }}
        onChange={setUserForm}
        onSave={() => void submitUserForm("save")}
        onSaveAndAddMore={() => void submitUserForm("saveAndAddMore")}
      />
    </SystemListPageScaffold>
      </TabsContent>
      <TabsContent value="invitations" className="min-h-0 flex-1 overflow-auto">
        <InvitationsPanel adminApi={adminApi} />
      </TabsContent>
    </Tabs>
  )
}
