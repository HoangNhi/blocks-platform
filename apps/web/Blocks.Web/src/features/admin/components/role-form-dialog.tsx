import { useEffect, useRef, useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Form } from "@/components/ui/form"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import type { PermissionGroupModel, RoleModel, RoleUpsertRequest } from "../types"
import {
  canUseSaveAndAddMore,
  type EntityDialogMode,
  type EntityDialogSubmitIntent,
} from "../entity-dialog-state"
import { CrudDialogFooter } from "./crud-dialog-footer"
import { RoleDetailsForm } from "./role-details-form"
import { RolePermissionMatrix } from "./role-permission-matrix"
import type { RolePermissionKey } from "../role-permission-state"

export type { RolePermissionKey } from "../role-permission-state"
export type RoleDialogTab = "details" | "permissions"
export type RoleFormValues = RoleUpsertRequest
export type RoleFormErrors = Partial<Record<"name" | "key", string>>

type RoleFormDialogProps = {
  open: boolean
  mode: EntityDialogMode | null
  value: RoleFormValues
  roleMetadata?: RoleModel
  errors: RoleFormErrors
  isSubmitting: boolean
  isSaveDisabled?: boolean
  submitIntent: EntityDialogSubmitIntent | null
  permissionGroups?: PermissionGroupModel[]
  changedCellCount?: number
  detailStatus?: "idle" | "loading" | "ready" | "error"
  detailError?: string | null
  permissionStatus?: "idle" | "loading" | "ready" | "error"
  isPermissionsLoading?: boolean
  permissionError?: string | null
  initialTab?: RoleDialogTab
  onOpenChange: (open: boolean) => void
  onRetryDetails?: () => void
  onTabChange?: (tab: RoleDialogTab) => void
  onChange: (next: RoleFormValues) => void
  onPermissionChange?: (menuId: string, key: RolePermissionKey, value: boolean) => void
  onRetryPermissions?: () => void
  onUndoPermissions?: () => void
  onSave: () => void
  onSaveAndAddMore: () => void
}

export function RoleFormDialog({
  open,
  mode,
  value,
  roleMetadata,
  errors,
  isSubmitting,
  isSaveDisabled = false,
  submitIntent,
  permissionGroups = [],
  changedCellCount = 0,
  detailStatus = "ready",
  detailError = null,
  permissionStatus = "idle",
  isPermissionsLoading = false,
  permissionError = null,
  initialTab = "details",
  onOpenChange,
  onRetryDetails,
  onTabChange,
  onChange,
  onPermissionChange,
  onRetryPermissions,
  onUndoPermissions,
  onSave,
  onSaveAndAddMore,
}: RoleFormDialogProps) {
  const isEditMode = mode === "edit"
  const isDetailsReady = !isEditMode || detailStatus === "ready"
  const summaryRef = useRef<HTMLDivElement>(null)
  const [activeTab, setActiveTab] = useState<RoleDialogTab>(() => (isEditMode ? initialTab : "details"))

  useEffect(() => {
    if (errors.name || errors.key) summaryRef.current?.focus()
  }, [errors.key, errors.name, isEditMode])

  const detailsContent = (
    <RoleDetailsForm
      value={value}
      errors={errors}
      isEditMode={isEditMode}
      metadata={roleMetadata}
      disabled={isSubmitting || !isDetailsReady}
      onChange={onChange}
    />
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[calc(100vh-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,1400px)]"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="shrink-0 px-6 pb-4 pt-6">
          <DialogTitle>{isEditMode ? "Chỉnh sửa vai trò" : "Thêm vai trò"}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {isEditMode
              ? "Cập nhật thông tin và quyền truy cập trong cùng một cửa sổ."
              : "Tạo vai trò mới. Sau khi tạo, bạn có thể mở lại để thiết lập phân quyền."}
          </p>
          {isEditMode ? (
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{value.name}</span>
              <span>{value.key}</span>
              {roleMetadata?.isProtected ? <Badge variant="secondary">Hệ thống</Badge> : null}
              {roleMetadata?.isDefaultRegistrationRole ? <Badge variant="outline">Mặc định đăng ký</Badge> : null}
            </div>
          ) : null}
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

          {isEditMode && detailStatus === "loading" ? (
            <div className="shrink-0 px-6 pb-3">
              <Alert>
                <AlertTitle>Đang tải thông tin vai trò</AlertTitle>
                <AlertDescription>Thông tin chỉnh sửa sẽ khả dụng sau khi tải xong.</AlertDescription>
              </Alert>
            </div>
          ) : null}

          {isEditMode && detailStatus === "error" ? (
            <div className="shrink-0 px-6 pb-3">
              <Alert variant="destructive" role="alert">
                <AlertTitle>Không thể tải thông tin vai trò</AlertTitle>
                <AlertDescription className="flex flex-wrap items-center gap-2">
                  <span>{detailError ?? "Không tải được thông tin vai trò."}</span>
                  {onRetryDetails ? (
                    <Button type="button" variant="outline" size="sm" onClick={onRetryDetails} aria-label="Thử lại thông tin vai trò">
                      Thử lại thông tin vai trò
                    </Button>
                  ) : null}
                </AlertDescription>
              </Alert>
            </div>
          ) : null}

          {isEditMode ? (
            <Tabs
              value={errors.name || errors.key ? "details" : activeTab}
              onValueChange={(tab) => {
                const nextTab = tab as RoleDialogTab
                setActiveTab(nextTab)
                onTabChange?.(nextTab)
              }}
              className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden"
            >
              <div className="shrink-0 border-b px-6">
                <TabsList variant="line" className="h-auto w-full justify-start gap-4 rounded-none bg-transparent p-0">
                  <TabsTrigger value="details" className="flex-none rounded-none px-1.5 py-3">
                    Thông tin
                  </TabsTrigger>
                  <TabsTrigger value="permissions" className="flex-none rounded-none px-1.5 py-3">
                    Phân quyền
                  </TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="details" className="min-h-0 flex-1 overflow-y-auto">
                {detailsContent}
              </TabsContent>
              <TabsContent value="permissions" className="min-h-0 flex flex-1 flex-col overflow-hidden px-6 py-5">
                <RolePermissionMatrix
                  permissionGroups={permissionGroups}
                  changedCellCount={changedCellCount}
                  status={permissionStatus}
                  isLoading={isPermissionsLoading}
                  error={permissionError}
                  disabled={isSubmitting}
                  onRetry={onRetryPermissions}
                  onPermissionChange={onPermissionChange}
                  onUndo={onUndoPermissions}
                />
              </TabsContent>
            </Tabs>
          ) : (
            <div className="min-h-0 flex-1 overflow-y-auto">{detailsContent}</div>
          )}

          <CrudDialogFooter
            mode={mode}
            isSubmitting={isSubmitting}
            isSaveDisabled={isSaveDisabled}
            submitIntent={submitIntent}
            onCancel={() => onOpenChange(false)}
            onSaveAndAddMore={canUseSaveAndAddMore(mode) ? onSaveAndAddMore : undefined}
          />
        </Form>
      </DialogContent>
    </Dialog>
  )
}
