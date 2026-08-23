import { useEffect, useState, type FormEvent } from "react"
import { Link, Navigate, useLocation, useNavigate } from "react-router"
import { ShieldCheck } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { PageState } from "@/components/platform/page-state"
import { createApiClient } from "@/lib/api/client"
import { createAuthApi } from "./auth-api"
import { createBrowserTokenStore } from "./token-store"

import { useAuth } from "./auth-context"

const tokenStore = createBrowserTokenStore()
const authApi = createAuthApi(createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? "/",
  getAccessToken: tokenStore.getAccessToken,
}))

type LoginLocationState = {
  from?: {
    pathname?: string
  }
  registrationSuccess?: boolean
  username?: string
}

export function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { login, status, currentUser, error, clearError } = useAuth()
  const state = location.state as LoginLocationState | null
  const [username, setUsername] = useState(state?.username ?? "")
  const [password, setPassword] = useState("")
  const [formError, setFormError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [registrationAvailable, setRegistrationAvailable] = useState(false)

  useEffect(() => {
    void authApi.getRegistrationAvailability()
      .then((result) => setRegistrationAvailable(result.isAvailable))
      .catch(() => setRegistrationAvailable(false))
  }, [])
  const destination = state?.from?.pathname ?? "/"

  if (status === "authenticated" && currentUser) {
    return <Navigate to={destination} replace />
  }

  if (status === "loading") {
    return (
      <PageState
        icon={ShieldCheck}
        title="Đang tải trang đăng nhập"
        description="Đang chuẩn bị phiên xác thực của bạn."
      />
    )
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError(null)
    clearError()
    setIsSubmitting(true)

    try {
      await login({ username, password })
      navigate(destination, { replace: true })
    } catch (submitError: unknown) {
      setFormError(
        submitError instanceof Error
          ? submitError.message
          : "Không thể đăng nhập.",
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.18),transparent_30%),linear-gradient(180deg,#f8fafc_0%,#eef2ff_100%)] px-4 py-10">
      <div className="grid w-full max-w-5xl gap-6 overflow-hidden rounded-[2rem] border border-platform-border bg-white/90 shadow-[0_28px_80px_rgba(15,23,42,0.12)] backdrop-blur md:grid-cols-[1.08fr_0.92fr]">
        <section className="relative overflow-hidden bg-slate-950 px-8 py-10 text-white">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.22),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(37,99,235,0.18),transparent_28%)]" />
          <div className="relative flex h-full flex-col justify-between gap-8">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/6 px-3 py-1 text-xs font-medium text-slate-200">
                <span className="size-2 rounded-full bg-cyan-400" />
                Không gian Blocks
              </div>
              <h1 className="max-w-md text-4xl font-semibold tracking-tight">
                Đăng nhập để vào nền tảng được bảo vệ
              </h1>
              <p className="mt-4 max-w-lg text-sm leading-6 text-slate-300">
                Ứng dụng web mở qua xác thực và điều hướng từ backend thay vì dữ liệu giả lập.
              </p>
            </div>

            <div className="grid gap-3 text-sm text-slate-300">
              <p>- Phiên đăng nhập được lưu bởi một token store duy nhất.</p>
              <p>- Dữ liệu sidebar lấy từ quyền backend của người dùng hiện tại.</p>
              <p>- Tuyến truy cập được bảo vệ trước khi shell hiển thị.</p>
            </div>
          </div>
        </section>

        <section className="p-8 md:p-10">
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold text-platform-ink">Chào mừng trở lại</h2>
              <p className="mt-2 text-sm leading-6 text-platform-muted">
                Dùng thông tin đăng nhập workspace của bạn để vào Blocks.
              </p>
            </div>

            <form className="grid gap-4" onSubmit={handleSubmit}>
              <label className="grid gap-2 text-sm font-medium text-platform-ink">
                Tên đăng nhập
                <Input
                  autoComplete="username"
                  value={username}
                  onChange={(event) => {
                    setUsername(event.target.value)
                  }}
                />
              </label>

              <label className="grid gap-2 text-sm font-medium text-platform-ink">
                Mật khẩu
                <Input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value)
                  }}
                />
              </label>

              {state?.registrationSuccess ? (
                <Alert role="status">
                  <AlertTitle>Tài khoản đã được tạo</AlertTitle>
                  <AlertDescription>Nhập mật khẩu để đăng nhập bằng tài khoản mới.</AlertDescription>
                </Alert>
              ) : null}
              {formError || error ? (
                <Alert variant="destructive">
                  <AlertTitle>Không thể đăng nhập</AlertTitle>
                  <AlertDescription>{formError ?? error?.message}</AlertDescription>
                </Alert>
              ) : null}

              <Button
                type="submit"
                className="h-11 rounded-xl bg-platform-primary text-white hover:bg-platform-primary/90"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Đang đăng nhập..." : "Đăng nhập"}
              </Button>
              {registrationAvailable ? (
                <Button asChild variant="link" className="justify-center">
                  <Link to="/register">Tạo tài khoản mới</Link>
                </Button>
              ) : null}
            </form>
          </div>
        </section>
      </div>
    </div>
  )
}