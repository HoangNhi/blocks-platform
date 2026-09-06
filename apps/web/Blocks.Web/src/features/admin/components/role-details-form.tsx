import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { FormDescription, FormItem, FormLabel, FormMessage } from "@/components/ui/form"

import type { RoleModel, RoleUpsertRequest } from "../types"

type RoleDetailsFormProps = {
  value: RoleUpsertRequest
  errors: Partial<Record<"name" | "key", string>>
  isEditMode: boolean
  metadata?: RoleModel
  disabled?: boolean
  onChange: (next: RoleUpsertRequest) => void
}

export function RoleDetailsForm({ value, errors, isEditMode, metadata, disabled = false, onChange }: RoleDetailsFormProps) {
  const registrationDisabled = isEditMode && metadata?.canChangeRegistrationEligibility === false
  const activeDisabled = isEditMode && metadata?.canDeactivate === false
  const keyDisabled = disabled || (isEditMode && (metadata?.isProtected === true || metadata?.isSystem === true))

  return (
    <div className="grid gap-4 px-6 py-5">
      <FormItem>
        <FormLabel htmlFor="role-name">Tên vai trò</FormLabel>
        <Input
          id="role-name"
          value={value.name}
          onChange={(event) => onChange({ ...value, name: event.target.value })}
          disabled={disabled}
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
          disabled={keyDisabled}
        />
        <FormDescription id="role-key-help">
          {isEditMode && (metadata?.isProtected || metadata?.isSystem)
            ? "Mã vai trò hệ thống hoặc bảo vệ không thể thay đổi."
            : isEditMode
              ? "Mã vai trò tùy chỉnh có thể thay đổi khi chỉnh sửa."
              : "Dùng mã ngắn, ổn định cho phân quyền và tích hợp."}
        </FormDescription>
        {errors.key ? <FormMessage id="role-key-error">{errors.key}</FormMessage> : null}
      </FormItem>
      <label htmlFor="role-registration-eligible" className="flex items-start gap-3 rounded-lg border border-border/70 px-3 py-3 text-sm">
        <Checkbox
          id="role-registration-eligible"
          checked={value.isRegistrationEligible}
          onCheckedChange={(checked) => onChange({ ...value, isRegistrationEligible: checked === true })}
          disabled={disabled || registrationDisabled}
          aria-describedby="role-registration-eligible-help"
        />
        <span>
          <span className="font-medium">Được phép đăng ký</span>
          <span id="role-registration-eligible-help" className="block text-xs text-muted-foreground">
            {registrationDisabled
              ? metadata?.registrationEligibilityBlockedReason ?? "Vai trò này không thể thay đổi trạng thái đăng ký."
              : "Chỉ một vai trò có thể được chọn. Bật vai trò này sẽ thay vai trò đăng ký hiện tại và dùng cho tài khoản mới."}
          </span>
        </span>
      </label>
      <label htmlFor="role-active" className="flex items-start gap-3 rounded-lg border border-border/70 px-3 py-3 text-sm">
        <Checkbox
          id="role-active"
          checked={value.isActived}
          onCheckedChange={(checked) => onChange({ ...value, isActived: checked === true })}
          disabled={disabled || activeDisabled}
          aria-describedby="role-active-help"
        />
        <span>
          <span className="font-medium">Đang hoạt động</span>
          <span id="role-active-help" className="block text-xs text-muted-foreground">
            {activeDisabled
              ? metadata?.deactivationBlockedReason ?? "Vai trò này không thể vô hiệu hóa."
              : "Vai trò đang hoạt động có thể được gán cho tài khoản."}
          </span>
        </span>
      </label>
    </div>
  )
}
