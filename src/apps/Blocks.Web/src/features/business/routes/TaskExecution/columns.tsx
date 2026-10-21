import type { ColumnDef } from "@tanstack/react-table";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TaskExecutionPlanListItem } from "@/features/business/types/taskExecution.types";
import { getActionPlanStatusLabel } from "../ActionPlan/actionPlan.utils";

function getPriorityLabel(priority: number): string {
  switch (priority) {
    case 1:
      return "Cao";
    case 2:
      return "Trung bình";
    case 3:
      return "Thấp";
    default:
      return "Không xác định";
  }
}

function getStatusBadgeClass(status: number): string {
  switch (status) {
    case 1:
      return "bg-slate-100 text-slate-700 border border-slate-300";
    case 2:
      return "bg-blue-100 text-blue-700 border border-blue-300";
    case 3:
      return "bg-amber-100 text-amber-700 border border-amber-300";
    case 4:
      return "bg-emerald-100 text-emerald-700 border border-emerald-300";
    case 5:
      return "bg-cyan-100 text-cyan-700 border border-cyan-300";
    default:
      return "bg-slate-100 text-slate-600 border border-slate-300";
  }
}

export function getTaskExecutionColumns(
  onOpen: (item: TaskExecutionPlanListItem) => void,
  loadingItemId: string | null,
): ColumnDef<TaskExecutionPlanListItem>[] {
  return [
    {
      accessorKey: "Title",
      header: "Kế hoạch",
      cell: ({ row }) => (
        <div className="min-w-[240px]">
          <p className="font-medium text-slate-900">{row.original.Title}</p>
          {row.original.AssignedToNames ? (
            <p className="line-clamp-2 text-xs text-slate-500">{row.original.AssignedToNames}</p>
          ) : null}
        </div>
      ),
    },
    {
      accessorKey: "CycleName",
      header: "Chu kỳ",
      cell: ({ row }) => (
        <div>
          <p className="font-medium text-slate-700">{row.original.CycleName}</p>
          <p className="text-xs text-slate-500">Năm {row.original.Year}</p>
        </div>
      ),
    },
    {
      accessorKey: "Priority",
      header: "Ưu tiên",
      cell: ({ row }) => getPriorityLabel(Number(row.original.Priority)),
    },
    {
      accessorKey: "Deadline",
      header: "Hạn",
      cell: ({ row }) => new Date(row.original.Deadline).toLocaleDateString("vi-VN"),
    },
    {
      accessorKey: "DoneTaskCount",
      header: () => <div className="text-center">Tiến độ</div>,
      meta: { className: "text-center" },
      cell: ({ row }) => `${row.original.DoneTaskCount}/${row.original.TotalTaskCount}`,
    },
    {
      accessorKey: "Status",
      header: () => <div className="text-center">Trạng thái</div>,
      meta: { className: "text-center" },
      cell: ({ row }) => {
        const status = Number(row.original.Status);
        return (
          <div className="flex justify-center">
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusBadgeClass(status)}`}
            >
              {getActionPlanStatusLabel(status)}
            </span>
          </div>
        );
      },
    },
    {
      id: "actions",
      header: () => <div className="text-center">Hành động</div>,
      meta: { className: "text-center" },
      cell: ({ row }) => {
        const isThisLoading = loadingItemId === row.original.Id;
        return (
          <div className="flex justify-center">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => onOpen(row.original)}
              disabled={loadingItemId !== null}
            >
              {isThisLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Mở"}
            </Button>
          </div>
        );
      },
    },
  ];
}
