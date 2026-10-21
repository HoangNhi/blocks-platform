import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type RowSelectionState,
  type OnChangeFn,
} from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeft,
  ChevronsRight,
  RotateCw,
  Loader2,
} from "lucide-react";
import type { GetListPagingRequest } from "@/types/base/base.types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  totalRow?: number;
  rowSelection?: RowSelectionState;
  setRowSelection?: OnChangeFn<RowSelectionState>;
  pageRequest?: any;
  setPageRequest?: (pageRequest: any) => void;
  onRefresh?: () => void;
  isLoading?: boolean;
  className?: string;
  containerClassName?: string;
  getRowId?: (row: TData, index: number) => string;
  getRowClassName?: (row: TData) => string | undefined;
  meta?: any;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  totalRow,
  rowSelection,
  setRowSelection,
  pageRequest,
  setPageRequest,
  onRefresh,
  isLoading = false,
  className,
  containerClassName = "h-[calc(100vh-350px)] overflow-auto w-full relative",
  getRowId,
  getRowClassName,
  meta,
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    onRowSelectionChange: setRowSelection,
    getRowId,
    state: {
      rowSelection,
    },
    meta,
  });

  return (
    <div className={cn("space-y-4 w-full", className)}>
      {/* Khung bao ngoài cùng: Bo góc, có viền, nền trắng */}
      <div className="relative w-full overflow-clip rounded-md border flex flex-col bg-white">

        {/* Wrapper cho khung cuộn để neo Overlay Loading đúng phần Body */}
        <div className="relative w-full">
          {/* Loading Overlay */}
          {isLoading && (
            <div className="absolute top-[48px] inset-x-0 bottom-0 z-50 flex items-center justify-center bg-background/50 backdrop-blur-[1px]">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}

          {/* 👇 KHUNG CUỘN CHÍNH (Nơi chứa thanh cuộn) */}
          <div className={cn(
            containerClassName,
            // Custom scrollbar để margin-top hoạt động (bắt buộc phải có width/height thì track/thumb mới được render custom)
            "[&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar]:h-2",
            "[&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-track]:mt-[48px]",
            "[&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/20 hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/40"
          )}>
            <table className="w-full caption-bottom text-sm text-left">
              {/* Header */}
              <thead className="bg-background">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr
                    key={headerGroup.id}
                    className="border-b transition-colors data-[state=selected]:bg-muted"
                  >
                    {headerGroup.headers.map((header) => (
                      <th
                        key={header.id}
                        // Dùng pseudo-element về border 1px ở dưới màng sticky, kết hợp shadow
                        className={cn(
                          "h-12 px-4 text-left align-middle font-medium text-muted-foreground whitespace-nowrap sticky top-0 z-20 bg-white",
                          "after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[1px] after:bg-border",
                          "shadow-[0_4px_4px_-2px_rgba(0,0,0,0.05)]",
                          (header.column.columnDef.meta as { headerClassName?: string })?.headerClassName
                        )}
                      >
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>

              {/* Body */}
              <tbody className="[&_tr:last-child]:border-0">
                {table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <tr
                      key={row.id}
                      data-state={
                        rowSelection && row.getIsSelected() && "selected"
                      }
                      className={cn(
                        "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
                        getRowClassName?.(row.original),
                      )}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <td
                          key={cell.id}
                          className={cn(
                            "p-4 align-middle",
                            (cell.column.columnDef.meta as { className?: string })
                              ?.className,
                          )}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={columns.length}
                      className="h-24 text-center align-middle"
                    >
                      Không có dữ liệu
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 👇 PAGINATION: Nằm trong khung border, ngăn cách bằng border-t */}
        {pageRequest && totalRow !== undefined && (
          <div className="shrink-0 border-t bg-white">
            <DataTablePagination
              pageRequest={pageRequest}
              setPageRequest={setPageRequest}
              totalRow={totalRow}
              onRefresh={onRefresh}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// --- Component Pagination ---
interface DataTablePaginationProps {
  pageRequest: GetListPagingRequest;
  setPageRequest?: (pageRequest: GetListPagingRequest) => void;
  totalRow: number;
  onRefresh?: () => void;
}

function DataTablePagination({
  pageRequest,
  setPageRequest,
  totalRow,
  onRefresh,
}: DataTablePaginationProps) {
  const pageCount = Math.ceil(totalRow / pageRequest.PageSize) || 1;
  const pageSizeOptions = [10, 20, 30, 50, 100];

  return (
    <div className="flex items-center justify-between px-4 py-3 w-full">
      <div className="flex-1 text-sm text-muted-foreground hidden sm:block">
        {totalRow > 0 ? (
          <>
            Hiển thị{" "}
            <span className="font-medium">
              {(pageRequest.PageIndex - 1) * pageRequest.PageSize + 1}
            </span>{" "}
            -{" "}
            <span className="font-medium">
              {Math.min(pageRequest.PageIndex * pageRequest.PageSize, totalRow)}
            </span>{" "}
            trong <span className="font-medium">{totalRow}</span> mục
          </>
        ) : (
          "Không có dữ liệu"
        )}
      </div>
      <div className="flex items-center space-x-6 lg:space-x-8">
        <div className="flex items-center space-x-2">
          <p className="text-sm font-medium hidden sm:block">
            Số dòng mỗi trang
          </p>
          <Select
            value={`${pageRequest.PageSize}`}
            onValueChange={(value) => {
              setPageRequest?.({
                ...pageRequest,
                PageSize: Number(value),
                PageIndex: 1,
              });
            }}
          >
            <SelectTrigger className="h-8 w-[90px]">
              <SelectValue placeholder={pageRequest.PageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {pageSizeOptions.map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex w-[100px] items-center justify-center text-sm font-medium">
            Trang {pageRequest.PageIndex} / {pageCount}
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              className="hidden h-8 w-8 p-0 lg:flex"
              onClick={() =>
                setPageRequest?.({
                  ...pageRequest,
                  PageIndex: 1,
                })
              }
              disabled={pageRequest.PageIndex === 1}
            >
              <span className="sr-only">Go to first page</span>
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() =>
                setPageRequest?.({
                  ...pageRequest,
                  PageIndex: pageRequest.PageIndex - 1,
                })
              }
              disabled={pageRequest.PageIndex === 1}
            >
              <span className="sr-only">Go to previous page</span>
              <ChevronLeftIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="h-8 w-8 p-0"
              onClick={() =>
                setPageRequest?.({
                  ...pageRequest,
                  PageIndex: pageRequest.PageIndex + 1,
                })
              }
              disabled={pageRequest.PageIndex === pageCount}
            >
              <span className="sr-only">Go to next page</span>
              <ChevronRightIcon className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              className="hidden h-8 w-8 p-0 lg:flex"
              onClick={() =>
                setPageRequest?.({
                  ...pageRequest,
                  PageIndex: pageCount,
                })
              }
              disabled={pageRequest.PageIndex === pageCount}
            >
              <span className="sr-only">Go to last page</span>
              <ChevronsRight className="h-4 w-4" />
            </Button>

            {onRefresh && (
              <Button
                variant="outline"
                className="h-8 w-8 p-0 ml-2"
                onClick={onRefresh}
                title="Làm mới"
              >
                <RotateCw className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
