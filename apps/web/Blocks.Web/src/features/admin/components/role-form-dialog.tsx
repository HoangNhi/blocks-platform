import { useEffect, useRef } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Form, FormDescription, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"

import type { RoleUpsertRequest } from "../types"
import {
  canUseSaveAndAddMore,
  type EntityDialogMode,
  type EntityDialogSubmitIntent,
} from "../entity-dialog-state"
import { CrudDialogFooter } from "./crud-dialog-footer"

export type RoleFormValues = RoleUpsertRequest

export type RoleFormErrors = Partial<Record<"name" | "key", string>>

type RoleFormDialogProps = {
  open: boolean
  mode: EntityDialogMode | null
  value: RoleFormValues
  errors: RoleFormErrors
  isSubmitting: boolean
  submitIntent: EntityDialogSubmitIntent | null
  onOpenChange: (open: boolean) => void
  onChange: (next: RoleFormValues) => void
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
  onOpenChange,
  onChange,
  onSave,
  onSaveAndAddMore,
}: RoleFormDialogProps) {
  const isEditMode = mode === "edit"
  const summaryRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (errors.name || errors.key) summaryRef.current?.focus()
  }, [errors.key, errors.name])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-1.5rem)] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Chỉnh sửa vai trò" : "Thêm vai trò"}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {isEditMode ? "Cập nhật thông tin vai trò hiện có." : "Tạo vai trò mới trong System."}
          </p>
        </DialogHeader>

        <Form
          className="gap-0"
          aria-describedby={errors.name || errors.key ? "role-form-summary" : undefined}
          onSubmit={(event) => {
            event.preventDefault()
            onSave()
          }}
        >
          <div className="grid gap-4 px-6 py-5">
            {errors.name || errors.key ? (
              <Alert ref={summaryRef} variant="destructive" role="alert" tabIndex={-1} id="role-form-summary">
                <AlertTitle>Kiểm tra thông tin vai trò</AlertTitle>
                <AlertDescription>Điền đủ tên và mã ổn định trước khi lưu.</AlertDescription>
              </Alert>
            ) : null}
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
            <label htmlFor="role-registration-eligible" className="flex items-start gap-3 rounded-lg border border-border/70 px-3 py-2 text-sm">
              <Checkbox
                id="role-registration-eligible"
                checked={value.isRegistrationEligible}
                onCheckedChange={(checked) => onChange({ ...value, isRegistrationEligible: checked === true })}
                disabled={value.key === "administrator" || value.key === "operator"}
                aria-describedby="role-registration-eligible-help"
              />
              <span>
                <span className="font-medium">Được phép đăng ký</span>
                <span id="role-registration-eligible-help" className="block text-xs text-muted-foreground">Vai trò đặc quyền không được dùng làm vai trò đăng ký.</span>
              </span>
            </label>
          </div>

          <CrudDialogFooter
            mode={mode}
            isSubmitting={isSubmitting}
            submitIntent={submitIntent}
            onCancel={() => onOpenChange(false)}
            onSaveAndAddMore={
              canUseSaveAndAddMore(mode) ? onSaveAndAddMore : undefined
            }
          />
        </Form>
      </DialogContent>
    </Dialog>
  )
}
