import { useCallback, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { DataTable } from "@/components/ui/data-table";
import { fileTypeService } from "@/features/catalog/api/filetype.api";
import { evidenceCycleMapService } from "../../api/evidenceCycleMap.api";
import type { ModelVerifiedEvidenceForReuse } from "../../types/evidence-cycle-map.types";
import { getReuseColumns } from "./columns-reuse";

interface PopupReuseEvidenceProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  targetCycleId: string;
  onReuseSuccess: (evidence: ModelVerifiedEvidenceForReuse) => void;
}

const PopupReuseEvidence = ({
  isOpen,
  onOpenChange,
  targetCycleId,
  onReuseSuccess,
}: PopupReuseEvidenceProps) => {
  const [textSearch, setTextSearch] = useState("");
  const [fileTypeId, setFileTypeId] = useState<string>("");
  const [pageRequest, setPageRequest] = useState({
    PageIndex: 1,
    PageSize: 10,
    TextSearch: undefined as string | undefined,
    FileTypeId: undefined as string | undefined,
  });
  const [searchTrigger, setSearchTrigger] = useState(0);

  const { data: fileTypesData } = useQuery({
    queryKey: ["fileTypesCombobox"],
    queryFn: () => fileTypeService.getAllCombobox(),
  });

  const fileTypeMap = useMemo<Record<string, string>>(() => {
    const items = fileTypesData?.Data ?? [];
    return Object.fromEntries(items.map((t) => [t.Value ?? "", t.Text ?? ""]));
  }, [fileTypesData]);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["verifiedForReuse", pageRequest, searchTrigger, targetCycleId],
    queryFn: () =>
      evidenceCycleMapService.getVerifiedForReuse({
        ...pageRequest,
        TargetCycleId: targetCycleId || undefined,
      }),
    enabled: isOpen,
  });

  const handleSearch = () => {
    setPageRequest((prev) => ({
      ...prev,
      TextSearch: textSearch || undefined,
      FileTypeId: fileTypeId || undefined,
      PageIndex: 1,
    }));
    setSearchTrigger((t) => t + 1);
  };

  const handleSelectEvidence = useCallback(
    (evidence: ModelVerifiedEvidenceForReuse) => {
      onReuseSuccess(evidence);
      onOpenChange(false);
    },
    [onReuseSuccess, onOpenChange],
  );

  const columns = useMemo(
    () => getReuseColumns(handleSelectEvidence, false, fileTypeMap),
    [handleSelectEvidence, fileTypeMap],
  );

  const list = data?.Data?.Data ?? [];
  const totalRow = data?.Data?.TotalRow ?? 0;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-4xl"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Tái sử dụng minh chứng đã duyệt</DialogTitle>
        </DialogHeader>

        {/* Filter Bar */}
        <div className="grid grid-cols-3 items-end gap-3 py-2">
          <Combobox
            fetchOptions={async () => {
              const res = await fileTypeService.getAllCombobox();
              return (res.Data || []).map((t) => ({
                Value: t.Value ?? "",
                Text: t.Text ?? "",
              }));
            }}
            value={fileTypeId}
            onValueChange={(val) => setFileTypeId(val || "")}
            placeholder="Tất cả loại tài liệu"
            searchPlaceholder="Tìm kiếm..."
            emptyText="Không tìm thấy."
            modal={true}
          />

          <div className="flex rounded-md shadow-xs">
            <Input
              placeholder="Tên hoặc mã minh chứng..."
              value={textSearch}
              onChange={(e) => setTextSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              className="-me-px rounded-r-none shadow-none focus-visible:z-1"
            />
            <Button onClick={handleSearch} className="rounded-l-none">
              <Search className="h-4 w-4 mr-1.5" />
            </Button>
          </div>
        </div>

        <DataTable
          columns={columns}
          data={list}
          totalRow={totalRow}
          pageRequest={pageRequest}
          setPageRequest={setPageRequest}
          onRefresh={() => refetch()}
          isLoading={isFetching}
          containerClassName="h-[300px] overflow-auto w-full relative"
        />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Đóng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PopupReuseEvidence;
