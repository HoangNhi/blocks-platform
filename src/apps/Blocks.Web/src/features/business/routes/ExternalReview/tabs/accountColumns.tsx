import type { ColumnDef } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import type { ExternalReviewAccount } from "@/features/business/types/externalReview.types";

export function getAccountColumns(
  isReadOnly: boolean,
  onEdit: (account: ExternalReviewAccount) => void,
): ColumnDef<ExternalReviewAccount>[] {
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
          aria-label="Chọn tất cả"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Chọn hàng"
        />
      ),
      meta: { className: "w-12" },
    },
    {
      accessorKey: "Fullname",
      header: "Họ tên",
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-800">
            {row.original.Fullname ?? "Không có thông tin"}
          </p>
        </div>
      ),
    },
    {
      accessorKey: "Username",
      header: "Tài khoản",
      cell: ({ row }) => (
        <span className="text-slate-600">
          {row.original.Username ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "Email",
      header: "Email",
      cell: ({ row }) => (
        <span className="text-slate-600">
          {row.original.Email ?? "—"}
        </span>
      ),
    },
    {
      accessorKey: "IsActived",
      header: "Trạng thái",
      cell: ({ row }) => (
        <span
          className={[
            "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
            row.original.IsActived
              ? "bg-emerald-50 text-emerald-700"
              : "bg-slate-100 text-slate-500",
          ].join(" ")}
        >
          {row.original.IsActived ? "Đang hoạt động" : "Không hoạt động"}
        </span>
      ),
    },
    {
      id: "actions",
      header: "Thao tác",
      cell: ({ row }) =>
        isReadOnly ? null : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onEdit(row.original)}
            className="text-blue-600 hover:text-blue-700"
          >
            Cập nhật
          </Button>
        ),
      meta: { className: "w-28" },
    },
  ];
}
