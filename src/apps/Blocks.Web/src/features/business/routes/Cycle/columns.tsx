import { type ColumnDef, type Row } from "@tanstack/react-table";
import { MoreHorizontal, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { useState } from "react";
import type { CycleGetListPaging } from "@/features/business/types/cycle.types";
import { Checkbox } from "@/components/ui/checkbox";
import { format } from "date-fns";

const CYCLE_STATUS_MAP: Record<number, { label: string; className: string }> = {
  1: {
    label: "Lập kế hoạch",
    className: "bg-slate-100 text-slate-600 border border-slate-300",
  },
  2: {
    label: "Thực hiện",
    className: "bg-blue-100 text-blue-600 border border-blue-300",
  },
  3: {
    label: "Kiểm tra",
    className: "bg-amber-100 text-amber-600 border border-amber-300",
  },
  4: {
    label: "Cải tiến",
    className: "bg-purple-100 text-purple-600 border border-purple-300",
  },
  5: {
    label: "Kết thúc",
    className: "bg-green-100 text-green-600 border border-green-300",
  },
};

function getCycleStatusBadgeProps(status: number) {
  return (
    CYCLE_STATUS_MAP[status] ?? {
      label: "Không xác định",
      className: "bg-gray-100 text-gray-500 border border-gray-300",
    }
  );
}

export const getColumns = (
  showPopupDetail: (id: string, isEdit: boolean) => void,
  deleteList: (ids: string[]) => void,
  changeStatus: (id: string) => void,
): ColumnDef<CycleGetListPaging>[] => [
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
      accessorKey: "Name",
      header: "Chu kỳ",
    },
    {
      accessorKey: "Year",
      header: "Năm",
    },
    {
      accessorKey: "StandardSet",
      header: "Bộ tiêu chuẩn",
    },
    {
      accessorKey: "StatusName",
      header: () => <div className="text-center">Trạng thái</div>,
      meta: {
        className: "text-center",
      },
      cell: ({ row }) => {
        const status = Number(row.original.Status);
        const { label, className } = getCycleStatusBadgeProps(status);
        return (
          <div className="flex justify-center">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}
            >
              {label}
            </span>
          </div>
        );
      },
    },
    {
      accessorKey: "StartDate",
      header: () => <div className="text-center">Ngày bắt đầu</div>,
      meta: {
        className: "text-center",
      },
      cell: ({ row }) => {
        const date = row.getValue("StartDate");
        if (!date) return "";
        return <div className="text-center">{format(date as string, "dd/MM/yyyy")}</div>;
      },
    },
    {
      accessorKey: "EndDate",
      header: () => <div className="text-center">Ngày kết thúc</div>,
      meta: {
        className: "text-center",
      },
      cell: ({ row }) => {
        const date = row.getValue("EndDate");
        if (!date) return "";
        return <div className="text-center">{format(date as string, "dd/MM/yyyy")}</div>;
      },
    },
    {
      id: "actions",
      meta: {
        className: "text-center",
      },
      cell: ({ row }) => (
        <ActionCell
          row={row}
          showPopupDetail={showPopupDetail}
          deleteList={deleteList}
          changeStatus={changeStatus}
        />
      ),
    },
  ];

const ActionCell = ({
  row,
  showPopupDetail,
  deleteList,
  changeStatus,
}: {
  row: Row<CycleGetListPaging>;
  showPopupDetail: (id: string, isEdit: boolean) => void;
  deleteList: (ids: string[]) => void;
  changeStatus: (id: string) => void;
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showStatusConfirm, setShowStatusConfirm] = useState(false);

  const status = Number(row.original.Status);
  const canChangeStatus = status < 5;

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
          <DropdownMenuItem
            onClick={() => showPopupDetail(row.original.Id, true)}
          >
            Cập nhật
          </DropdownMenuItem>
          {canChangeStatus && (
            <DropdownMenuItem onClick={() => setShowStatusConfirm(true)}>
              Chuyển trạng thái
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setShowDeleteConfirm(true)}>
            Xóa
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Change Status Confirmation */}
      <Dialog open={showStatusConfirm} onOpenChange={setShowStatusConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận chuyển trạng thái</DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center gap-3 py-4">
            {(() => {
              const currentStatus = Number(row.original.Status);
              const nextStatus = currentStatus + 1;
              const current = getCycleStatusBadgeProps(currentStatus);
              const next = getCycleStatusBadgeProps(nextStatus);
              return (
                <>
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium opacity-60 ${current.className}`}
                  >
                    {current.label}
                  </span>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${next.className}`}
                  >
                    {next.label}
                  </span>
                </>
              );
            })()}
          </div>
          <DialogDescription className="text-center text-sm">
            Bạn có chắc chắn muốn chuyển trạng thái chu kỳ này không?
          </DialogDescription>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Hủy</Button>
            </DialogClose>
            <Button
              onClick={() => {
                changeStatus(row.original.Id);
                setShowStatusConfirm(false);
              }}
            >
              Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận xóa</DialogTitle>
            <DialogDescription>
              Bạn có chắc chắn muốn xóa bản ghi này không? Hành động này không
              thể hoàn tác.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Hủy</Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={() => {
                deleteList([row.original.Id]);
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

