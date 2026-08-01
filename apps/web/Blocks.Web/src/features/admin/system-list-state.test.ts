import { describe, expect, it } from "vitest"

import {
  applyTextSearch,
  areAllVisibleSelected,
  changePage,
  changePageSize,
  createDefaultPagingRequest,
  resetPagingRequest,
  toggleAllSelectedIds,
  toggleSelectedId,
} from "./system-list-state"

describe("system list state helpers", () => {
  it("creates the default paging request", () => {
    expect(createDefaultPagingRequest()).toEqual({
      pageIndex: 1,
      pageSize: 20,
      textSearch: undefined,
      fromDate: undefined,
      toDate: undefined,
    })
  })

  it("applies text search and resets the page index", () => {
    expect(
      applyTextSearch(
        { pageIndex: 3, pageSize: 20, textSearch: undefined },
        " admin ",
      ),
    ).toEqual({
      pageIndex: 1,
      pageSize: 20,
      textSearch: "admin",
    })
  })

  it("changes page size and resets page index", () => {
    expect(
      changePageSize(
        { pageIndex: 4, pageSize: 20, textSearch: "admin" },
        50,
      ),
    ).toEqual({
      pageIndex: 1,
      pageSize: 50,
      textSearch: "admin",
    })
  })

  it("toggles a single row id", () => {
    expect(toggleSelectedId([], "row-1")).toEqual(["row-1"])
    expect(toggleSelectedId(["row-1", "row-2"], "row-1")).toEqual(["row-2"])
  })

  it("toggles all visible row ids without losing off-screen selections", () => {
    expect(toggleAllSelectedIds(["persisted"], ["row-1", "row-2"])).toEqual([
      "persisted",
      "row-1",
      "row-2",
    ])

    expect(
      toggleAllSelectedIds(["persisted", "row-1", "row-2"], ["row-1", "row-2"]),
    ).toEqual(["persisted"])
  })

  it("reports whether all visible ids are selected", () => {
    expect(areAllVisibleSelected(["row-1", "row-2"], ["row-1", "row-2"])).toBe(
      true,
    )
    expect(areAllVisibleSelected(["row-1"], ["row-1", "row-2"])).toBe(false)
  })

  it("resets the paging request to the default page size", () => {
    expect(resetPagingRequest(50)).toEqual({
      pageIndex: 1,
      pageSize: 50,
      textSearch: undefined,
      fromDate: undefined,
      toDate: undefined,
    })
  })

  it("changes the page index without mutating other fields", () => {
    expect(
      changePage(
        { pageIndex: 1, pageSize: 20, textSearch: "admin" },
        2,
      ),
    ).toEqual({
      pageIndex: 2,
      pageSize: 20,
      textSearch: "admin",
    })
  })
})
