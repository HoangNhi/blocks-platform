import { AlertCircle, Bot, Search } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { Link } from "react-router"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

import { createBrowserTokenStore } from "@/features/auth/token-store"
import { createApiClient } from "@/lib/api/client"
import { createAiVideoApi } from "../api/ai-video-api"
import type { AiVideoRunSummary, AiVideoStatusInfo } from "../types"

const tokenStore = createBrowserTokenStore()
const apiClient = createApiClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? "/",
  getAccessToken: tokenStore.getAccessToken,
})
const aiVideoApi = createAiVideoApi(apiClient)

export function AiVideoOperationsPage() {
  const [runs, setRuns] = useState<AiVideoRunSummary[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [serviceStatus, setServiceStatus] = useState<AiVideoStatusInfo | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [lane, setLane] = useState<string>("all")
  const [status, setStatus] = useState<string>("all")
  const [page, setPage] = useState(1)
  const pageSize = 10

  const loadRuns = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const [response, statusResponse] = await Promise.all([
        aiVideoApi.listRuns({
          search: search.trim() || undefined,
          lane: lane === "all" ? undefined : lane,
          status: status === "all" ? undefined : status,
          page,
          pageSize
        }),
        aiVideoApi.getStatus(),
      ])
      setRuns(response.items || [])
      setTotalCount(response.totalCount || 0)
      setServiceStatus(statusResponse)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load runs.")
    } finally {
      setIsLoading(false)
    }
  }, [search, lane, status, page])

  useEffect(() => {
    let active = true
    queueMicrotask(() => {
      if (active) void loadRuns()
    })
    return () => {
      active = false
    }
  }, [loadRuns])

  const statusCounts = useMemo(() => {
    return runs.reduce(
      (acc, r) => {
        const s = r.status.toLowerCase()
        if (s === "success" || s === "completed") acc.success++
        else if (s === "failed") acc.failed++
        else if (s === "running") acc.running++
        else acc.unknown++
        return acc
      },
      { success: 0, failed: 0, running: 0, unknown: 0 }
    )
  }, [runs])

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bot className="size-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">AI Video Production</h1>
            <p className="text-muted-foreground">Giám sát và vận hành các tiến trình sản xuất video AI.</p>
          </div>
        </div>
        <Badge variant="outline">
          Worker {serviceStatus?.workerStatus ?? "Unknown"} · Provider {serviceStatus?.providerConfigurationStatus ?? "Unknown"}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Hoàn thành</CardTitle>
            <Badge className="bg-emerald-100 text-emerald-800 border-none">Success</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statusCounts.success}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Thất bại</CardTitle>
            <Badge variant="destructive">Failed</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statusCounts.failed}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Đang chạy</CardTitle>
            <Badge className="bg-blue-100 text-blue-800 border-none animate-pulse">Running</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statusCounts.running}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Không rõ</CardTitle>
            <Badge variant="outline">Unknown</Badge>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{statusCounts.unknown}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder="Tìm kiếm Run ID..."
                className="pl-8"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(1)
                }}
              />
            </div>
            <div>
              <Select value={lane} onValueChange={(val) => { setLane(val); setPage(1); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn lane" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả Lane</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Select value={status} onValueChange={(val) => { setStatus(val); setPage(1); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Chọn trạng thái" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tất cả Trạng thái</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="running">Running</SelectItem>
                  <SelectItem value="unknown">Unknown</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => { setSearch(""); setLane("all"); setStatus("all"); setPage(1); }}>
                Đặt lại
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Lỗi</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : runs.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <Bot className="size-12 text-muted-foreground mb-4" />
              <h3 className="font-semibold text-lg">Không tìm thấy tiến trình nào</h3>
              <p className="text-muted-foreground max-w-sm mt-1">Không có dữ liệu phù hợp với bộ lọc hiện tại.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Run ID</TableHead>
                  <TableHead>Lane</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead>Workflow Version</TableHead>
                  <TableHead>Imported At</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="font-mono text-sm font-medium">{run.id}</TableCell>
                    <TableCell className="capitalize">{run.lane}</TableCell>
                    <TableCell>
                      <Badge
                        className={
                          run.status.toLowerCase() === "success"
                            ? "bg-emerald-100 text-emerald-800 border-none hover:bg-emerald-100"
                            : run.status.toLowerCase() === "failed"
                            ? "bg-destructive/10 text-destructive hover:bg-destructive/10"
                            : run.status.toLowerCase() === "running"
                            ? "bg-blue-100 text-blue-800 border-none hover:bg-blue-100"
                            : "bg-secondary text-secondary-foreground"
                        }
                      >
                        {run.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{run.workflowVersion}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {new Date(run.importedAt).toLocaleString("vi-VN")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/plugins/ai-video/runs/${encodeURIComponent(run.id)}`}>Chi tiết</Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {totalCount > pageSize && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-muted-foreground">
            Hiển thị {runs.length} trên {totalCount} kết quả
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Trước
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page * pageSize >= totalCount}
              onClick={() => setPage((p) => p + 1)}
            >
              Sau
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
