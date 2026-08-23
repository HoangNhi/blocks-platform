import { useEffect, useMemo, useRef, useState } from "react"
import { Link, useLocation, useNavigate } from "react-router"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Form, FormDescription, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { createBrowserTokenStore } from "./token-store"
import { createAuthApi } from "./auth-api"
import type { RegistrationRequest } from "./types"
import { createApiClient } from "@/lib/api/client"

const tokenStore = createBrowserTokenStore()
const authApi = createAuthApi(createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? "/",
  getAccessToken: tokenStore.getAccessToken,
}))

type FormErrors = Partial<Record<keyof RegistrationRequest, string>>

function validateForm(value: RegistrationRequest): FormErrors {
  const errors: FormErrors = {}
  if (!value.username.trim()) errors.username = "Tên đăng nhập không được để trống."
  if (!value.email.trim()) errors.email = "Email không được để trống."
  else if (!/^\S+@\S+\.\S+$/.test(value.email.trim())) errors.email = "Email không hợp lệ."
  if (!value.fullname.trim()) errors.fullname = "Họ và tên không được để trống."
  if (!value.password.trim() || value.password.length < 12) errors.password = "Mật khẩu phải có ít nhất 12 ký tự."
  return errors
}

export function RegistrationPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const summaryRef = useRef<HTMLDivElement>(null)
  const invitationToken = useMemo(
    () => new URLSearchParams(location.search).get("invitationToken"),
    [location.search],
  )
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null)
  const [value, setValue] = useState<RegistrationRequest>({ username: "", email: "", fullname: "", password: "", invitationToken })
  const [errors, setErrors] = useState<FormErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    void authApi.getRegistrationAvailability()
      .then((result) => setIsAvailable(result.isAvailable))
      .catch((error: unknown) => setSubmitError(error instanceof Error ? error.message : "Không thể kiểm tra trạng thái đăng ký."))
  }, [])

  useEffect(() => {
    if (Object.keys(errors).length > 0 || submitError) {
      summaryRef.current?.focus()
    }
  }, [errors, submitError])

  function setField<K extends keyof RegistrationRequest>(key: K, next: RegistrationRequest[K]) {
    setValue((current) => ({ ...current, [key]: next }))
    setErrors((current) => {
      const nextErrors = { ...current }
      delete nextErrors[key]
      return nextErrors
    })
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = validateForm(value)
    setErrors(nextErrors)
    setSubmitError(null)
    if (Object.keys(nextErrors).length > 0) return
    setIsSubmitting(true)
    try {
      await authApi.register({
        username: value.username.trim(),
        email: value.email.trim(),
        fullname: value.fullname.trim(),
        password: value.password,
        invitationToken: value.invitationToken || null,
      })
      navigate("/login", {
        replace: true,
        state: { registrationSuccess: true, username: value.username.trim() },
      })

    } catch (error: unknown) {
      setSubmitError(error instanceof Error ? error.message : "Không thể tạo tài khoản.")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isAvailable === false) {
    return (
      <main className="grid min-h-svh place-items-center bg-muted/30 p-4">
        <Alert className="max-w-lg" role="alert">
          <AlertTitle>Đăng ký hiện không khả dụng</AlertTitle>
          <AlertDescription className="mt-2 flex flex-wrap items-center gap-2">
            Tài khoản mới được tạo bởi quản trị viên.
            <Button asChild variant="link" className="h-auto p-0"><Link to="/login">Đăng nhập</Link></Button>
          </AlertDescription>
        </Alert>
      </main>
    )
  }

  return (
    <main className="grid min-h-svh place-items-center bg-muted/30 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader><CardTitle>Tạo tài khoản Blocks</CardTitle><CardDescription>Thông tin đăng ký được dùng để tạo không gian cá nhân.</CardDescription></CardHeader>
        <CardContent>
          <Form onSubmit={submit} aria-describedby="registration-summary">
            {Object.keys(errors).length > 0 || submitError ? <Alert id="registration-summary" ref={summaryRef} role="alert" tabIndex={-1} variant="destructive"><AlertTitle>Kiểm tra thông tin đăng ký</AlertTitle><AlertDescription>{submitError ?? "Một số trường chưa hợp lệ."}</AlertDescription></Alert> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormItem><FormLabel htmlFor="register-username">Tên đăng nhập</FormLabel><Input id="register-username" value={value.username} onChange={(event) => setField("username", event.target.value)} aria-invalid={Boolean(errors.username)} aria-describedby={errors.username ? "register-username-error" : undefined} autoComplete="username" />{errors.username ? <FormMessage id="register-username-error">{errors.username}</FormMessage> : null}</FormItem>
              <FormItem><FormLabel htmlFor="register-fullname">Họ và tên</FormLabel><Input id="register-fullname" value={value.fullname} onChange={(event) => setField("fullname", event.target.value)} aria-invalid={Boolean(errors.fullname)} aria-describedby={errors.fullname ? "register-fullname-error" : undefined} autoComplete="name" />{errors.fullname ? <FormMessage id="register-fullname-error">{errors.fullname}</FormMessage> : null}</FormItem>
            </div>
            <FormItem><FormLabel htmlFor="register-email">Email</FormLabel><Input id="register-email" type="email" value={value.email} onChange={(event) => setField("email", event.target.value)} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "register-email-error" : undefined} autoComplete="email" />{errors.email ? <FormMessage id="register-email-error">{errors.email}</FormMessage> : null}</FormItem>
             <FormItem><FormLabel htmlFor="register-password">Mật khẩu</FormLabel><Input id="register-password" type="password" value={value.password} onChange={(event) => setField("password", event.target.value)} aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? "register-password-help register-password-error" : "register-password-help"} autoComplete="new-password" /><FormDescription id="register-password-help">Tối thiểu 12 ký tự.</FormDescription>{errors.password ? <FormMessage id="register-password-error">{errors.password}</FormMessage> : null}</FormItem>
             <FormItem><FormLabel htmlFor="register-invitation-token">Mã lời mời (không bắt buộc)</FormLabel><Input id="register-invitation-token" value={value.invitationToken ?? ""} onChange={(event) => setField("invitationToken", event.target.value || null)} aria-describedby="register-invitation-token-help" autoComplete="off" /><FormDescription id="register-invitation-token-help">Dán mã lời mời nếu quản trị viên đã gửi cho bạn.</FormDescription></FormItem>
             {invitationToken ? <Alert><AlertTitle>Lời mời đã được áp dụng</AlertTitle><AlertDescription>Mã lời mời từ liên kết đã được điền sẵn và sẽ được kiểm tra khi tạo tài khoản.</AlertDescription></Alert> : null}
             <div className="flex flex-wrap items-center justify-between gap-3"><Button type="submit" disabled={isSubmitting || isAvailable === null}>{isSubmitting ? "Đang tạo tài khoản..." : "Tạo tài khoản"}</Button><Button asChild variant="link"><Link to="/login">Đăng nhập</Link></Button></div>
          </Form>
        </CardContent>
      </Card>
    </main>
  )
}
