import type { ColumnDef } from "@tanstack/react-table";
import type { AuditLog } from "@/types/auditlog.types";
import { Button } from "@/components/ui/button";
import { Eye, CheckCircle2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const formatDate = (isoString: string) =>
    new Date(isoString).toLocaleString("vi-VN", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
    });

export const getColumns = (
    onViewDetail: (log: AuditLog) => void,
): ColumnDef<AuditLog>[] => [
        {
            accessorKey: "CreatedAt",
            header: "Thời gian",
            cell: ({ row }) => (
                <span className="whitespace-nowrap text-muted-foreground text-xs">
                    {formatDate(row.original.CreatedAt)}
                </span>
            ),
            size: 170,
        },
        {
            accessorKey: "UserName",
            header: "Tài khoản",
            cell: ({ row }) => (
                <span className="font-medium">{row.original.UserName}</span>
            ),
        },
        {
            accessorKey: "Action",
            header: "Hành động",
            cell: ({ row }) => (
                <Badge variant="outline">{row.original.Action}</Badge>
            ),
            size: 150,
        },
        {
            accessorKey: "EntityName",
            header: "Tài nguyên",
            cell: ({ row }) => (
                <span className="text-muted-foreground">{row.original.EntityName}</span>
            ),
            size: 150,
        },
        {
            accessorKey: "IsSuccess",
            header: "Kết quả",
            cell: ({ row }) =>
                row.original.IsSuccess ? (
                    <span className="inline-flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Thành công
                    </span>
                ) : (
                    <span
                        className="inline-flex items-center gap-1 text-xs text-red-600"
                        title={row.original.ErrorMessage || ""}
                    >
                        <XCircle className="h-3.5 w-3.5" /> Thất bại
                    </span>
                ),
            size: 110,
        },
        {
            accessorKey: "IpAddress",
            header: "IP",
            cell: ({ row }) => (
                <span className="text-xs text-muted-foreground font-mono">
                    {row.original.IpAddress}
                </span>
            ),
            size: 130,
        },
        {
            accessorKey: "ServiceName",
            header: "Hệ thống",
            cell: ({ row }) => (
                <Badge variant="secondary" className="text-xs font-normal">
                    {row.original.ServiceName?.replace("Service", "")}
                </Badge>
            ),
            size: 110,
        },
        {
            id: "actions",
            cell: ({ row }) => (
                <div className="flex justify-end pr-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        title="Xem chi tiết"
                        onClick={() => onViewDetail(row.original)}
                        className="h-8 w-8 hover:bg-muted"
                    >
                        <Eye className="h-4 w-4" />
                    </Button>
                </div>
            ),
            size: 60,
        },
    ];
