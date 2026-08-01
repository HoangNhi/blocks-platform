import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import {
  updateAuditLogDate,
  updateAuditLogFilter,
} from "../audit-log-filter-state"
import type { AuditLogPagingRequest } from "../types"

type AuditLogFiltersProps = {
  request: AuditLogPagingRequest
  searchTerm: string
  onSearchTermChange: (value: string) => void
  onRequestChange: (nextRequest: AuditLogPagingRequest) => void
}

export function AuditLogFilters({
  request,
  searchTerm,
  onSearchTermChange,
  onRequestChange,
}: AuditLogFiltersProps) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <Input
        value={request.action ?? ""}
        placeholder="Tất cả hành động"
        onChange={(event) =>
          onRequestChange(
            updateAuditLogFilter(request, "action", event.target.value || undefined),
          )
        }
      />
      <Input
        value={request.entityName ?? ""}
        placeholder="Tất cả tài nguyên"
        onChange={(event) =>
          onRequestChange(
            updateAuditLogFilter(
              request,
              "entityName",
              event.target.value || undefined,
            ),
          )
        }
      />
      <Select
        value={
          request.isSuccess === undefined
            ? "all"
            : request.isSuccess
              ? "true"
              : "false"
        }
        onValueChange={(value) =>
          onRequestChange(
            updateAuditLogFilter(
              request,
              "isSuccess",
              value === "all" ? undefined : value === "true",
            ),
          )
        }
      >
        <SelectTrigger>
          <SelectValue placeholder="Tất cả kết quả" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Tất cả kết quả</SelectItem>
          <SelectItem value="true">Thành công</SelectItem>
          <SelectItem value="false">Thất bại</SelectItem>
        </SelectContent>
      </Select>
      <Input
        type="date"
        value={request.fromDate?.slice(0, 10) ?? ""}
        onChange={(event) =>
          onRequestChange(
            updateAuditLogDate(request, "fromDate", event.target.value),
          )
        }
      />
      <Input
        type="date"
        value={request.toDate?.slice(0, 10) ?? ""}
        onChange={(event) =>
          onRequestChange(
            updateAuditLogDate(request, "toDate", event.target.value),
          )
        }
      />
      <Input
        value={searchTerm}
        placeholder="Tìm kiếm..."
        onChange={(event) => onSearchTermChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            onRequestChange({
              ...request,
              pageIndex: 1,
              textSearch: searchTerm.trim() || undefined,
            })
          }
        }}
      />
    </div>
  )
}
