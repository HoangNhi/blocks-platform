import { describe, expect, it } from "vitest"

import {
  createDefaultAuditLogRequest,
  resetAuditLogRequest,
  updateAuditLogDate,
  updateAuditLogFilter,
} from "./audit-log-filter-state"

describe("audit log filter state helpers", () => {
  it("creates the default audit log request", () => {
    expect(createDefaultAuditLogRequest()).toEqual({
      pageIndex: 1,
      pageSize: 20,
      textSearch: undefined,
      action: undefined,
      entityName: undefined,
      userId: undefined,
      serviceName: undefined,
      isSuccess: undefined,
      fromDate: undefined,
      toDate: undefined,
    })
  })

  it("updates text-based filters and resets the page index", () => {
    expect(
      updateAuditLogFilter(
        { pageIndex: 4, pageSize: 20, textSearch: undefined },
        "action",
        "LOGIN",
      ),
    ).toEqual({
      pageIndex: 1,
      pageSize: 20,
      textSearch: undefined,
      action: "LOGIN",
    })
  })

  it("translates date input into API datetime strings", () => {
    expect(
      updateAuditLogDate(
        createDefaultAuditLogRequest(),
        "fromDate",
        "2026-05-12",
      ).fromDate,
    ).toBe("2026-05-12T00:00:00")
  })

  it("clears audit log filters back to the requested page size", () => {
    expect(resetAuditLogRequest(50)).toEqual({
      pageIndex: 1,
      pageSize: 50,
      textSearch: undefined,
      action: undefined,
      entityName: undefined,
      userId: undefined,
      serviceName: undefined,
      isSuccess: undefined,
      fromDate: undefined,
      toDate: undefined,
    })
  })
})
