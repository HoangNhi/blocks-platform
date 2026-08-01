import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Form, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"

import type { RoleUpsertRequest } from "../types"
import {
  canUseSaveAndAddMore,
  type EntityDialogMode,
  type EntityDialogSubmitIntent,
} from "../entity-dialog-state"
import { CrudDialogFooter } from "./crud-dialog-footer"

export type RoleFormValues = RoleUpsertRequest

export type RoleFormErrors = Partial<Record<"name", string>>

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-1.5rem)] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Chỉnh sửa vai trò" : "Thêm vai trò"}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {isEditMode ? "Cập nhật tên vai trò hiện có." : "Tạo vai trò mới trong System."}
          </p>
        </DialogHeader>

        <Form
          className="gap-0"
          onSubmit={(event) => {
            event.preventDefault()
            onSave()
          }}
        >
          <div className="grid gap-4 px-6 py-5">
            <FormItem>
              <FormLabel htmlFor="role-name">Tên vai trò</FormLabel>
              <Input
                id="role-name"
                value={value.name}
                onChange={(event) => onChange({ ...value, name: event.target.value })}
                aria-invalid={Boolean(errors.name)}
              />
              {errors.name ? <FormMessage>{errors.name}</FormMessage> : null}
            </FormItem>
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
