import { useEffect, useRef, useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { FormItem, FormLabel } from "@/components/ui/form"
import { Input } from "@/components/ui/input"

import { createSystemAdminApi } from "../system-admin-api"
import type { InvitationCreateRequest } from "../types"

type InvitationsPanelProps = {
  adminApi: Pick<ReturnType<typeof createSystemAdminApi>, "createInvitation">
}

export function InvitationsPanel({ adminApi }: InvitationsPanelProps) {
  const [expiresAt, setExpiresAt] = useState("")
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const summaryRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (error) summaryRef.current?.focus()
  }, [error])

  function validateExpiresAt() {
    if (!expiresAt) return "Hết hạn lúc không được để trống."
    const expiresAtDate = new Date(expiresAt)
    if (Number.isNaN(expiresAtDate.getTime()) || expiresAtDate.getTime() <= Date.now()) {
      return "Thời điểm hết hạn phải nằm trong tương lai."
    }
    return null
  }

  async function createInvitation() {
    const validationError = validateExpiresAt()
    if (validationError) {
      setError(validationError)
      return
    }

    setIsSaving(true)
    setError(null)
    try {
      const request: InvitationCreateRequest = { expiresAt: new Date(expiresAt).toISOString() }
      const result = await adminApi.createInvitation(request)
      setToken(result.token)
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : "Không thể tạo lời mời.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Lời mời</CardTitle><CardDescription>Tạo lời mời đăng ký cho thành viên mới. Mã chỉ hiển thị một lần.</CardDescription></CardHeader>
      <CardContent className="grid gap-4">
        {error ? <Alert ref={summaryRef} tabIndex={-1} variant="destructive" role="alert"><AlertTitle>Không thể tạo lời mời</AlertTitle><AlertDescription>{error}</AlertDescription></Alert> : null}
        {token ? <Alert role="status"><AlertTitle>Mã lời mời mới</AlertTitle><AlertDescription><code className="break-all">{token}</code><p className="mt-1">Lưu mã này ngay; mã không hiển thị lại sau khi rời trạng thái này.</p></AlertDescription></Alert> : null}
        <FormItem><FormLabel htmlFor="invitation-expires-at">Hết hạn lúc</FormLabel><Input id="invitation-expires-at" type="datetime-local" value={expiresAt} onChange={(event) => { setExpiresAt(event.target.value); setError(null) }} aria-invalid={Boolean(error)} aria-describedby={error ? "invitation-expires-error" : "invitation-expires-help"} /><p id="invitation-expires-help" className="text-sm text-muted-foreground">Chọn thời điểm trong tương lai.</p>{error ? <p id="invitation-expires-error" className="text-sm text-destructive">{error}</p> : null}</FormItem>
        <Button type="button" onClick={() => void createInvitation()} disabled={isSaving}>{isSaving ? "Đang tạo..." : "Tạo lời mời"}</Button>
      </CardContent>
    </Card>
  )
}
