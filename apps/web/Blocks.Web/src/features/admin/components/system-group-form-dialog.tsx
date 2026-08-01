import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Form, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import type { ComboboxOption, SystemGroupUpsertRequest } from "../types"
import {
  canUseSaveAndAddMore,
  type EntityDialogMode,
  type EntityDialogSubmitIntent,
} from "../entity-dialog-state"
import { CrudDialogFooter } from "./crud-dialog-footer"

export type SystemGroupFormValues = SystemGroupUpsertRequest

export type SystemGroupFormErrors = Partial<Record<"name", string>>

type SystemGroupFormDialogProps = {
  open: boolean
  mode: EntityDialogMode | null
  value: SystemGroupFormValues
  parentOptions: ComboboxOption[]
  errors: SystemGroupFormErrors
  isSubmitting: boolean
  submitIntent: EntityDialogSubmitIntent | null
  onOpenChange: (open: boolean) => void
  onChange: (next: SystemGroupFormValues) => void
  onSave: () => void
  onSaveAndAddMore: () => void
}

export function SystemGroupFormDialog({
  open,
  mode,
  value,
  parentOptions,
  errors,
  isSubmitting,
  submitIntent,
  onOpenChange,
  onChange,
  onSave,
  onSaveAndAddMore,
}: SystemGroupFormDialogProps) {
  const isEditMode = mode === "edit"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-1.5rem)] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Chỉnh sửa nhóm hệ thống" : "Thêm nhóm hệ thống"}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {isEditMode ? "Cập nhật nhóm hệ thống hiện có." : "Tạo nhóm hệ thống mới."}
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
              <FormLabel htmlFor="system-group-name">Tên nhóm</FormLabel>
              <Input
                id="system-group-name"
                value={value.name}
                onChange={(event) => onChange({ ...value, name: event.target.value })}
                aria-invalid={Boolean(errors.name)}
              />
              {errors.name ? <FormMessage>{errors.name}</FormMessage> : null}
            </FormItem>

            <div className="grid gap-4 md:grid-cols-2">
              <FormItem>
                <FormLabel htmlFor="system-group-sort">Thứ tự</FormLabel>
                <Input
                  id="system-group-sort"
                  type="number"
                  value={String(value.sort ?? 0)}
                  onChange={(event) =>
                    onChange({ ...value, sort: Number(event.target.value || 0) })
                  }
                />
              </FormItem>
              <FormItem>
                <FormLabel htmlFor="system-group-parent">Nhóm cha</FormLabel>
                <Select
                  value={value.parentId ?? ""}
                  onValueChange={(parentId) =>
                    onChange({
                      ...value,
                      parentId: parentId || null,
                    })
                  }
                >
                  <SelectTrigger id="system-group-parent" aria-label="Nhóm cha">
                    <SelectValue placeholder="Không có nhóm cha" />
                  </SelectTrigger>
                  <SelectContent>
                    {parentOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormItem>
            </div>

            <label className="flex items-center gap-2 rounded-lg border border-border/70 px-3 py-2 text-sm">
              <Checkbox
                checked={value.isActived}
                onCheckedChange={(checked) =>
                  onChange({ ...value, isActived: checked === true })
                }
              />
              <span>Đang hoạt động</span>
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
