import { Filter, MoreHorizontal, Plus, RefreshCw, Search } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ConfirmAction } from "@/features/admin/components/confirm-action"
import { InvitationsPanel } from "@/features/admin/components/invitations-panel"
import { SystemDataTable, type SystemColumn } from "@/features/admin/components/system-data-table"
import { UserFormDialog, type UserFormErrors, type UserFormValues } from "@/features/admin/components/user-form-dialog"
import { applyTextSearch, applyUserFilters, changePage, changePageSize, createDefaultUserPagingRequest, resetUserFilters } from "@/features/admin/system-list-state"
import { canUseSaveAndAddMore, closeDialogState, openCreateDialog, openEditDialog, type EntityDialogSubmitIntent } from "@/features/admin/entity-dialog-state"
import { createBrowserTokenStore } from "@/features/auth/token-store"
import { createFilesApi } from "@/features/files/files-api"
import { createApiClient } from "@/lib/api/client"

import { createSystemAdminApi } from "../system-admin-api"
import type { ComboboxOption, UserDetailModel, UserModel, UserPagingRequest } from "../types"

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
  return items.map((item) => ({ label: item.name, value: item.id }))
}

function validateUserForm(form: UserFormValues, isEditMode: boolean): UserFormErrors {
  const errors: UserFormErrors = {}

  if (!form.username.trim()) errors.username = "Tên đăng nhập không được để trống."
  if (!form.fullname.trim()) errors.fullname = "Họ và tên không được để trống."
  if (!form.email.trim()) {
    errors.email = "Email không được để trống."
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = "Email không hợp lệ."
  }
  if (!form.roleId.trim()) errors.roleId = "Vai trò không được để trống."
  if (!isEditMode && !form.password.trim()) errors.password = "Mật khẩu không được để trống."

  return errors
}

function getInitials(fullname: string) {
  const words = fullname.trim().split(/\s+/).filter(Boolean)
  return words.slice(-2).map((word) => word[0]).join("").toUpperCase() || "AV"
}

export function UsersPage() {
  const [items, setItems] = useState<UserModel[]>([])
  const [totalRow, setTotalRow] = useState(0)
  const [request, setRequest] = useState<UserPagingRequest>(createDefaultUserPagingRequest(20))
  const [searchTerm, setSearchTerm] = useState("")
  const [filtersOpen, setFiltersOpen] = useState(true)
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
      {
        key: "user",
        header: "Người dùng",
        cell: (item) => (
          <div className="flex min-w-[220px] items-center gap-3">
            <Avatar>
              <AvatarImage src={item.avatar ?? undefined} alt="" />
              <AvatarFallback>{getInitials(item.fullname)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="truncate font-medium text-foreground">{item.fullname}</div>
              <div className="truncate text-xs text-muted-foreground">{item.email}</div>
            </div>
          </div>
        ),
      },
      { key: "username", header: "Tài khoản", cell: (item) => <span className="font-medium">{item.username}</span> },
      { key: "role", header: "Vai trò", cell: (item) => item.roleName ?? item.role ?? "Chưa gán" },
      {
        key: "status",
        header: "Trạng thái",
        cell: (item) => (
          <Badge
            variant={item.isActived === false ? "outline" : "secondary"}
            className={item.isActived === false ? "text-muted-foreground" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-50"}
          >
            {item.isActived === false ? "Không hoạt động" : "Hoạt động"}
          </Badge>
        ),
      },
    ],
    [],
  )

  const loadUsers = useCallback(
    (nextRequest: UserPagingRequest = request) => adminApi.getUsers(nextRequest),
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
        if (active) setIsLoading(false)
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
        if (active) setRoleOptions(normalizeRoleOptions(result.data))
      })
      .catch(() => {
        if (active) setRoleOptions([])
      })

    return () => {
      active = false
    }
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

    const password = isEditMode ? userForm.password.trim() || userForm.passwordToken : userForm.password.trim()
    if (!password) {
      setFormErrors((current) => ({ ...current, password: "Mật khẩu không được để trống." }))
      return
    }

    setFormErrors({})
    setIsSubmitting(true)
    setDialogState((current) => ({ ...current, submitIntent: intent }))

    try {
      if (userForm.avatarFile) {
        await filesApi.uploadTemporary({ folderName: userForm.folderUpload, files: [userForm.avatarFile] })
      }

      const requestBody = {
        id: userForm.id,
        username: userForm.username.trim(),
        fullname: userForm.fullname.trim(),
        password,
        roleId: userForm.roleId,
        email: userForm.email.trim(),
        avatar: userForm.avatar,
        folderUpload: userForm.avatarFile ? userForm.folderUpload : "",
        isActived: userForm.isActived,
        isEdit: userForm.isEdit,
        sort: userForm.sort,
      }

      if (isEditMode) await adminApi.updateUser(requestBody)
      else await adminApi.createUser(requestBody)

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
      setError(deleteError instanceof Error ? deleteError.message : "Không thể xóa tài khoản.")
    } finally {
      setIsLoading(false)
    }
  }

  const activeFilterCount = Number(Boolean(request.roleId)) + Number(request.isActived !== undefined)
  const currentRoleFilter = request.roleId ?? "all"
  const currentStatusFilter = request.isActived === undefined ? "all" : request.isActived ? "active" : "inactive"

  return (
    <div className="mx-auto flex w-full max-w-[1500px] min-h-0 flex-col gap-5 px-4 py-5 md:px-6">
      <div className="space-y-1 border-b pb-5">
        <h1 className="text-2xl font-semibold tracking-tight">Người dùng</h1>
        <p className="text-sm text-muted-foreground">Quản lý tài khoản, vai trò và quyền truy cập hệ thống.</p>
      </div>

      <Tabs defaultValue="users" className="min-h-0 gap-3">
        <TabsList variant="line" className="w-full justify-start gap-4 rounded-none border-b p-0">
          <TabsTrigger value="users" className="flex-none rounded-none px-1.5 py-3">Tài khoản</TabsTrigger>
          <TabsTrigger value="invitations" className="flex-none rounded-none px-1.5 py-3">Lời mời</TabsTrigger>
        </TabsList>

      <TabsContent value="users" className="min-h-0">
        <Card className="gap-0 overflow-hidden rounded-xl border-platform-border bg-background py-0 shadow-none ring-0">
          <div className="border-b p-4">
            <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
              <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                <div className="flex min-w-0 flex-1 gap-2">
                  <div className="relative min-w-0 flex-1 xl:max-w-[460px]">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <Input
                      type="search"
                      className="h-10 pl-9"
                      value={searchTerm}
                      placeholder="Tìm tên, tài khoản hoặc email..."
                      aria-label="Tìm tên, tài khoản hoặc email"
                      onChange={(event) => setSearchTerm(event.target.value)}
                    />
                  </div>
                  <CollapsibleTrigger asChild>
                    <Button type="button" variant={filtersOpen ? "secondary" : "outline"} className="gap-2">
                      <Filter className="size-4" aria-hidden="true" />
                      Bộ lọc
                      {activeFilterCount > 0 ? <Badge variant="secondary" className="h-5 min-w-5 px-1.5">{activeFilterCount}</Badge> : null}
                    </Button>
                  </CollapsibleTrigger>
                  <Button type="button" variant="outline" size="icon" aria-label="Làm mới danh sách" onClick={() => { setError(null); setIsLoading(true); setRequest((current) => ({ ...current })) }}>
                    <RefreshCw className="size-4" aria-hidden="true" />
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <ConfirmAction
                    label={selectedIds.length > 0 ? `Xóa danh sách (${selectedIds.length})` : "Xóa danh sách"}
                    confirmLabel="Xác nhận xóa"
                    disabled={selectedIds.length === 0}
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onConfirm={deleteSelectedUsers}
                  />
                  <Button type="button" onClick={openCreateUserDialog}>
                    <Plus className="size-4" aria-hidden="true" />
                    Thêm tài khoản
                  </Button>
                </div>
              </div>

              <CollapsibleContent className="mt-3">
                <div className="rounded-lg border p-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-2 text-xs font-medium text-muted-foreground">
                        Vai trò
                        <Select
                          value={currentRoleFilter}
                          onValueChange={(roleId) => {
                            setError(null)
                            setIsLoading(true)
                            setSelectedIds([])
                            setRequest((current) => applyUserFilters(current, { roleId: roleId === "all" ? undefined : roleId, isActived: current.isActived }))
                          }}
                        >
                          <SelectTrigger className="h-10 w-full sm:w-[220px]" aria-label="Vai trò"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Tất cả vai trò</SelectItem>
                            {roleOptions.map((role) => <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </label>
                      <label className="grid gap-2 text-xs font-medium text-muted-foreground">
                        Trạng thái
                        <Select
                          value={currentStatusFilter}
                          onValueChange={(status) => {
                            setError(null)
                            setIsLoading(true)
                            setSelectedIds([])
                            setRequest((current) => applyUserFilters(current, { roleId: current.roleId, isActived: status === "all" ? undefined : status === "active" }))
                          }}
                        >
                          <SelectTrigger className="h-10 w-full sm:w-[220px]" aria-label="Trạng thái"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Tất cả trạng thái</SelectItem>
                            <SelectItem value="active">Hoạt động</SelectItem>
                            <SelectItem value="inactive">Không hoạt động</SelectItem>
                          </SelectContent>
                        </Select>
                      </label>
                    </div>
                    <Button type="button" variant="outline" onClick={() => { setError(null); setIsLoading(true); setSelectedIds([]); setRequest((current) => resetUserFilters(current)) }}>
                      Đặt lại bộ lọc
                    </Button>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>

          <div className="border-b px-4 py-3 text-sm text-muted-foreground">
            {totalRow} tài khoản{activeFilterCount > 0 ? ` · ${activeFilterCount} bộ lọc đang áp dụng` : ""}
          </div>

          <SystemDataTable
            variant="embedded"
            showRefresh={false}
            className="min-w-0"
            columns={columns}
            items={items}
            getRowKey={(item) => item.id}
            selection={{ selectedIds, onSelectedIdsChange: setSelectedIds }}
            pageIndex={request.pageIndex}
            pageSize={request.pageSize}
            totalRow={totalRow}
            onPageChange={(pageIndex) => { setError(null); setIsLoading(true); setRequest((current) => changePage(current, pageIndex)) }}
            onPageSizeChange={(pageSize) => { setError(null); setIsLoading(true); setRequest((current) => changePageSize(current, pageSize)) }}
            onRefresh={() => { setError(null); setIsLoading(true); setRequest((current) => ({ ...current })) }}
            isLoading={isLoading}
            error={error}
            emptyTitle="Không có tài khoản"
            emptyDescription="Không có dữ liệu phù hợp với bộ lọc hiện tại."
            rowActions={(item) => (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label={`Mở thao tác hàng ${item.username}`}>
                    <MoreHorizontal className="size-4" aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-32">
                  <DropdownMenuItem onClick={() => void openEditUserDialog(item.id)}>Sửa</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          />
        </Card>
      </TabsContent>

      <TabsContent value="invitations" className="min-h-0 overflow-auto">
        <InvitationsPanel adminApi={adminApi} />
      </TabsContent>

      <UserFormDialog
        open={dialogState.isOpen}
        mode={dialogState.mode}
        value={userForm}
        roleOptions={roleOptions}
        errors={formErrors}
        isSubmitting={isSubmitting}
        submitIntent={dialogState.submitIntent}
        onOpenChange={(open) => { if (!open) closeUserDialog() }}
        onChange={setUserForm}
        onSave={() => void submitUserForm("save")}
        onSaveAndAddMore={() => void submitUserForm("saveAndAddMore")}
      />
      </Tabs>
    </div>
  )
}
