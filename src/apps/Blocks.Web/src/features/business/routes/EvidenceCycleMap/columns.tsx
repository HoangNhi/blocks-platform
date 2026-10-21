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
import { Checkbox } from "@/components/ui/checkbox";
import { EVIDENCE_STATUS_OPTIONS } from "@/constants/business.constants";
import type { EvidenceCycleMapGetListPaging } from "../../types/evidence-cycle-map.types";

export const getColumns = (
  showPopupDetail: (id: string, isEdit: boolean) => void,
  deleteList: (ids: string[]) => void,
  fileTypeMap?: Record<string, string>,
  isReadOnly: boolean = false,
): ColumnDef<EvidenceCycleMapGetListPaging>[] => {
  const columns: ColumnDef<EvidenceCycleMapGetListPaging>[] = [
    {
      accessorKey: "evidenceCode",
      header: "Mã MC",
      meta: {
        headerClassName: "text-center",
      },
    },
    {
      accessorKey: "evidenceName",
      header: "Tên minh chứng",
      meta: {
        headerClassName: "text-center",
      },
    },
    {
      accessorKey: "fileTypeId",
      meta: {
        headerClassName: "text-center",
      },
      header: "Loại tài liệu",
      cell: ({ row }) => {
        const name = fileTypeMap?.[row.original.fileTypeId ?? ""];
        return <span>{name ?? "-"}</span>;
      },
    },
  ];

  if (!isReadOnly) {
    columns.splice(2, 0, {
      accessorKey: "cycleName",
      header: "Chu kỳ",
      meta: {
        headerClassName: "text-center",
      },
    });

    columns.push({
      accessorKey: "evidenceStatus",
      header: "Trạng thái minh chứng",
      meta: {
        className: "text-center",
        headerClassName: "text-center",
      },
      cell: ({ row }) => {
        const status = row.getValue("evidenceStatus") as number;
        const statusOption = EVIDENCE_STATUS_OPTIONS.find(
          (opt) => opt.Value === status?.toString(),
        );
        const statusText = statusOption?.Text || "N/A";

        const statusColors: Record<number, string> = {
          1: "bg-gray-100 text-gray-700",
          2: "bg-yellow-100 text-yellow-700",
          3: "bg-green-100 text-green-700",
        };

        const colorClass = statusColors[status] || "bg-gray-100 text-gray-700";

        return (
          <span
            className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${colorClass}`}
          >
            {statusText}
          </span>
        );
      },
    });
  }

  if (!isReadOnly) {
    columns.unshift({
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
      meta: {
        className: "w-[50px] text-center",
        headerClassName: "w-[50px] text-center",
      },
    });
  }

  columns.push({
    id: "actions",
    meta: {
      className: "w-[120px] text-center",
      headerClassName: "w-[120px] text-center",
    },
    cell: ({ row }) =>
      isReadOnly ? (
        <Button
          type="button"
          size="sm"
          onClick={() => showPopupDetail(row.original.Id, true)}
        >
          Xem
        </Button>
      ) : (
        <ActionCell
          row={row}
          showPopupDetail={showPopupDetail}
          deleteList={deleteList}
        />
      ),
  });

  return columns;
};

const ActionCell = ({
  row,
  showPopupDetail,
  deleteList,
}: {
  row: Row<EvidenceCycleMapGetListPaging>;
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
