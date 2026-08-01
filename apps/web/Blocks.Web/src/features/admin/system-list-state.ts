import type { PagingRequest } from "@/lib/api/types"

export function createDefaultPagingRequest(pageSize = 20): PagingRequest {
  return {
    pageIndex: 1,
    pageSize,
    textSearch: undefined,
    fromDate: undefined,
    toDate: undefined,
  }
}

export function applyTextSearch(
  request: PagingRequest,
  searchTerm: string,
): PagingRequest {
  const nextSearch = searchTerm.trim()

  return {
    ...request,
    pageIndex: 1,
    textSearch: nextSearch ? nextSearch : undefined,
  }
}

export function resetPagingRequest(pageSize = 20): PagingRequest {
  return createDefaultPagingRequest(pageSize)
}

export function changePage(
  request: PagingRequest,
  pageIndex: number,
): PagingRequest {
  return {
    ...request,
    pageIndex,
  }
}

export function changePageSize(
  request: PagingRequest,
  pageSize: number,
): PagingRequest {
  return {
    ...request,
    pageIndex: 1,
    pageSize,
  }
}

export function toggleSelectedId(selectedIds: string[], id: string): string[] {
  return selectedIds.includes(id)
    ? selectedIds.filter((currentId) => currentId !== id)
    : [...selectedIds, id]
}

export function toggleAllSelectedIds(
  selectedIds: string[],
  visibleIds: string[],
): string[] {
  const allVisibleSelected =
    visibleIds.length > 0 &&
    visibleIds.every((visibleId) => selectedIds.includes(visibleId))

  if (allVisibleSelected) {
    return selectedIds.filter((selectedId) => !visibleIds.includes(selectedId))
  }

  return Array.from(new Set([...selectedIds, ...visibleIds]))
}

export function areAllVisibleSelected(
  selectedIds: string[],
  visibleIds: string[],
): boolean {
  return (
    visibleIds.length > 0 &&
    visibleIds.every((visibleId) => selectedIds.includes(visibleId))
  )
}
