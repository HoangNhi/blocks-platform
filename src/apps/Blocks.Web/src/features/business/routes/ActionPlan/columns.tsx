import { type ColumnDef, type Row } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ActionPlanListItem } from "@/features/business/types/actionPlan.types";
import {
  canDeleteActionPlan,
  getActionPlanStatusColor,
  getActionPlanStatusLabel,
} from "./actionPlan.utils";

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

export function getActionPlanColumns(
  onEdit: (item: ActionPlanListItem) => void,
  onDelete: (item: ActionPlanListItem) => void,
): ColumnDef<ActionPlanListItem>[] {
  return [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={
            table.getIsAllPageRowsSelected() ||
            (table.getIsSomePageRowsSelected() && "indeterminate")
          }
          onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      ),
    },
    {
      accessorKey: "Title",
      header: "Kế hoạch",
      cell: ({ row }) => (
        <div className="min-w-[240px]">
          <p className="font-medium text-slate-900">{row.original.Title}</p>
          {row.original.Description ? (
            <p className="line-clamp-2 text-xs text-slate-500">
              {row.original.Description}
            </p>
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
      accessorKey: "AssigneeCount",
      header: () => <div className="text-center">Giao việc</div>,
      meta: { className: "text-center" },
      cell: ({ row }) => row.original.AssigneeCount,
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
          <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${getActionPlanStatusColor(status)}`}
          >
            {getActionPlanStatusLabel(status)}
          </span>
        );
      },
    },
    {
      id: "actions",
      header: () => <div className="text-center">Hành động</div>,
      meta: { className: "text-center" },
      cell: ({ row }) => <ActionCell row={row} onEdit={onEdit} onDelete={onDelete} />,
    },
  ];
}

const ActionCell = ({
  row,
  onEdit,
  onDelete,
}: {
  row: Row<ActionPlanListItem>;
  onEdit: (item: ActionPlanListItem) => void;
  onDelete: (item: ActionPlanListItem) => void;
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const status = Number(row.original.Status);
  const canDelete = canDeleteActionPlan(status);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Chức năng</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => onEdit(row.original)}>
            Cập nhật
          </DropdownMenuItem>
          {canDelete ? (
            <DropdownMenuItem onClick={() => setShowDeleteConfirm(true)}>
              Xóa
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận xóa</DialogTitle>
            <DialogDescription>
              Bạn có chắc chắn muốn xóa bản ghi này không? Hành động này không thể
              hoàn tác.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Hủy</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                onDelete(row.original);
                setShowDeleteConfirm(false);
              }}
            >
              Xóa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
