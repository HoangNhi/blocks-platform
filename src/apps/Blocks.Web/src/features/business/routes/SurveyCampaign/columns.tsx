import { type ColumnDef, type Row } from "@tanstack/react-table";
import { useState } from "react";
import {
  Send,
  StopCircle,
  SquarePen,
  Users,
  Trash2,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
import type { SurveyCampaignGetListPaging } from "../../types/survey-campaign.types";
import { Checkbox } from "@/components/ui/checkbox";

export const getColumns = (
  showPopupDetail: (id: string, isEdit: boolean) => void,
  deleteList: (ids: string[]) => void,
  showPopupSession: (id: string, name: string) => void,
  changeStatus: (id: string) => Promise<void>,
  isReadOnly: boolean = false,
): ColumnDef<SurveyCampaignGetListPaging>[] => {
  const columns: ColumnDef<SurveyCampaignGetListPaging>[] = [
    {
      accessorKey: "Cycle",
      header: "Quy trình",
    },
    {
      accessorKey: "Name",
      header: "Tên chiến dịch",
      cell: ({ row }) => (
        <div className="max-w-75">
          <p className="line-clamp-2 font-medium leading-5">
            {row.original.Name}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "Stakeholder",
      header: "Loại đối tượng",
    },
    {
      accessorKey: "Status",
      header: "Trạng thái",
      cell: ({ row }) => {
        const status = row.original.Status;
        const statusConfig: Record<
          number,
          { text: string; className: string }
        > = {
          1: {
            text: "Chưa bắt đầu",
            className: "bg-gray-100 text-gray-800 hover:bg-gray-200",
          },
          2: {
            text: "Đang diễn ra",
            className: "bg-blue-100 text-blue-800 hover:bg-blue-200",
          },
          3: {
            text: "Đã kết thúc",
            className: "bg-green-100 text-green-800 hover:bg-green-200",
          },
        };

        const config = statusConfig[status] || {
          text: "Không xác định",
          className: "bg-gray-100 text-gray-800",
        };

        return (
          <div className="flex">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${config.className}`}
            >
              {config.text}
            </span>
          </div>
        );
      },
    },
  ];

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
    });
  }

  columns.push({
    id: "actions",
    meta: {
      className: "text-center",
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
          showPopupSession={showPopupSession}
          changeStatus={changeStatus}
        />
      ),
  });

  if (isReadOnly) {
    return columns.filter(
      (col) => !("accessorKey" in col) || col.accessorKey !== "Status",
    );
  }

  return columns;
};

const ActionCell = ({
  row,
  showPopupDetail,
  deleteList,
  showPopupSession,
  changeStatus,
}: {
  row: Row<SurveyCampaignGetListPaging>;
  showPopupDetail: (id: string, isEdit: boolean) => void;
  deleteList: (ids: string[]) => void;
  showPopupSession: (id: string, name: string) => void;
  changeStatus: (id: string) => Promise<void>;
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showStatusConfirm, setShowStatusConfirm] = useState(false);

  const status = row.original.Status;
  const isDraft = status === 1;
  const isCompleted = status === 3;

  return (
    <>
      <DropdownMenu>
        <div className="flex items-center justify-end gap-1">
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
        </div>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Chức năng</DropdownMenuLabel>

          <DropdownMenuItem
            onClick={() => showPopupDetail(row.original.Id, true)}
          >
            <SquarePen className="mr-2 h-4 w-4" />
            Cập nhật
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => showPopupSession(row.original.Id, row.original.Name)}
          >
            <Users className="mr-2 h-4 w-4" />
            Người tham gia
          </DropdownMenuItem>

          {!isCompleted && (
            <DropdownMenuItem onClick={() => setShowStatusConfirm(true)}>
              {isDraft ? (
                <>
                  <Send className="mr-2 h-4 w-4" />
                  Gửi khảo sát
                </>
              ) : (
                <>
                  <StopCircle className="mr-2 h-4 w-4" />
                  Kết thúc khảo sát
                </>
              )}
            </DropdownMenuItem>
          )}

          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setShowDeleteConfirm(true)}>
              <Trash2 className="mr-2 h-4 w-4 text-red-500" />
              <span className="text-red-500">Xóa</span>
            </DropdownMenuItem>
          </>
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

      <Dialog open={showStatusConfirm} onOpenChange={setShowStatusConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Xác nhận chuyển trạng thái</DialogTitle>
            <DialogDescription>
              {isDraft
                ? "Bạn có chắc chắn muốn phát hành khảo sát này? Email mời tham gia sẽ được gửi đến tất cả người tham gia trong danh sách."
                : "Bạn có chắc chắn muốn kết thúc khảo sát này? Người tham gia sẽ không thể truy cập khảo sát nữa."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline">Hủy</Button>
            </DialogClose>
            <Button
              onClick={async () => {
                await changeStatus(row.original.Id);
                setShowStatusConfirm(false);
              }}
            >
              Xác nhận
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
