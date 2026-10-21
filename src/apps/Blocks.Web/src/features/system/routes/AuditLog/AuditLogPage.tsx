import { useMemo, useState } from "react";
import { useAuditLog } from "../../hooks/useAuditLog";
import { getColumns } from "./columns";
import { DiffViewerDialog } from "./DiffViewerDialog";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { useListPage } from "@/hooks/useListPage";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/datepicker";
import type { RowSelectionState } from "@tanstack/react-table";

const IS_SUCCESS_OPTIONS = [
  { Value: "true", Text: "Thành công" },
  { Value: "false", Text: "Thất bại" },
];

export default function AuditLogPage() {
  const {
    data,
    entityNames,
    actions,
    pageRequest,
    setPageRequest,
    selectedLog,
    getList,
    showDetail,
    closeDetail,
    isFetching,
  } = useAuditLog();

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const listPage = useListPage({
    data,
    rowSelection,
    pageRequest,
    setPageRequest,
    deleteList: () => {},
    setRowSelection,
    defaultPageRequest: {
      Action: undefined,
      EntityName: undefined,
      IsSuccess: undefined,
      FromDate: undefined,
      ToDate: undefined,
    },
  });

  const actionOptions = useMemo(
    () => actions.map((a) => ({ Value: a, Text: a })),
    [actions],
  );

  const entityOptions = useMemo(
    () => entityNames.map((n) => ({ Value: n, Text: n })),
    [entityNames],
  );

  const columns = useMemo(() => getColumns(showDetail), [showDetail]);

  return (
    <ListPageLayout
      columns={columns}
      data={data.Data}
      totalRow={data.TotalRow}
      rowSelection={rowSelection}
      setRowSelection={setRowSelection}
      pageRequest={pageRequest}
      setPageRequest={setPageRequest}
      onRefresh={getList}
      isLoading={isFetching}
      searchTerm={listPage.searchTerm}
      onSearchTermChange={listPage.setSearchTerm}
      onResetFilters={listPage.handleResetFilters}
      hideAdd
      filterGridCols="md:grid-cols-3"
      searchInputClassName="col-span-1 bg-background"
      filterContent={
        <>
          <Combobox
            options={actionOptions}
            value={pageRequest.Action}
            onValueChange={(val) =>
              setPageRequest((p: typeof pageRequest) => ({
                ...p,
                Action: val || undefined,
                PageIndex: 1,
              }))
            }
            placeholder="Tất cả hành động"
            searchPlaceholder="Tìm hành động..."
            emptyText="Không tìm thấy."
          />

          <Combobox
            options={entityOptions}
            value={pageRequest.EntityName}
            onValueChange={(val) =>
              setPageRequest((p: typeof pageRequest) => ({
                ...p,
                EntityName: val || undefined,
                PageIndex: 1,
              }))
            }
            placeholder="Tất cả tài nguyên"
            searchPlaceholder="Tìm tài nguyên..."
            emptyText="Không tìm thấy."
          />

          <Combobox
            options={IS_SUCCESS_OPTIONS}
            value={
              pageRequest.IsSuccess === undefined
                ? undefined
                : String(pageRequest.IsSuccess)
            }
            onValueChange={(val) =>
              setPageRequest((p: typeof pageRequest) => ({
                ...p,
                IsSuccess: val ? val === "true" : undefined,
                PageIndex: 1,
              }))
            }
            placeholder="Tất cả kết quả"
            searchPlaceholder="Tìm kết quả..."
            emptyText="Không tìm thấy."
          />

          <DatePicker
            optionLabel="Từ ngày..."
            value={
              pageRequest.FromDate ? new Date(pageRequest.FromDate) : undefined
            }
            onChange={(date) =>
              setPageRequest((p: typeof pageRequest) => ({
                ...p,
                FromDate: date
                  ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T00:00:00`
                  : undefined,
                PageIndex: 1,
              }))
            }
          />

          <DatePicker
            optionLabel="Đến ngày..."
            value={
              pageRequest.ToDate ? new Date(pageRequest.ToDate) : undefined
            }
            onChange={(date) =>
              setPageRequest((p: typeof pageRequest) => ({
                ...p,
                ToDate: date
                  ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T00:00:00`
                  : undefined,
                PageIndex: 1,
              }))
            }
          />
        </>
      }
    >
      <DiffViewerDialog
        log={selectedLog}
        open={selectedLog !== null}
        onOpenChange={(op) => !op && closeDetail()}
      />
    </ListPageLayout>
  );
}
