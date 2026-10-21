import { type ColumnDef, type Row } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
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
import type { StandardSet } from "@/features/catalog/types/standardset.types";
import { Checkbox } from "@/components/ui/checkbox";
import { formatDate } from "@/lib/utils";

export const getColumns = (
  showPopupDetail: (id: string, isEdit: boolean) => void,
  deleteList: (ids: string[]) => void,
): ColumnDef<StandardSet>[] => [
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
      accessorKey: "Code",
      header: "Mã bộ tiêu chuẩn",
    },
    {
      accessorKey: "Name",
      header: "Tên bộ tiêu chuẩn",
    },
    {
      accessorKey: "EvaluationMode_Name",
      header: "Chế độ đánh giá",
      cell: ({ row }) => row.original.EvaluationMode_Name || "-",
    },
    {
      accessorKey: "CreateAt",
      header: "Ngày tạo",
      cell: ({ row }) => (row.original.CreatedAt ? formatDate(row.original.CreatedAt) : ""),
    },
    {
      accessorKey: "UpdatedAt",
      header: "Ngày cập nhật",
      cell: ({ row }) => (row.original.UpdatedAt ? formatDate(row.original.UpdatedAt) : ""),
    },
    {
      accessorKey: "IsActived",
      header: "Trạng thái",
      cell: ({ row }) =>
        row.original.IsActived ? "Hoạt động" : "Không hoạt động",
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
        />
      ),
    },
  ];

const ActionCell = ({
  row,
  showPopupDetail,
  deleteList,
}: {
  row: Row<StandardSet>;
  showPopupDetail: (id: string, isEdit: boolean) => void;
  deleteList: (ids: string[]) => void;
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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
          <DropdownMenuItem onClick={() => setShowDeleteConfirm(true)}>
            Xóa
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận xóa</DialogTitle>
            <DialogDescription>
              Bạn có chắc chắn muốn xóa bộ tiêu chuẩn này không? Hành động này
              không thể được hoàn tác.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Hủy
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={() => {
                deleteList([row.original.Id]);
                setShowDeleteConfirm(false);
              }}
              variant="destructive"
            >
              Xóa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

