import type { AuditLogPagingRequest } from "./types"

export function createDefaultAuditLogRequest(
  pageSize = 20,
): AuditLogPagingRequest {
  return {
    pageIndex: 1,
    pageSize,
    textSearch: undefined,
    action: undefined,
    entityName: undefined,
    userId: undefined,
    serviceName: undefined,
    isSuccess: undefined,
    fromDate: undefined,
    toDate: undefined,
  }
}

export function resetAuditLogRequest(
  pageSize = 20,
): AuditLogPagingRequest {
  return createDefaultAuditLogRequest(pageSize)
}

export function updateAuditLogFilter<K extends keyof AuditLogPagingRequest>(
  request: AuditLogPagingRequest,
  key: K,
  value: AuditLogPagingRequest[K],
): AuditLogPagingRequest {
  return {
    ...request,
    pageIndex: 1,
    [key]: value ?? undefined,
  }
}

export function updateAuditLogDate(
  request: AuditLogPagingRequest,
  key: "fromDate" | "toDate",
  dateValue: string,
): AuditLogPagingRequest {
  return {
    ...request,
    pageIndex: 1,
    [key]: dateValue ? `${dateValue}T00:00:00` : undefined,
  }
}
