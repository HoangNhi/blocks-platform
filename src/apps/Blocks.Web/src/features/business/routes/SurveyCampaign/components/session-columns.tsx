import { type ColumnDef } from "@tanstack/react-table";
import type { SurveySession } from "../../../types/survey-campaign.types";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { MoreHorizontal } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { useState } from "react";

export const getViewStakeholderColumns = (
  onDelete?: (item: SurveySession) => void,
  onSendEmail?: (item: SurveySession) => Promise<void>,
  onViewAnswers?: (item: SurveySession) => void,
): ColumnDef<SurveySession>[] => [
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
      enableSorting: false,
      enableHiding: false,
      size: 40,
    },
    {
      accessorKey: "StakeholderName",
      header: "Họ và tên",
    },
    {
      accessorKey: "StakeholderEmail",
      header: "Email",
    },
    {
      accessorKey: "Status",
      header: "Trạng thái",
      cell: ({ row }) => {
        const status = row.original.Status;
        const statusMap: Record<number, { label: string; className: string }> = {
          1: { label: "Chưa gửi", className: "text-gray-500" },
          2: { label: "Đã gửi", className: "text-blue-600" },
          3: { label: "Đã hoàn thành", className: "text-green-600" },
        };

        const statusInfo = statusMap[status] || {
          label: "Không xác định",
          className: "text-gray-400",
        };

        return <span className={statusInfo.className}>{statusInfo.label}</span>;
      },
    },
    {
      id: "actions",
      header: "Thao tác",
      cell: ({ row }) => (
        <ActionCell
          row={row}
          onDelete={onDelete}
          onSendEmail={onSendEmail}
          onViewAnswers={onViewAnswers}
        />
      ),
    },
  ];

const ActionCell = ({
  row,
  onDelete,
  onSendEmail,
  onViewAnswers,
}: {
  row: { original: SurveySession };
  onDelete?: (item: SurveySession) => void;
  onSendEmail?: (item: SurveySession) => Promise<void>;
  onViewAnswers?: (item: SurveySession) => void;
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [open, setOpen] = useState(false);

  const handleSendEmail = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!onSendEmail) return;

    try {
      setIsLoading(true);
      await onSendEmail(row.original);
      setOpen(false);
    } catch {
      // Error handled by callback usually, but we catch to ensure loading state reset
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 p-0">
          <span className="sr-only">Open menu</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Chức năng</DropdownMenuLabel>

        <DropdownMenuItem onClick={handleSendEmail} disabled={isLoading}>
          {isLoading ? "Đang gửi..." : "Gửi khảo sát"}
        </DropdownMenuItem>
        {row.original.Status === 3 && (
          <DropdownMenuItem onClick={() => onViewAnswers?.(row.original)}>
            Xem câu trả lời
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => onDelete?.(row.original)}>
          Xóa
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

