import { type ColumnDef } from "@tanstack/react-table";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ModelVerifiedEvidenceForReuse } from "../../types/evidence-cycle-map.types";

export const getReuseColumns = (
  onSelect: (evidence: ModelVerifiedEvidenceForReuse) => void,
  isPending: boolean,
  fileTypeMap: Record<string, string>,
): ColumnDef<ModelVerifiedEvidenceForReuse>[] => [
  {
    id: "actions",
    meta: { className: "text-center w-24" },
    cell: ({ row }) => (
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => onSelect(row.original)}
        className="text-xs h-7 px-2.5"
      >
        {isPending ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          "Chọn"
        )}
      </Button>
    ),
  },
  {
    accessorKey: "evidenceCode",
    header: "Mã",
    meta: { className: "w-36 font-mono text-xs text-muted-foreground" },
  },
  {
    accessorKey: "evidenceName",
    header: "Tên minh chứng",
  },
  {
    accessorKey: "FileTypeId",
    header: "Loại tài liệu",
    cell: ({ row }) => {
      const id = row.original.FileTypeId;
      return id ? (fileTypeMap[id] ?? "—") : "—";
    },
  },
];
