import { type ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import type { SarGetListItem, SarStatus } from "@/features/business/types/sar.types";

const DEFAULT_STATUS_META = {
  label: "Unknown",
  className: "bg-gray-100 text-gray-500 border border-gray-300",
};

const SAR_STATUS_META: Record<SarStatus, { label: string; className: string }> = {
  1: {
    label: "Nháp",
    className: "bg-slate-100 text-slate-600 border border-slate-300",
  },
  2: {
    label: "Đã nộp",
    className: "bg-blue-100 text-blue-600 border border-blue-300",
  },
  3: {
    label: "Yêu cầu chỉnh sửa",
    className: "bg-amber-100 text-amber-700 border border-amber-300",
  },
  4: {
    label: "Đã phê duyệt",
    className: "bg-emerald-100 text-emerald-700 border border-emerald-300",
  },
};

function getStatusMeta(status: SarStatus | null | undefined) {
  if (!status) {
    return DEFAULT_STATUS_META;
  }

  return SAR_STATUS_META[status] ?? DEFAULT_STATUS_META;
}

export const getColumns = (
  openEditor: (item: SarGetListItem) => void,
  isReadOnly: boolean = false,
  showCycleColumn: boolean = true,
  showStatusColumn: boolean = true,
): ColumnDef<SarGetListItem>[] => {
  const columns: ColumnDef<SarGetListItem>[] = [
    {
      accessorKey: "CycleName",
      header: "Chu kỳ",
      cell: ({ row }) =>
        isReadOnly ? (
          <span>{row.original.CycleName}</span>
        ) : (
          <button
            type="button"
            className="text-left text-primary hover:underline"
            onClick={() => openEditor(row.original)}
          >
            {row.original.CycleName}
          </button>
        ),
    },
    {
      accessorKey: "Year",
      header: () => <div className="text-center">Năm</div>,
      meta: {
        className: "text-center",
      },
    },
    {
      accessorKey: "Status",
      header: () => <div className="text-center">Trạng thái SAR</div>,
      meta: {
        className: "text-center",
      },
      cell: ({ row }) => {
        const meta = getStatusMeta(row.original.Status);
        return (
          <div className="flex justify-center">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.className}`}
            >
              {meta.label}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "LastSavedAt",
      header: () => <div className="text-center">Lưu lần cuối</div>,
      meta: {
        className: "text-center",
      },
      cell: ({ row }) => {
        const value = row.original.LastSavedAt;
        if (!value) {
          return <div className="text-center text-muted-foreground">--</div>;
        }

        return <div className="text-center">{format(new Date(value), "dd/MM/yyyy HH:mm")}</div>;
      },
    },
    {
      accessorKey: "UpdatedBy",
      header: "Người cập nhật",
      cell: ({ row }) => row.original.UpdatedBy || "--",
    },
    {
      id: "actions",
      header: () => <div className="text-center">Thao tác</div>,
      meta: {
        className: "text-center",
      },
      cell: ({ row }) => (
        <Button size="sm" onClick={() => openEditor(row.original)}>
          Xem
        </Button>
      ),
    },
  ];

  let result = columns;

  if (!showCycleColumn) {
    result = result.filter(
      (col) => !("accessorKey" in col) || col.accessorKey !== "CycleName",
    );
  }

  if (!showStatusColumn) {
    result = result.filter(
      (col) => !("accessorKey" in col) || col.accessorKey !== "Status",
    );
  }

  return result;
};
