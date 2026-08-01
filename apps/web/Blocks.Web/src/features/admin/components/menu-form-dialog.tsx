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
import { ScrollArea } from "@/components/ui/scroll-area"

import type { ComboboxOption, MenuUpsertRequest } from "../types"
import {
  canUseSaveAndAddMore,
  type EntityDialogMode,
  type EntityDialogSubmitIntent,
} from "../entity-dialog-state"
import { CrudDialogFooter } from "./crud-dialog-footer"

export type MenuFormValues = MenuUpsertRequest

export type MenuFormErrors = Partial<Record<"name" | "controller" | "systemGroupId", string>>

type MenuFormDialogProps = {
  open: boolean
  mode: EntityDialogMode | null
  value: MenuFormValues
  systemGroupOptions: ComboboxOption[]
  errors: MenuFormErrors
  isSubmitting: boolean
  submitIntent: EntityDialogSubmitIntent | null
  onOpenChange: (open: boolean) => void
  onChange: (next: MenuFormValues) => void
  onSave: () => void
  onSaveAndAddMore: () => void
}

function updateMenuValue(
  current: MenuFormValues,
  key: keyof MenuFormValues,
  value: string | number | boolean | null,
) {
  return {
    ...current,
    [key]: value,
  }
}

function CheckboxField({
  id,
  label,
  checked,
  onCheckedChange,
}: {
  id: string
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}) {
  return (
    <label
      htmlFor={id}
      className="flex items-center gap-2 rounded-lg border border-border/70 px-3 py-2 text-sm"
    >
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(next) => onCheckedChange(next === true)}
      />
      <span>{label}</span>
    </label>
  )
}

export function MenuFormDialog({
  open,
  mode,
  value,
  systemGroupOptions,
  errors,
  isSubmitting,
  submitIntent,
  onOpenChange,
  onChange,
  onSave,
  onSaveAndAddMore,
}: MenuFormDialogProps) {
  const isEditMode = mode === "edit"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-1.5rem)] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Chỉnh sửa menu" : "Thêm menu"}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {isEditMode ? "Cập nhật menu hiện có." : "Tạo menu mới trong System."}
          </p>
        </DialogHeader>

        <Form
          className="gap-0"
          onSubmit={(event) => {
            event.preventDefault()
            onSave()
          }}
        >
          <ScrollArea className="max-h-[min(70vh,42rem)]">
            <div className="grid gap-5 px-6 py-5">
              <div className="grid gap-4 md:grid-cols-2">
                <FormItem>
                  <FormLabel htmlFor="menu-name">Tên menu</FormLabel>
                  <Input
                    id="menu-name"
                    value={value.name}
                    onChange={(event) =>
                      onChange(updateMenuValue(value, "name", event.target.value))
                    }
                    aria-invalid={Boolean(errors.name)}
                  />
                  {errors.name ? <FormMessage>{errors.name}</FormMessage> : null}
                </FormItem>
                <FormItem>
                  <FormLabel htmlFor="menu-controller">Controller</FormLabel>
                  <Input
                    id="menu-controller"
                    value={value.controller}
                    onChange={(event) =>
                      onChange(updateMenuValue(value, "controller", event.target.value))
                    }
                    aria-invalid={Boolean(errors.controller)}
                  />
                  {errors.controller ? (
                    <FormMessage>{errors.controller}</FormMessage>
                  ) : null}
                </FormItem>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <FormItem>
                  <FormLabel htmlFor="menu-sort">Thứ tự</FormLabel>
                  <Input
                    id="menu-sort"
                    type="number"
                    value={String(value.sort ?? 0)}
                    onChange={(event) =>
                      onChange(updateMenuValue(value, "sort", Number(event.target.value || 0)))
                    }
                  />
                </FormItem>
                <FormItem>
                  <FormLabel htmlFor="menu-system-group">Nhóm hệ thống</FormLabel>
                  <Select
                    value={value.systemGroupId}
                    onValueChange={(systemGroupId) =>
                      onChange(updateMenuValue(value, "systemGroupId", systemGroupId))
                    }
                  >
                    <SelectTrigger
                      id="menu-system-group"
                      aria-label="Nhóm hệ thống"
                      aria-invalid={Boolean(errors.systemGroupId)}
                    >
                      <SelectValue placeholder="Chọn nhóm hệ thống" />
                    </SelectTrigger>
                    <SelectContent>
                      {systemGroupOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.systemGroupId ? (
                    <FormMessage>{errors.systemGroupId}</FormMessage>
                  ) : null}
                </FormItem>
              </div>

              <div className="grid gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Quyền menu</p>
                  <p className="text-sm text-muted-foreground">
                    Xác định menu có thể hiển thị và các hành động được phép.
                  </p>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <CheckboxField
                    id="menu-can-view"
                    label="Có thể xem"
                    checked={value.canView}
                    onCheckedChange={(checked) =>
                      onChange(updateMenuValue(value, "canView", checked))
                    }
                  />
                  <CheckboxField
                    id="menu-is-show"
                    label="Hiển thị menu"
                    checked={value.isShowMenu}
                    onCheckedChange={(checked) =>
                      onChange(updateMenuValue(value, "isShowMenu", checked))
                    }
                  />
                  <CheckboxField
                    id="menu-can-add"
                    label="Có thể thêm"
                    checked={value.canAdd}
                    onCheckedChange={(checked) =>
                      onChange(updateMenuValue(value, "canAdd", checked))
                    }
                  />
                  <CheckboxField
                    id="menu-can-update"
                    label="Có thể cập nhật"
                    checked={value.canUpdate}
                    onCheckedChange={(checked) =>
                      onChange(updateMenuValue(value, "canUpdate", checked))
                    }
                  />
                  <CheckboxField
                    id="menu-can-delete"
                    label="Có thể xóa"
                    checked={value.canDelete}
                    onCheckedChange={(checked) =>
                      onChange(updateMenuValue(value, "canDelete", checked))
                    }
                  />
                  <CheckboxField
                    id="menu-can-approve"
                    label="Có thể duyệt"
                    checked={value.canApprove}
                    onCheckedChange={(checked) =>
                      onChange(updateMenuValue(value, "canApprove", checked))
                    }
                  />
                  <CheckboxField
                    id="menu-can-analyze"
                    label="Có thể thống kê"
                    checked={value.canAnalyze}
                    onCheckedChange={(checked) =>
                      onChange(updateMenuValue(value, "canAnalyze", checked))
                    }
                  />
                </div>
              </div>
            </div>
          </ScrollArea>

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
