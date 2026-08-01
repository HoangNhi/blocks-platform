import { useId, useState, type FormEvent } from "react"
import { ChevronDown, KeyRound, LoaderCircle, LogOut, UserPen } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Form,
  FormControl,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import type {
  AuthUser,
  ChangePasswordRequest,
  EditProfileRequest,
} from "@/features/auth/types"
import { cn } from "@/lib/utils"

type SidebarAccountMenuProps = {
  currentUser: AuthUser
  onLogout: () => void | Promise<void>
  onEditProfile: (request: EditProfileRequest) => unknown | Promise<unknown>
  onChangePassword: (request: ChangePasswordRequest) => unknown | Promise<unknown>
  compact?: boolean
  className?: string
}

type ProfileFormState = {
  fullName: string
  email: string
}

type PasswordFormState = {
  oldPassword: string
  newPassword: string
  confirmNewPassword: string
}

type ProfileFormErrors = Partial<Record<keyof ProfileFormState, string>>
type PasswordFormErrors = Partial<Record<keyof PasswordFormState, string>>

const emptyPasswordForm: PasswordFormState = {
  oldPassword: "",
  newPassword: "",
  confirmNewPassword: "",
}

function createProfileForm(user: AuthUser): ProfileFormState {
  return {
    fullName: user.fullname,
    email: user.email,
  }
}

function getAvatarFallback(user: AuthUser) {
  return user.fullname
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "AU"
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

function validateProfileForm(form: ProfileFormState): ProfileFormErrors {
  const errors: ProfileFormErrors = {}

  if (!form.fullName.trim()) {
    errors.fullName = "Họ và tên không được để trống."
  }

  if (!form.email.trim()) {
    errors.email = "Email không được để trống."
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
    errors.email = "Email không hợp lệ."
  }

  return errors
}

function validatePasswordForm(form: PasswordFormState): PasswordFormErrors {
  const errors: PasswordFormErrors = {}

  if (!form.oldPassword) {
    errors.oldPassword = "Mật khẩu cũ không được để trống."
  }

  if (!form.newPassword) {
    errors.newPassword = "Mật khẩu mới không được để trống."
  }

  if (!form.confirmNewPassword) {
    errors.confirmNewPassword = "Xác nhận mật khẩu không được để trống."
  } else if (form.newPassword !== form.confirmNewPassword) {
    errors.confirmNewPassword = "Mật khẩu xác nhận không khớp."
  }

  return errors
}

export function SidebarAccountMenu({
  currentUser,
  onLogout,
  onEditProfile,
  onChangePassword,
  compact = false,
  className,
}: SidebarAccountMenuProps) {
  const avatarFallback = getAvatarFallback(currentUser)
  const secondaryLabel = currentUser.roleName ?? currentUser.username
  const profileFullNameId = useId()
  const profileEmailId = useId()
  const oldPasswordId = useId()
  const newPasswordId = useId()
  const confirmPasswordId = useId()

  const [profileOpen, setProfileOpen] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [profileForm, setProfileForm] = useState(() => createProfileForm(currentUser))
  const [passwordForm, setPasswordForm] = useState<PasswordFormState>(emptyPasswordForm)
  const [profileErrors, setProfileErrors] = useState<ProfileFormErrors>({})
  const [passwordErrors, setPasswordErrors] = useState<PasswordFormErrors>({})
  const [profileErrorMessage, setProfileErrorMessage] = useState<string | null>(null)
  const [passwordErrorMessage, setPasswordErrorMessage] = useState<string | null>(null)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [isSavingPassword, setIsSavingPassword] = useState(false)


  function openProfileDialog() {
    setProfileForm(createProfileForm(currentUser))
    setProfileErrors({})
    setProfileErrorMessage(null)
    setProfileOpen(true)
  }

  function openPasswordDialog() {
    setPasswordForm(emptyPasswordForm)
    setPasswordErrors({})
    setPasswordErrorMessage(null)
    setPasswordOpen(true)
  }

  function closeProfileDialog() {
    setProfileOpen(false)
    setProfileErrors({})
    setProfileErrorMessage(null)
    setIsSavingProfile(false)
  }

  function closePasswordDialog() {
    setPasswordOpen(false)
    setPasswordForm(emptyPasswordForm)
    setPasswordErrors({})
    setPasswordErrorMessage(null)
    setIsSavingPassword(false)
  }

  async function submitProfileForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSavingProfile) return

    const validationErrors = validateProfileForm(profileForm)
    setProfileErrors(validationErrors)
    setProfileErrorMessage(null)

    if (Object.keys(validationErrors).length > 0) {
      return
    }

    setIsSavingProfile(true)

    try {
      await onEditProfile({
        fullName: profileForm.fullName.trim(),
        email: profileForm.email.trim(),
        avatar: currentUser.avatar ?? null,
      })
      closeProfileDialog()
    } catch (error: unknown) {
      setProfileErrorMessage(
        getErrorMessage(error, "Không thể cập nhật hồ sơ cá nhân."),
      )
      setIsSavingProfile(false)
    }
  }

  async function submitPasswordForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSavingPassword) return

    const validationErrors = validatePasswordForm(passwordForm)
    setPasswordErrors(validationErrors)
    setPasswordErrorMessage(null)

    if (Object.keys(validationErrors).length > 0) {
      return
    }

    setIsSavingPassword(true)

    try {
      await onChangePassword({
        oldPassword: passwordForm.oldPassword,
        newPassword: passwordForm.newPassword,
        confirmNewPassword: passwordForm.confirmNewPassword,
      })
      closePasswordDialog()
    } catch (error: unknown) {
      setPasswordErrorMessage(
        getErrorMessage(error, "Không thể đổi mật khẩu."),
      )
      setIsSavingPassword(false)
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {compact ? (
            <button
              type="button"
              aria-label="Mở menu tài khoản"
              className={cn(
                "inline-flex size-12 items-center justify-center rounded-lg transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-platform-primary/40 data-[state=open]:bg-slate-100",
                className,
              )}
            >
              <Avatar size="lg" className="rounded-lg">
                {currentUser.avatar ? (
                  <AvatarImage alt={currentUser.fullname} src={currentUser.avatar} />
                ) : null}
                <AvatarFallback className="rounded-lg bg-blue-100 text-xs font-semibold text-blue-700">
                  {avatarFallback}
                </AvatarFallback>
              </Avatar>
            </button>
          ) : (
            <button
              type="button"
              aria-label="Mở menu tài khoản"
              className={cn(
                "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-platform-primary/40 data-[state=open]:bg-slate-100",
                className,
              )}
            >
              <Avatar size="lg" className="rounded-lg">
                {currentUser.avatar ? (
                  <AvatarImage alt={currentUser.fullname} src={currentUser.avatar} />
                ) : null}
                <AvatarFallback className="rounded-lg bg-blue-100 text-xs font-semibold text-blue-700">
                  {avatarFallback}
                </AvatarFallback>
              </Avatar>
              <span className="min-w-0 flex-1">
                <strong className="block truncate text-sm font-semibold text-platform-ink">
                  {currentUser.fullname}
                </strong>
                <span className="block truncate text-xs text-platform-muted">
                  {secondaryLabel}
                </span>
              </span>
              <ChevronDown className="size-4 text-platform-muted" aria-hidden="true" />
            </button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="right" sideOffset={8} className="w-64">
          <DropdownMenuLabel className="font-normal">
            <span className="block truncate text-sm font-semibold text-platform-ink">
              {currentUser.fullname}
            </span>
            <span className="block truncate text-xs text-platform-muted">
              {currentUser.email || currentUser.username}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="gap-2"
            onSelect={(event) => {
              event.preventDefault()
              openProfileDialog()
            }}
          >
            <UserPen className="size-4" aria-hidden="true" />
            Hồ sơ cá nhân
          </DropdownMenuItem>
          <DropdownMenuItem
            className="gap-2"
            onSelect={(event) => {
              event.preventDefault()
              openPasswordDialog()
            }}
          >
            <KeyRound className="size-4" aria-hidden="true" />
            Đổi mật khẩu
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="gap-2" onClick={() => void onLogout()}>
            <LogOut className="size-4" aria-hidden="true" />
            Đăng xuất
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={profileOpen} onOpenChange={(open) => (open ? openProfileDialog() : closeProfileDialog())}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Hồ sơ cá nhân</DialogTitle>
            <DialogDescription>
              Cập nhật thông tin hiển thị của tài khoản đang đăng nhập.
            </DialogDescription>
          </DialogHeader>
          <Form className="px-6 py-5" onSubmit={submitProfileForm} noValidate>
            {profileErrorMessage ? (
              <Alert variant="destructive">
                <AlertDescription>{profileErrorMessage}</AlertDescription>
              </Alert>
            ) : null}
            <FormItem>
              <FormLabel htmlFor={profileFullNameId}>Họ và tên</FormLabel>
              <FormControl>
                <Input
                  id={profileFullNameId}
                  value={profileForm.fullName}
                  aria-invalid={Boolean(profileErrors.fullName)}
                  onChange={(event) =>
                    setProfileForm((current) => ({
                      ...current,
                      fullName: event.target.value,
                    }))
                  }
                />
              </FormControl>
              {profileErrors.fullName ? (
                <FormMessage>{profileErrors.fullName}</FormMessage>
              ) : null}
            </FormItem>
            <FormItem>
              <FormLabel htmlFor={profileEmailId}>Email</FormLabel>
              <FormControl>
                <Input
                  id={profileEmailId}
                  type="email"
                  value={profileForm.email}
                  aria-invalid={Boolean(profileErrors.email)}
                  onChange={(event) =>
                    setProfileForm((current) => ({
                      ...current,
                      email: event.target.value,
                    }))
                  }
                />
              </FormControl>
              {profileErrors.email ? (
                <FormMessage>{profileErrors.email}</FormMessage>
              ) : null}
            </FormItem>
            <DialogFooter className="px-0 pb-0">
              <Button type="button" variant="outline" onClick={closeProfileDialog}>
                Hủy
              </Button>
              <Button type="submit" disabled={isSavingProfile}>
                {isSavingProfile ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                ) : null}
                {isSavingProfile ? "Đang lưu" : "Lưu"}
              </Button>
            </DialogFooter>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={passwordOpen} onOpenChange={(open) => (open ? openPasswordDialog() : closePasswordDialog())}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Đổi mật khẩu</DialogTitle>
            <DialogDescription>
              Xác nhận mật khẩu hiện tại trước khi đặt mật khẩu mới.
            </DialogDescription>
          </DialogHeader>
          <Form className="px-6 py-5" onSubmit={submitPasswordForm} noValidate>
            {passwordErrorMessage ? (
              <Alert variant="destructive">
                <AlertDescription>{passwordErrorMessage}</AlertDescription>
              </Alert>
            ) : null}
            <FormItem>
              <FormLabel htmlFor={oldPasswordId}>Mật khẩu cũ</FormLabel>
              <FormControl>
                <Input
                  id={oldPasswordId}
                  type="password"
                  value={passwordForm.oldPassword}
                  aria-invalid={Boolean(passwordErrors.oldPassword)}
                  onChange={(event) =>
                    setPasswordForm((current) => ({
                      ...current,
                      oldPassword: event.target.value,
                    }))
                  }
                />
              </FormControl>
              {passwordErrors.oldPassword ? (
                <FormMessage>{passwordErrors.oldPassword}</FormMessage>
              ) : null}
            </FormItem>
            <FormItem>
              <FormLabel htmlFor={newPasswordId}>Mật khẩu mới</FormLabel>
              <FormControl>
                <Input
                  id={newPasswordId}
                  type="password"
                  value={passwordForm.newPassword}
                  aria-invalid={Boolean(passwordErrors.newPassword)}
                  onChange={(event) =>
                    setPasswordForm((current) => ({
                      ...current,
                      newPassword: event.target.value,
                    }))
                  }
                />
              </FormControl>
              {passwordErrors.newPassword ? (
                <FormMessage>{passwordErrors.newPassword}</FormMessage>
              ) : null}
            </FormItem>
            <FormItem>
              <FormLabel htmlFor={confirmPasswordId}>Xác nhận mật khẩu</FormLabel>
              <FormControl>
                <Input
                  id={confirmPasswordId}
                  type="password"
                  value={passwordForm.confirmNewPassword}
                  aria-invalid={Boolean(passwordErrors.confirmNewPassword)}
                  onChange={(event) =>
                    setPasswordForm((current) => ({
                      ...current,
                      confirmNewPassword: event.target.value,
                    }))
                  }
                />
              </FormControl>
              {passwordErrors.confirmNewPassword ? (
                <FormMessage>{passwordErrors.confirmNewPassword}</FormMessage>
              ) : null}
            </FormItem>
            <DialogFooter className="px-0 pb-0">
              <Button type="button" variant="outline" onClick={closePasswordDialog}>
                Hủy
              </Button>
              <Button type="submit" disabled={isSavingPassword}>
                {isSavingPassword ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                ) : null}
                {isSavingPassword ? "Đang lưu" : "Lưu"}
              </Button>
            </DialogFooter>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  )
}
