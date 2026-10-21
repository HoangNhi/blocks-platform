import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { useListPage } from "@/hooks/useListPage";
import { useCycleOptionsForExternalReview } from "@/features/business/hooks/useCycleOptionsForExternalReview";
import { useExternalReviewList } from "./hooks/useExternalReviewList";
import type {
  ExternalReviewListItem,
  ExternalReviewStatus,
} from "@/features/business/types/externalReview.types";
import { ExternalReviewStatus as ExternalReviewStatusEnum } from "@/features/business/types/externalReview.types";
import PopupExternalReview from "./PopupExternalReview";

const STATUS_LABELS: Record<ExternalReviewStatus, string> = {
  [ExternalReviewStatusEnum.New]: "Mới tạo",
  [ExternalReviewStatusEnum.InProgress]: "Đang thực hiện",
  [ExternalReviewStatusEnum.Completed]: "Đã kết thúc",
};

function parseExternalReviewStatus(
  value?: string,
): ExternalReviewStatus | undefined {
  if (!value) {
    return undefined;
  }

  if (value === "0" || value === "1" || value === "2") {
    return Number(value) as ExternalReviewStatus;
  }

  return undefined;
}

function getStatusBadgeClass(status: ExternalReviewStatus): string {
  switch (status) {
    case ExternalReviewStatusEnum.New:
      return "bg-slate-100 text-slate-700 border border-slate-300";
    case ExternalReviewStatusEnum.InProgress:
      return "bg-amber-100 text-amber-700 border border-amber-300";
    case ExternalReviewStatusEnum.Completed:
      return "bg-emerald-100 text-emerald-700 border border-emerald-300";
    default:
      return "bg-slate-100 text-slate-600 border border-slate-300";
  }
}

export default function ExternalReviewPage() {
  const {
    data,
    rowSelection,
    setRowSelection,
    pageRequest,
    setPageRequest,
    isFetching,
    refreshList,
    isOpen,
    selectedItem,
    openPopup,
    onOpenChange,
  } = useExternalReviewList();
  const cycleOptionsQuery = useCycleOptionsForExternalReview();

  const columns = useMemo<ColumnDef<ExternalReviewListItem>[]>(
    () => [
      {
        accessorKey: "CycleName",
        header: "Chu kỳ",
        cell: ({ row }) => (
          <div className="min-w-[240px]">
            <p className="font-medium text-slate-800">
              {row.original.CycleName}
            </p>
            <p className="text-xs text-slate-500">Năm {row.original.Year}</p>
          </div>
        ),
      },
      {
        accessorKey: "Status",
        header: () => <div className="text-center">Trạng thái</div>,
        meta: { className: "text-center" },
        cell: ({ row }) => (
          <div className="flex justify-center">
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusBadgeClass(
                row.original.Status as ExternalReviewStatus,
              )}`}
            >
              {STATUS_LABELS[row.original.Status as ExternalReviewStatus] ??
                "Không xác định"}
            </span>
          </div>
        ),
      },
      {
        accessorKey: "AccountCount",
        header: () => <div className="text-center">Tài khoản</div>,
        meta: { className: "text-center" },
      },
      {
        accessorKey: "ResultCount",
        header: () => <div className="text-center">Kết quả</div>,
        meta: { className: "text-center" },
      },
      {
        id: "actions",
        header: () => <div className="text-center">Hành động</div>,
        meta: { className: "text-center" },
        cell: ({ row }) => (
          <Button
            type="button"
            size="sm"
            onClick={() => openPopup(row.original)}
          >
            Xem
          </Button>
        ),
      },
    ],
    [openPopup],
  );

  const listPage = useListPage({
    data,
    rowSelection,
    pageRequest,
    setPageRequest,
    deleteList: () => {
      // External Review list không có hành động xóa trực tiếp.
    },
    setRowSelection,
    defaultPageRequest: {
      Status: undefined,
      CycleId: undefined,
    },
  });

  return (
    <ListPageLayout
      columns={columns}
      data={data.Data}
      totalRow={data.TotalRow}
      rowSelection={rowSelection}
      setRowSelection={setRowSelection}
      pageRequest={pageRequest}
      setPageRequest={setPageRequest}
      onRefresh={refreshList}
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
            options={[
              { Text: "Mới tạo", Value: "0" },
              { Text: "Đang thực hiện", Value: "1" },
              { Text: "Đã kết thúc", Value: "2" },
            ]}
            value={
              pageRequest.Status !== undefined && pageRequest.Status !== null
                ? String(pageRequest.Status)
                : undefined
            }
            onValueChange={(value) => {
              setPageRequest((prev) => ({
                ...prev,
                Status: parseExternalReviewStatus(value),
                PageIndex: 1,
              }));
            }}
            placeholder="Tất cả trạng thái"
            searchPlaceholder="Tìm trạng thái..."
            emptyText="Không tìm thấy trạng thái."
          />
          <Combobox
            options={cycleOptionsQuery.options ?? []}
            loading={cycleOptionsQuery.isLoading}
            value={pageRequest.CycleId ?? undefined}
            onValueChange={(value) => {
              setPageRequest((prev) => ({
                ...prev,
                CycleId: value || undefined,
                PageIndex: 1,
              }));
            }}
            placeholder="Tất cả chu kỳ"
            searchPlaceholder="Tìm chu kỳ..."
            emptyText="Không tìm thấy chu kỳ."
          />
        </>
      }
    >
      {isOpen && selectedItem ? (
        <PopupExternalReview
          open={isOpen}
          item={selectedItem}
          onOpenChange={onOpenChange}
          onDataChanged={refreshList}
        />
      ) : null}
    </ListPageLayout>
  );
}
