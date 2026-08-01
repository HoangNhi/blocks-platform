import type { ReactNode } from "react"
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, RefreshCw } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

import {
  areAllVisibleSelected,
  toggleAllSelectedIds,
  toggleSelectedId,
} from "../system-list-state"

export type SystemColumn<TItem> = {
  key: string
  header: ReactNode
  cell: (item: TItem) => ReactNode
  headerClassName?: string
  cellClassName?: string
}

type SystemSelectionState = {
  selectedIds: string[]
  onSelectedIdsChange: (nextIds: string[]) => void
}

type SystemDataTableProps<TItem> = {
  columns: SystemColumn<TItem>[]
  items: TItem[]
  getRowKey: (item: TItem) => string
  selection?: SystemSelectionState
  pageIndex: number
  pageSize: number
  totalRow: number
  onPageChange: (pageIndex: number) => void
  onPageSizeChange: (pageSize: number) => void
  onRefresh: () => void
  isLoading: boolean
  error: string | null
  emptyTitle: string
  emptyDescription: string
  rowActions?: (item: TItem) => ReactNode
}

export function SystemDataTable<TItem>({
  columns,
  items,
  getRowKey,
  selection,
  pageIndex,
  pageSize,
  totalRow,
  onPageChange,
  onPageSizeChange,
  onRefresh,
  isLoading,
  error,
  emptyTitle,
  emptyDescription,
  rowActions,
}: SystemDataTableProps<TItem>) {
  const hasSelection = Boolean(selection)
  const selectedIds = selection?.selectedIds ?? []
  const visibleIds = items.map(getRowKey)
  const allVisibleSelected =
    hasSelection && areAllVisibleSelected(selectedIds, visibleIds)
  const partiallySelected =
    hasSelection &&
    !allVisibleSelected &&
    visibleIds.some((visibleId) => selectedIds.includes(visibleId))
  const pageCount = Math.max(1, Math.ceil(totalRow / pageSize))
  const startRow = totalRow > 0 ? (pageIndex - 1) * pageSize + 1 : 0
  const endRow = totalRow > 0 ? Math.min(pageIndex * pageSize, totalRow) : 0

  return (
    <Card className="h-full min-h-0 gap-0 overflow-hidden border-platform-border py-0 shadow-sm">
      <CardContent className="min-h-0 flex-1 p-0">
        {error ? (
          <div className="p-4">
            <Alert variant="destructive">
              <AlertTitle>Không thể tải dữ liệu</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        ) : (
          <div
            data-slot="system-data-table-scroll-area"
            className="h-full overflow-auto"
          >
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_rgba(15,23,42,0.08)]">
                <TableRow>
                  {hasSelection ? (
                    <TableHead className="w-12">
                      <Checkbox
                        checked={
                          allVisibleSelected
                            ? true
                            : partiallySelected
                              ? "indeterminate"
                              : false
                        }
                        onCheckedChange={() =>
                          selection?.onSelectedIdsChange(
                            toggleAllSelectedIds(selectedIds, visibleIds),
                          )
                        }
                        aria-label="Chọn các hàng đang hiển thị"
                      />
                    </TableHead>
                  ) : null}
                  {columns.map((column) => (
                    <TableHead key={column.key} className={column.headerClassName}>
                      {column.header}
                    </TableHead>
                  ))}
                  {rowActions ? (
                    <TableHead className="w-14 text-right">
                      <span className="sr-only">Thao tác</span>
                    </TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: Math.min(pageSize, 10) }).map((_, index) => (
                    <TableRow key={`skeleton-${index}`}>
                      {hasSelection ? (
                        <TableCell>
                          <Skeleton className="h-4 w-4" />
                        </TableCell>
                      ) : null}
                      {columns.map((column) => (
                        <TableCell key={`${column.key}-${index}`}>
                          <Skeleton className="h-4 w-full max-w-[180px]" />
                        </TableCell>
                      ))}
                      {rowActions ? (
                        <TableCell className="text-right">
                          <Skeleton className="ml-auto h-8 w-8 rounded-md" />
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))
                ) : items.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={columns.length + (hasSelection ? 1 : 0) + (rowActions ? 1 : 0)}
                      className="py-10 text-center"
                    >
                      <div className="grid gap-1">
                        <strong className="text-sm text-platform-ink">{emptyTitle}</strong>
                        <span className="text-sm text-platform-muted">{emptyDescription}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  items.map((item) => {
                    const rowId = getRowKey(item)

                    return (
                      <TableRow key={rowId} data-state={selectedIds.includes(rowId) ? "selected" : undefined}>
                        {hasSelection ? (
                          <TableCell>
                            <Checkbox
                              checked={selectedIds.includes(rowId)}
                              onCheckedChange={() =>
                                selection?.onSelectedIdsChange(
                                  toggleSelectedId(selectedIds, rowId),
                                )
                              }
                              aria-label={`Chọn hàng ${rowId}`}
                            />
                          </TableCell>
                        ) : null}
                        {columns.map((column) => (
                          <TableCell
                            key={`${rowId}-${column.key}`}
                            className={cn(column.cellClassName)}
                          >
                            {column.cell(item)}
                          </TableCell>
                        ))}
                        {rowActions ? (
                          <TableCell className="text-right">{rowActions(item)}</TableCell>
                        ) : null}
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      <CardFooter className="shrink-0 flex flex-wrap items-center justify-between gap-4 border-t px-4 py-3">
        <div className="text-sm text-platform-muted">
          {totalRow > 0
            ? `Hiển thị ${startRow} - ${endRow} trong ${totalRow} mục`
            : "Không có dữ liệu"}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Số dòng mỗi trang</span>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => onPageSizeChange(Number(value))}
            >
              <SelectTrigger className="h-8 w-[90px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 30, 50].map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <span className="text-sm font-medium">{`Trang ${pageIndex} / ${pageCount}`}</span>
          <Button
            variant="outline"
            size="icon"
            onClick={() => onPageChange(1)}
            disabled={pageIndex === 1}
          >
            <span className="sr-only">Trang đầu</span>
            <ChevronsLeft className="size-4" aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => onPageChange(Math.max(1, pageIndex - 1))}
            disabled={pageIndex === 1}
          >
            <span className="sr-only">Trang trước</span>
            <ChevronLeft className="size-4" aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => onPageChange(Math.min(pageCount, pageIndex + 1))}
            disabled={pageIndex === pageCount}
          >
            <span className="sr-only">Trang sau</span>
            <ChevronRight className="size-4" aria-hidden="true" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => onPageChange(pageCount)}
            disabled={pageIndex === pageCount}
          >
            <span className="sr-only">Trang cuối</span>
            <ChevronsRight className="size-4" aria-hidden="true" />
          </Button>
          <Button variant="outline" size="sm" onClick={onRefresh}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Làm mới
          </Button>
        </div>
      </CardFooter>
    </Card>
  )
}
