import { useEffect, useRef, useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FormItem, FormLabel } from "@/components/ui/form"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { createBrowserTokenStore } from "@/features/auth/token-store"
import { createApiClient } from "@/lib/api/client"

import { createSystemAdminApi } from "../system-admin-api"
import type { RegistrationMode, RegistrationSettings, RoleModel } from "../types"

const tokenStore = createBrowserTokenStore()
const adminApi = createSystemAdminApi(createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? "/",
  getAccessToken: tokenStore.getAccessToken,
}))

export function SystemOverviewPage() {
  const [settings, setSettings] = useState<RegistrationSettings>({
    registrationMode: "admin_provisioned",
    defaultRegistrationRoleId: null,
  })
  const [eligibleRoles, setEligibleRoles] = useState<RoleModel[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const summaryRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (error) summaryRef.current?.focus()
  }, [error])

  useEffect(() => {
    void Promise.all([
      adminApi.getRegistrationSettings(),
      adminApi.getRoles({ pageIndex: 1, pageSize: 100, textSearch: "" }),
    ])
      .then(([result, roles]) => {
        setSettings(result)
        setEligibleRoles(roles.data.filter((role) => role.isRegistrationEligible))
      })
      .catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : "Không thể tải cài đặt đăng ký."))
      .finally(() => setIsLoading(false))
  }, [])

  async function saveSettings() {
    setIsSaving(true)
    setError(null)
    setMessage(null)
    try {
      await adminApi.updateRegistrationSettings(settings)
      setMessage("Cài đặt đăng ký đã được lưu.")
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Không thể lưu cài đặt đăng ký.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="grid gap-4">
      <div><h1 className="text-xl font-semibold">System Overview</h1><p className="text-sm text-muted-foreground">Cấu hình nền tảng và trạng thái đăng ký cộng đồng.</p></div>
      <Card>
        <CardHeader><CardTitle>Registration Settings</CardTitle><CardDescription>Chọn cách tài khoản mới được tạo. Vai trò mặc định do máy chủ kiểm soát.</CardDescription></CardHeader>
        <CardContent className="grid gap-4">
           {error ? <Alert ref={summaryRef} tabIndex={-1} variant="destructive" role="alert"><AlertTitle>Không thể tải cài đặt</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
          {message ? <Alert role="status"><AlertTitle>Đã lưu</AlertTitle><AlertDescription>{message}</AlertDescription></Alert> : null}
          <FormItem>
            <FormLabel htmlFor="registration-mode">Chế độ đăng ký</FormLabel>
            <Select value={settings.registrationMode} onValueChange={(value: RegistrationMode) => setSettings((current) => ({ ...current, registrationMode: value }))} disabled={isLoading || isSaving}>
              <SelectTrigger id="registration-mode" aria-label="Chế độ đăng ký"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Mở đăng ký</SelectItem>
                <SelectItem value="invite_only">Chỉ theo lời mời</SelectItem>
                <SelectItem value="admin_provisioned">Quản trị viên tạo tài khoản</SelectItem>
              </SelectContent>
            </Select>

          </FormItem>
           <FormItem>
             <FormLabel htmlFor="registration-default-role">Vai trò đăng ký mặc định</FormLabel>
             <Select value={settings.defaultRegistrationRoleId ?? "none"} onValueChange={(value) => setSettings((current) => ({ ...current, defaultRegistrationRoleId: value === "none" ? null : value }))} disabled={isLoading || isSaving}>
               <SelectTrigger id="registration-default-role" aria-label="Vai trò đăng ký mặc định"><SelectValue placeholder="Chưa chọn vai trò" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Chưa chọn vai trò</SelectItem>
                  {eligibleRoles.map((role) => <SelectItem key={role.id} value={role.id}>{role.name}{role.key ? ` (${role.key})` : ""}</SelectItem>)}
                </SelectContent>
             </Select>
             <p id="registration-default-role-help" className="text-sm text-muted-foreground">Chỉ chọn vai trò được máy chủ đánh dấu là đủ điều kiện đăng ký.</p>
           </FormItem>
          <Button type="button" onClick={() => void saveSettings()} disabled={isLoading || isSaving}>
            {isSaving ? "Đang lưu..." : "Lưu cài đặt đăng ký"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
