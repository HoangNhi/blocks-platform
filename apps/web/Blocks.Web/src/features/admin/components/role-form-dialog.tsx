import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import { Search } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Form, FormDescription, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import type { PermissionGroupModel, RoleUpsertRequest } from "../types"
import {
  canUseSaveAndAddMore,
  type EntityDialogMode,
  type EntityDialogSubmitIntent,
} from "../entity-dialog-state"
import { CrudDialogFooter } from "./crud-dialog-footer"

const permissionColumns = [
  { key: "isViewed", label: "Xem", capability: "canView" },
  { key: "isAdded", label: "Thêm", capability: "canAdd" },
  { key: "isUpdated", label: "Cập nhật", capability: "canUpdate" },
  { key: "isDeleted", label: "Xóa", capability: "canDelete" },
  { key: "isApproved", label: "Duyệt", capability: "canApprove" },
  { key: "isAnalyzed", label: "Thống kê", capability: "canAnalyze" },
] as const

export type RolePermissionKey = (typeof permissionColumns)[number]["key"]
export type RoleDialogTab = "details" | "permissions"
export type RoleFormValues = RoleUpsertRequest
export type RoleFormErrors = Partial<Record<"name" | "key", string>>

type RoleFormDialogProps = {
  open: boolean
  mode: EntityDialogMode | null
  value: RoleFormValues
  errors: RoleFormErrors
  isSubmitting: boolean
  submitIntent: EntityDialogSubmitIntent | null
  permissionGroups?: PermissionGroupModel[]
  isPermissionsLoading?: boolean
  permissionError?: string | null
  permissionsDirty?: boolean
  initialTab?: RoleDialogTab
  onOpenChange: (open: boolean) => void
  onChange: (next: RoleFormValues) => void
  onPermissionChange?: (menuId: string, key: RolePermissionKey, value: boolean) => void
  onSave: () => void
  onSaveAndAddMore: () => void
}

export function RoleFormDialog({
  open,
  mode,
  value,
  errors,
  isSubmitting,
  submitIntent,
  permissionGroups = [],
  isPermissionsLoading = false,
  permissionError = null,
  permissionsDirty = false,
  initialTab = "details",
  onOpenChange,
  onChange,
  onPermissionChange,
  onSave,
  onSaveAndAddMore,
}: RoleFormDialogProps) {
  const isEditMode = mode === "edit"
  const summaryRef = useRef<HTMLDivElement>(null)
  const [activeTab, setActiveTab] = useState<RoleDialogTab>("details")
  const [permissionSearch, setPermissionSearch] = useState("")

  useEffect(() => {
    if (errors.name || errors.key) summaryRef.current?.focus()
  }, [errors.key, errors.name])

  useEffect(() => {
    if (!open) return
    setActiveTab(isEditMode ? initialTab : "details")
    setPermissionSearch("")
  }, [initialTab, isEditMode, open])

  const filteredPermissionGroups = useMemo(() => {
    const search = permissionSearch.trim().toLowerCase()
    if (!search) return permissionGroups

    return permissionGroups
      .map((group) => {
        const groupMatches = group.systemGroup.toLowerCase().includes(search)
        const roles = groupMatches
          ? group.roles
          : group.roles.filter((permission) =>
              [permission.name, permission.permissionKey]
                .filter(Boolean)
                .some((value) => value!.toLowerCase().includes(search)),
            )

        return { ...group, roles }
      })
      .filter((group) => group.roles.length > 0)
  }, [permissionGroups, permissionSearch])

  const detailsContent = (
    <div className="grid gap-4 px-6 py-5">
      <FormItem>
        <FormLabel htmlFor="role-name">Tên vai trò</FormLabel>
        <Input
          id="role-name"
          value={value.name}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
          aria-invalid={Boolean(errors.name)}
          aria-describedby={errors.name ? "role-name-error" : undefined}
        />
        {errors.name ? <FormMessage id="role-name-error">{errors.name}</FormMessage> : null}
      </FormItem>
      <FormItem>
        <FormLabel htmlFor="role-key">Mã vai trò ổn định</FormLabel>
        <Input
          id="role-key"
          value={value.key}
          onChange={(event) => onChange({ ...value, key: event.target.value })}
          aria-invalid={Boolean(errors.key)}
          aria-describedby={errors.key ? "role-key-error" : "role-key-help"}
          disabled={isEditMode && value.key === "member"}
        />
        <FormDescription id="role-key-help">Mã không đổi sau khi dùng trong phân quyền.</FormDescription>
        {errors.key ? <FormMessage id="role-key-error">{errors.key}</FormMessage> : null}
      </FormItem>
      <label
        htmlFor="role-registration-eligible"
        className="flex items-start gap-3 rounded-lg border border-border/70 px-3 py-3 text-sm"
      >
        <Checkbox
          id="role-registration-eligible"
          checked={value.isRegistrationEligible}
          onCheckedChange={(checked) => onChange({ ...value, isRegistrationEligible: checked === true })}
          disabled={value.key === "administrator" || value.key === "operator"}
          aria-describedby="role-registration-eligible-help"
        />
        <span>
          <span className="font-medium">Được phép đăng ký</span>
          <span id="role-registration-eligible-help" className="block text-xs text-muted-foreground">
            Vai trò đặc quyền không được dùng làm vai trò đăng ký.
          </span>
        </span>
      </label>
    </div>
  )

  const permissionsContent = (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-6 py-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={permissionSearch}
            placeholder="Tìm chức năng hoặc nhóm quyền..."
            className="pl-9"
            onChange={(event) => setPermissionSearch(event.target.value)}
          />
        </div>
        <Badge variant={permissionsDirty ? "default" : "secondary"}>
          {permissionsDirty ? "Có thay đổi chưa lưu" : "Đã đồng bộ"}
        </Badge>
      </div>

      {permissionError ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Không thể tải phân quyền</AlertTitle>
          <AlertDescription>{permissionError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto rounded-lg border">
        <Table containerClassName="overflow-visible">
          <TableHeader>
            <TableRow>
              <TableHead className="sticky top-0 z-10 min-w-[260px] bg-card">Chức năng</TableHead>
              {permissionColumns.map((column) => (
                <TableHead key={column.key} className="sticky top-0 z-10 min-w-[92px] bg-card text-center">
                  {column.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isPermissionsLoading ? (
              <TableRow>
                <TableCell colSpan={permissionColumns.length + 1} className="py-10 text-center text-sm text-muted-foreground">
                  Đang tải phân quyền...
                </TableCell>
              </TableRow>
            ) : filteredPermissionGroups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={permissionColumns.length + 1} className="py-10 text-center text-sm text-muted-foreground">
                  Không có quyền phù hợp với bộ lọc hiện tại.
                </TableCell>
              </TableRow>
            ) : (
              filteredPermissionGroups.map((group) => (
                <Fragment key={group.systemGroup}>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableCell colSpan={permissionColumns.length + 1} className="py-2 font-semibold text-foreground">
                      {group.systemGroup}
                    </TableCell>
                  </TableRow>
                  {group.roles.map((permission) => (
                    <TableRow key={permission.menuId}>
                      <TableCell>
                        <div className="font-medium">{permission.name ?? "Chức năng chưa đặt tên"}</div>
                        {permission.permissionKey ? (
                          <div className="text-xs text-muted-foreground">{permission.permissionKey}</div>
                        ) : null}
                      </TableCell>
                      {permissionColumns.map((column) => {
                        const supported = permission[column.capability]
                        const label = `${column.label} ${permission.name ?? permission.permissionKey ?? "chức năng"}`

                        return (
                          <TableCell key={`${permission.menuId}-${column.key}`} className="text-center">
                            {supported ? (
                              <Checkbox
                                checked={permission[column.key]}
                                onCheckedChange={(checked) =>
                                  onPermissionChange?.(permission.menuId, column.key, checked === true)
                                }
                                aria-label={label}
                              />
                            ) : (
                              <span
                                className="inline-flex min-h-5 min-w-5 items-center justify-center text-muted-foreground/70"
                                role="img"
                                aria-label={`${label} không được hỗ trợ`}
                                title={`${column.label} không được hỗ trợ cho chức năng này`}
                              >
                                —
                              </span>
                            )}
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  ))}
                </Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[calc(100vh-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="shrink-0 px-6 pb-4 pt-6">
          <DialogTitle>{isEditMode ? "Chỉnh sửa vai trò" : "Thêm vai trò"}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {isEditMode
              ? "Cập nhật thông tin vai trò và thiết lập quyền truy cập trong cùng một cửa sổ."
              : "Tạo vai trò mới. Sau khi tạo, bạn có thể mở lại vai trò để thiết lập phân quyền."}
          </p>
        </DialogHeader>

        <Form
          className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden"
          aria-describedby={errors.name || errors.key ? "role-form-summary" : undefined}
          onSubmit={(event) => {
            event.preventDefault()
            onSave()
          }}
        >
          {errors.name || errors.key ? (
            <div className="shrink-0 px-6 pb-3">
              <Alert ref={summaryRef} variant="destructive" role="alert" tabIndex={-1} id="role-form-summary">
                <AlertTitle>Kiểm tra thông tin vai trò</AlertTitle>
                <AlertDescription>Điền đủ tên và mã ổn định trước khi lưu.</AlertDescription>
              </Alert>
            </div>
          ) : null}

          {isEditMode ? (
            <Tabs
              value={activeTab}
              onValueChange={(value) => setActiveTab(value as RoleDialogTab)}
              className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden"
            >
              <div className="shrink-0 border-b px-6">
                <TabsList className="h-auto bg-transparent p-0">
                  <TabsTrigger value="details" className="rounded-none border-b-2 border-transparent px-1.5 py-3 data-[state=active]:border-foreground data-[state=active]:bg-transparent">
                    Thông tin
                  </TabsTrigger>
                  <TabsTrigger value="permissions" className="rounded-none border-b-2 border-transparent px-1.5 py-3 data-[state=active]:border-foreground data-[state=active]:bg-transparent">
                    Phân quyền
                  </TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="details" className="min-h-0 flex-1 overflow-y-auto">
                {detailsContent}
              </TabsContent>
              <TabsContent value="permissions" className="min-h-0 flex-1 overflow-hidden">
                {permissionsContent}
              </TabsContent>
            </Tabs>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">{detailsContent}</div>
          )}

          <CrudDialogFooter
            mode={mode}
            isSubmitting={isSubmitting}
            submitIntent={submitIntent}
            onCancel={() => onOpenChange(false)}
            onSaveAndAddMore={canUseSaveAndAddMore(mode) ? onSaveAndAddMore : undefined}
          />
        </Form>
      </DialogContent>
    </Dialog>
  )
}
