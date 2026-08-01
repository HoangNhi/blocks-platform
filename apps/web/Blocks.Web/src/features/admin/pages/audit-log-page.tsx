import { Eye } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { createBrowserTokenStore } from "@/features/auth/token-store"
import { createApiClient } from "@/lib/api/client"

import { createDefaultAuditLogRequest, resetAuditLogRequest } from "../audit-log-filter-state"
import { AuditLogDetailDialog } from "../components/audit-log-detail-dialog"
import { AuditLogFilters } from "../components/audit-log-filters"
import {
  SystemDataTable,
  type SystemColumn,
} from "../components/system-data-table"
import { SystemListPageScaffold } from "../components/system-list-page-scaffold"
import { createSystemAdminApi } from "../system-admin-api"
import type { AuditLogDetailModel, AuditLogModel } from "../types"

const tokenStore = createBrowserTokenStore()
const adminApi = createSystemAdminApi(
  createApiClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? "/",
    getAccessToken: tokenStore.getAccessToken,
  }),
)

export function AuditLogPage() {
  const [items, setItems] = useState<AuditLogModel[]>([])
  const [totalRow, setTotalRow] = useState(0)
  const [request, setRequest] = useState(createDefaultAuditLogRequest(20))
  const [searchTerm, setSearchTerm] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detailDialogOpen, setDetailDialogOpen] = useState(false)
  const [detailItem, setDetailItem] = useState<AuditLogDetailModel | null>(null)

  const columns = useMemo<SystemColumn<AuditLogModel>[]>(
    () => [
      {
        key: "createdAt",
        header: "Thời gian",
        cell: (item) => new Date(item.createdAt).toLocaleString(),
      },
      { key: "userName", header: "Tài khoản", cell: (item) => item.userName },
      { key: "action", header: "Hành động", cell: (item) => item.action },
      { key: "entityName", header: "Tài nguyên", cell: (item) => item.entityName },
      {
        key: "status",
        header: "Kết quả",
        cell: (item) => (
          <Badge
            variant="secondary"
            className={
              item.isSuccess
                ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-50"
                : "bg-rose-50 text-rose-700 hover:bg-rose-50"
            }
          >
            {item.isSuccess ? "Thành công" : "Thất bại"}
          </Badge>
        ),
      },
      { key: "ipAddress", header: "IP", cell: (item) => item.ipAddress ?? "-" },
      {
        key: "serviceName",
        header: "Hệ thống",
        cell: (item) => item.serviceName ?? "System",
      },
    ],
    [],
  )

  const loadAuditLogs = useCallback(
    (nextRequest = request) => adminApi.getAuditLogs(nextRequest),
    [request],
  )

  async function openAuditLogDetail(id: string) {
    setError(null)

    try {
      const detail = await adminApi.getAuditLogById(id)
      setDetailItem(detail)
      setDetailDialogOpen(true)
    } catch (loadError: unknown) {
      setError(
        loadError instanceof Error ? loadError.message : "Không tải được chi tiết nhật ký.",
      )
    }
  }

  function applyRequest(nextRequest: typeof request) {
    setError(null)
    setIsLoading(true)
    setRequest(nextRequest)
  }

  useEffect(() => {
    let active = true

    void loadAuditLogs(request)
      .then((result) => {
        if (!active) return
        setItems(result.data)
        setTotalRow(result.totalRow)
      })
      .catch((loadError: unknown) => {
        if (!active) return
        setError(
          loadError instanceof Error ? loadError.message : "Audit logs failed to load.",
        )
      })
      .finally(() => {
        if (!active) return
        setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [loadAuditLogs, request])

  return (
    <SystemListPageScaffold
      onResetFilters={() => {
        setSearchTerm("")
        applyRequest(resetAuditLogRequest(request.pageSize))
      }}
      filterContent={
        <AuditLogFilters
          request={request}
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
          onRequestChange={applyRequest}
        />
      }
      tableContent={
        <SystemDataTable
          columns={columns}
          items={items}
          getRowKey={(item) => item.id}
          pageIndex={request.pageIndex}
          pageSize={request.pageSize}
          totalRow={totalRow}
          onPageChange={(pageIndex) => {
            setError(null)
            setIsLoading(true)
            setRequest((current) => ({ ...current, pageIndex }))
          }}
          onPageSizeChange={(pageSize) => {
            setError(null)
            setIsLoading(true)
            setRequest((current) => ({ ...current, pageIndex: 1, pageSize }))
          }}
          onRefresh={() => {
            setError(null)
            setIsLoading(true)
            setRequest((current) => ({ ...current }))
          }}
          isLoading={isLoading}
          error={error}
          emptyTitle="Không có nhật ký"
          emptyDescription="Không có sự kiện phù hợp với bộ lọc hiện tại."
          rowActions={(item) => (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => void openAuditLogDetail(item.id)}
            >
              <Eye className="size-4" aria-hidden="true" />
              <span className="sr-only">Mở chi tiết nhật ký</span>
            </Button>
          )}
        />
      }
    >
      <AuditLogDetailDialog
        open={detailDialogOpen}
        value={detailItem}
        onOpenChange={(open) => {
          setDetailDialogOpen(open)
          if (!open) {
            setDetailItem(null)
          }
        }}
      />
    </SystemListPageScaffold>
  )
}
