import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Form, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

import type { ComboboxOption, UserUpsertRequest } from "../types"
import { canUseSaveAndAddMore, type EntityDialogMode, type EntityDialogSubmitIntent } from "../entity-dialog-state"
import { CrudDialogFooter } from "./crud-dialog-footer"
import { UserAvatarUploadField } from "./user-avatar-upload-field"

export type UserFormValues = UserUpsertRequest & {
  passwordToken: string
  avatarFile: File | null
}

export type UserFormErrors = Partial<Record<"username" | "fullname" | "email" | "roleId" | "password", string>>

type UserFormDialogProps = {
  open: boolean
  mode: EntityDialogMode | null
  value: UserFormValues
  roleOptions: ComboboxOption[]
  errors: UserFormErrors
  isSubmitting: boolean
  submitIntent: EntityDialogSubmitIntent | null
  onOpenChange: (open: boolean) => void
  onChange: (next: UserFormValues) => void
  onSave: () => void
  onSaveAndAddMore: () => void
}

function setField<K extends keyof UserFormValues>(
  current: UserFormValues,
  key: K,
  value: UserFormValues[K],
) {
  return { ...current, [key]: value }
}

export function UserFormDialog({
  open,
  mode,
  value,
  roleOptions,
  errors,
  isSubmitting,
  submitIntent,
  onOpenChange,
  onChange,
  onSave,
  onSaveAndAddMore,
}: UserFormDialogProps) {
  const isEditMode = mode === "edit"
  const title = isEditMode ? "Chỉnh sửa tài khoản" : "Thêm tài khoản"
  const description = isEditMode
    ? "Cập nhật thông tin tài khoản hiện có."
    : "Tạo tài khoản mới trong phân hệ System."

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[calc(100vh-1.5rem)] p-0 sm:max-w-[60rem]"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader className="px-8 py-6">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <Form
          className="gap-0"
          onSubmit={(event) => {
            event.preventDefault()
            onSave()
          }}
        >
          <ScrollArea className="max-h-[min(70vh,42rem)]">
            <div className="grid gap-5 px-8 py-6">
              <UserAvatarUploadField
                currentAvatar={value.avatar ?? null}
                selectedFile={value.avatarFile}
                onFileChange={(avatarFile) => onChange({ ...value, avatarFile })}
              />

              <div className="grid gap-5 lg:grid-cols-2">
                <FormItem>
                  <FormLabel htmlFor="user-username">Tên đăng nhập</FormLabel>
                  <Input
                    id="user-username"
                    value={value.username}
                    onChange={(event) => onChange(setField(value, "username", event.target.value))}
                    aria-invalid={Boolean(errors.username)}
                    aria-describedby={errors.username ? "user-username-error" : undefined}
                  />
                  {errors.username ? <FormMessage id="user-username-error">{errors.username}</FormMessage> : null}
                </FormItem>
                <FormItem>
                  <FormLabel htmlFor="user-fullname">Họ và tên</FormLabel>
                  <Input
                    id="user-fullname"
                    value={value.fullname}
                    onChange={(event) => onChange(setField(value, "fullname", event.target.value))}
                    aria-invalid={Boolean(errors.fullname)}
                    aria-describedby={errors.fullname ? "user-fullname-error" : undefined}
                  />
                  {errors.fullname ? <FormMessage id="user-fullname-error">{errors.fullname}</FormMessage> : null}
                </FormItem>

                <FormItem>
                  <FormLabel htmlFor="user-email">Email</FormLabel>
                  <Input
                    id="user-email"
                    type="email"
                    value={value.email}
                    onChange={(event) => onChange(setField(value, "email", event.target.value))}
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={errors.email ? "user-email-error" : undefined}
                  />
                  {errors.email ? <FormMessage id="user-email-error">{errors.email}</FormMessage> : null}
                </FormItem>
                <FormItem className="w-full">
                  <FormLabel htmlFor="user-role">Vai trò</FormLabel>
                  <Select value={value.roleId} onValueChange={(roleId) => onChange(setField(value, "roleId", roleId))}>
                    <SelectTrigger id="user-role" className="w-full" aria-label="Vai trò" aria-invalid={Boolean(errors.roleId)} aria-describedby={errors.roleId ? "user-role-error" : undefined}>
                      <SelectValue placeholder="Chọn vai trò" />
                    </SelectTrigger>
                    <SelectContent>
                      {roleOptions.map((role) => <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {errors.roleId ? <FormMessage id="user-role-error">{errors.roleId}</FormMessage> : null}
                </FormItem>

                <FormItem className="w-full">
                  <FormLabel htmlFor="user-password">Mật khẩu</FormLabel>
                  <Input
                    id="user-password"
                    type="password"
                    value={value.password}
                    onChange={(event) => onChange(setField(value, "password", event.target.value))}
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={errors.password ? "user-password-error" : "user-password-help"}
                  />
                  {isEditMode ? <p id="user-password-help" className="text-xs text-muted-foreground">Để trống nếu muốn giữ nguyên mật khẩu hiện tại.</p> : null}
                  {errors.password ? <FormMessage id="user-password-error">{errors.password}</FormMessage> : null}
                </FormItem>
                <FormItem className="w-full">
                  <FormLabel htmlFor="user-status">Trạng thái</FormLabel>
                  <Select value={value.isActived ? "active" : "inactive"} onValueChange={(status) => onChange(setField(value, "isActived", status === "active"))}>
                    <SelectTrigger id="user-status" className="w-full" aria-label="Trạng thái">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Hoạt động</SelectItem>
                      <SelectItem value="inactive">Không hoạt động</SelectItem>
                    </SelectContent>
                  </Select>
                </FormItem>
              </div>
            </div>
          </ScrollArea>

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
