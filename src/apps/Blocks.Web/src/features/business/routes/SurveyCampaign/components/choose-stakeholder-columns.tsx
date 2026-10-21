import { type ColumnDef, type RowSelectionState } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import type { Stakeholder } from "@/features/catalog/types/stakeholder.types";

export const getChooseStakeholderColumns = (
  isSelectingAll: boolean,
  setIsSelectingAll: (val: boolean) => void,
  rowSelection: RowSelectionState,
  setRowSelection: (val: RowSelectionState) => void,
): ColumnDef<Stakeholder>[] => [
    {
      id: "select",
      header: () => (
        <Checkbox
          checked={isSelectingAll}
          onCheckedChange={(value) => setIsSelectingAll(!!value)}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={isSelectingAll || !!rowSelection[row.original.Id]}
          onCheckedChange={(value) => {
            if (value) {
              setRowSelection({ ...rowSelection, [row.original.Id]: true });
            } else {
              setIsSelectingAll(false);
              const newSelection = { ...rowSelection };
              delete newSelection[row.original.Id];
              setRowSelection(newSelection);
            }
          }}
          aria-label="Select row"
        />
      ),
      enableSorting: false,
      enableHiding: false,
    },
    {
      accessorKey: "FullName",
      header: "Họ và tên",
    },
    {
      accessorKey: "Email",
      header: "Email",
    },
    {
      accessorKey: "Description",
      header: "Mô tả",
    },
  ];
