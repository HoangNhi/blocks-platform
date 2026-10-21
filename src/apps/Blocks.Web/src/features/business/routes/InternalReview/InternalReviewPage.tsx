import { useMemo } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { ListPageLayout } from "@/components/layout/ListPageLayout";
import { useListPage } from "@/hooks/useListPage";
import { useCycleOptions } from "@/features/business/hooks/useCycleOptions";
import { useInternalReview } from "@/features/business/hooks/useInternalReview";
import type { InternalReviewListItem } from "@/features/business/types/internalreview.types";
import type { SarStatus } from "@/features/business/types/sar.types";
import PopupInternalReview from "./PopupInternalReview";

const STATUS_LABELS: Record<SarStatus, string> = {
  1: "Nháp",
  2: "Đã nộp",
  3: "Yêu cầu chỉnh sửa",
  4: "Đã phê duyệt",
};

function parseSarStatus(value?: string): SarStatus | undefined {
  if (!value) {
    return undefined;
  }

  if (value === "2" || value === "3" || value === "4") {
    return Number(value) as SarStatus;
  }

  return undefined;
}

function getStatusBadgeClass(status: SarStatus): string {
  switch (status) {
    case 1:
      return "bg-slate-100 text-slate-700 border border-slate-300";
    case 2:
      return "bg-blue-100 text-blue-700 border border-blue-300";
    case 3:
      return "bg-amber-100 text-amber-700 border border-amber-300";
    case 4:
      return "bg-emerald-100 text-emerald-700 border border-emerald-300";
    default:
      return "bg-slate-100 text-slate-600 border border-slate-300";
  }
}

export default function InternalReviewPage() {
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
    openReviewPopup,
    onOpenChange,
  } = useInternalReview();
  const cycleOptions = useCycleOptions();

  const columns = useMemo<ColumnDef<InternalReviewListItem>[]>(
    () => [
      {
        accessorKey: "CycleName",
        header: "Chu kỳ",
        cell: ({ row }) => (
          <div className="min-w-[240px]">
            <p className="font-medium text-slate-800">{row.original.CycleName}</p>
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
                row.original.Status,
              )}`}
            >
              {STATUS_LABELS[row.original.Status]}
            </span>
          </div>
        ),
      },
      {
        accessorKey: "ReviewRound",
        header: () => <div className="text-center">Vòng đánh giá</div>,
        meta: { className: "text-center" },
      },
      {
        accessorKey: "CommentCount",
        header: () => <div className="text-center">Nhận xét</div>,
        meta: { className: "text-center" },
      },
      {
        id: "actions",
        header: () => <div className="text-center">Hành động</div>,
        meta: { className: "text-center" },
        cell: ({ row }) => (
          <Button type="button" size="sm" onClick={() => openReviewPopup(row.original)}>
            Xem
          </Button>
        ),
      },
    ],
    [openReviewPopup],
  );

  const listPage = useListPage({
    data,
    rowSelection,
    pageRequest,
    setPageRequest,
    deleteList: () => {
      // No delete action for internal review list.
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
              { Text: "Đã nộp", Value: "2" },
              { Text: "Yêu cầu chỉnh sửa", Value: "3" },
              { Text: "Đã phê duyệt", Value: "4" },
            ]}
            value={pageRequest.Status ? String(pageRequest.Status) : undefined}
            onValueChange={(val) => {
              setPageRequest((prev) => ({
                ...prev,
                Status: parseSarStatus(val),
                PageIndex: 1,
              }));
            }}
            placeholder="Tất cả trạng thái SAR"
            searchPlaceholder="Tìm trạng thái..."
            emptyText="Không tìm thấy trạng thái."
          />
          <Combobox
            options={cycleOptions.options ?? []}
            value={pageRequest.CycleId ?? undefined}
            onValueChange={(val) => {
              setPageRequest((prev) => ({
                ...prev,
                CycleId: val || undefined,
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
        <PopupInternalReview
          open={isOpen}
          item={selectedItem}
          onOpenChange={onOpenChange}
          onDataChanged={refreshList}
        />
      ) : null}
    </ListPageLayout>
  );
}
