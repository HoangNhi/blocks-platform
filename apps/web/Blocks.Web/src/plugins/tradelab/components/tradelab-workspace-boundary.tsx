import { useEffect, useMemo, useState, type ReactNode } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/features/auth/auth-context"
import { AUTH_SESSION_KEY, createBrowserTokenStore } from "@/features/auth/token-store"
import { createApiClient } from "@/lib/api/client"

import { clearWorkspaceContext, fetchUserWorkspaces, resolveActiveWorkspace, setActiveWorkspaceId, type WorkspaceItem } from "../api/workspace-context"

const tokenStore = createBrowserTokenStore()

export function TradeLabWorkspaceBoundary({ children }: { children: ReactNode }) {
  const { currentUser, status } = useAuth()
  const actorId = currentUser?.id
  const [, refreshSession] = useState(0)
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== null && event.key !== AUTH_SESSION_KEY) return
      if (event.storageArea && event.storageArea !== window.localStorage) return
      if (tokenStore.getSession()?.user.id !== actorId) clearWorkspaceContext()
      refreshSession((value) => value + 1)
    }
    window.addEventListener("storage", onStorage)
    return () => window.removeEventListener("storage", onStorage)
  }, [actorId])
  if (status !== "authenticated" || !currentUser) return null
  if (tokenStore.getSession()?.user.id !== currentUser.id) return (
    <Alert role="alert">
      <AlertTitle>Session đã thay đổi</AlertTitle>
      <AlertDescription>Tải lại phiên để xác thực tài khoản hiện tại trước khi mở TradeLab.</AlertDescription>
      <Button variant="outline" className="mt-3" onClick={() => window.location.reload()}>Tải lại phiên</Button>
    </Alert>
  )
  return <WorkspaceSession key={currentUser.id}>{children}</WorkspaceSession>
}

function WorkspaceSession({ children }: { children: ReactNode }) {
  const client = useMemo(() => createApiClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? "/",
    getAccessToken: tokenStore.getAccessToken,
  }), [])
  const [workspaces, setWorkspaces] = useState<WorkspaceItem[] | null>(null)
  const [workspaceId, setWorkspaceId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    let disposed = false
    clearWorkspaceContext()
    void fetchUserWorkspaces(client).then((items) => {
      if (disposed) return
      const selectedId = resolveActiveWorkspace(items).activeWorkspace?.id ?? null
      setActiveWorkspaceId(selectedId)
      setWorkspaceId(selectedId)
      setWorkspaces(items)
    }).catch((loadError: unknown) => {
      if (disposed) return
      setError(loadError instanceof Error ? loadError.message : "Không tải được workspace.")
    })
    return () => {
      disposed = true
      clearWorkspaceContext()
    }
  }, [client, retry])

  function selectWorkspace(selectedId: string) {
    if (selectedId === workspaceId || !workspaces?.some((item) => item.id === selectedId)) return
    if (workspaceId && !window.confirm("Đổi workspace sẽ bỏ các thay đổi chưa lưu trong TradeLab. Tiếp tục?")) return
    setActiveWorkspaceId(selectedId)
    setWorkspaceId(selectedId)
  }

  if (error) return (
    <Alert role="alert" variant="destructive">
      <AlertTitle>Không tải được workspace TradeLab</AlertTitle>
      <AlertDescription>{error}</AlertDescription>
      <Button variant="outline" className="mt-3" onClick={() => { setError(null); setRetry((value) => value + 1) }}>Thử lại</Button>
    </Alert>
  )
  if (!workspaces) return <p role="status" className="p-4 text-sm text-muted-foreground">Đang tải workspace TradeLab…</p>
  if (!workspaces.length) return <p role="status" className="p-4 text-sm text-muted-foreground">Chưa có workspace. Liên hệ quản trị viên để được cấp quyền.</p>

  return (
    <div className="min-w-0 space-y-4">
      {workspaces.length > 1 ? (
        <div className="space-y-2">
          <label id="tradelab-workspace-label" htmlFor="tradelab-workspace" className="text-sm font-medium">Workspace TradeLab</label>
          <Select value={workspaceId ?? ""} onValueChange={selectWorkspace}>
            <SelectTrigger id="tradelab-workspace" aria-labelledby="tradelab-workspace-label" className="w-full min-w-0 sm:max-w-xs">
              <SelectValue placeholder="Chọn workspace để tiếp tục" />
            </SelectTrigger>
            <SelectContent>{workspaces.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      ) : <p className="truncate text-sm text-muted-foreground">Workspace: {workspaces[0].name}</p>}
      {workspaceId ? <div key={workspaceId} className="min-w-0">{children}</div> : <p role="status" className="text-sm text-muted-foreground">Chọn workspace để mở Strategy Lab.</p>}
    </div>
  )
}
