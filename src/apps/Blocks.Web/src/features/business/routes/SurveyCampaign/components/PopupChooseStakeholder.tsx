import { useState, useMemo, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { getChooseStakeholderColumns } from "./choose-stakeholder-columns";
import { SearchIcon } from "lucide-react";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { surveyCampaignService } from "../../../api/survey-campaign.api";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import type { GetStakeholderNotInCampaignRequest } from "../../../types/survey-campaign.types";
import { toast } from "sonner";
import type { RowSelectionState } from "@tanstack/react-table";

interface PopupChooseStakeholderProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  onAdd?: (selectedIds: string[]) => void;
}

export const PopupChooseStakeholder = ({
  open,
  onOpenChange,
  campaignId,
  onAdd,
}: PopupChooseStakeholderProps) => {
  const [pageRequest, setPageRequest] =
    useState<GetStakeholderNotInCampaignRequest>({
      PageIndex: 1,
      PageSize: 10,
      TextSearch: "",
      CampainId: campaignId,
    });

  const [textSearch, setTextSearch] = useState("");
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [isSelectingAll, setIsSelectingAll] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Sync campaignId to pageRequest
  useEffect(() => {
    if (campaignId) {
      setPageRequest((prev) => ({
        ...prev,
        CampainId: campaignId,
        PageIndex: 1,
      }));
    }
  }, [campaignId]);

  // Reset selection when popup opens/closes
  useEffect(() => {
    if (!open) {
      setRowSelection({});
      setTextSearch("");
      setIsSelectingAll(false);
      setPageRequest((prev) => ({
        ...prev,
        PageIndex: 1,
        TextSearch: "",
      }));
    }
  }, [open]);

  const {
    data: listResponse,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["stakeholders-not-in-campaign", pageRequest],
    queryFn: async () => {
      const response =
        await surveyCampaignService.getStakeholderNotInCampaign(pageRequest);
      if (!response.Success) {
        toast.error(response.Message || "Lỗi tải dữ liệu");
        throw new Error(response.Message);
      }
      return response;
    },
    placeholderData: keepPreviousData,
    enabled: false,
  });

  useEffect(() => {
    if (open && campaignId) {
      refetch();
    }
  }, [open, campaignId, pageRequest, refetch]);

  const data = listResponse?.Data || {
    Data: [],
    TotalRow: 0,
    PageIndex: 1,
    PageSize: 10,
  };

  const columns = useMemo(
    () =>
      getChooseStakeholderColumns(
        isSelectingAll,
        setIsSelectingAll,
        rowSelection,
        setRowSelection,
      ),
    [isSelectingAll, rowSelection],
  );

  const handleSearchChange = (value: string) => {
    setTextSearch(value);
    setPageRequest((prev) => ({
      ...prev,
      TextSearch: value,
      PageIndex: 1,
    }));
  };

  const handleAdd = async () => {
    try {
      setIsLoading(true);
      let res;
      if (isSelectingAll) {
        res = await surveyCampaignService.addAllStakeholderToCampaign({
          CampaignId: campaignId,
          Filter_TextSearch: textSearch,
        });
      } else {
        const selectedIds = Object.keys(rowSelection);
        if (selectedIds.length === 0) {
          toast.warning("Vui lòng chọn ít nhất một người tham gia");
          setIsLoading(false);
          return;
        }

        res = await surveyCampaignService.addListStakeholderToCampaign({
          CampaignId: campaignId,
          StakeholderIds: selectedIds,
        });
      }

      if (res.Success) {
        toast.success("Thêm người tham gia thành công");
        onAdd?.([]);
        onOpenChange(false);
      } else {
        toast.error(res.Message || "Thêm người tham gia thất bại");
      }
    } catch {
      toast.error("Lỗi khi thêm người tham gia");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl h-[600px] flex flex-col p-0 gap-0">
        <DialogHeader className="p-6 pb-2 shrink-0 space-y-1">
          <DialogTitle>Thêm người tham gia vào khảo sát</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden min-h-0 bg-gray-50/50 relative">
          <div className="h-full overflow-hidden px-6 py-4 flex flex-col">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-4 shrink-0">
                <div className="flex-1"></div>
                <InputGroup className="bg-white w-72">
                  <InputGroupInput
                    placeholder="Tìm kiếm..."
                    value={textSearch}
                    onChange={(e) => handleSearchChange(e.target.value)}
                  />
                  <InputGroupAddon>
                    <SearchIcon className="h-4 w-4" />
                  </InputGroupAddon>
                </InputGroup>
              </div>

              <DataTable
                columns={columns}
                data={data.Data}
                totalRow={data.TotalRow}
                pageRequest={pageRequest}
                setPageRequest={setPageRequest}
                isLoading={isFetching}
                onRefresh={refetch}
                containerClassName="h-[340px] overflow-auto w-full relative"
                rowSelection={rowSelection}
                setRowSelection={setRowSelection}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="p-4 border-t shrink-0 bg-white">
          <DialogClose asChild>
            <Button variant="outline">Hủy</Button>
          </DialogClose>
          <Button
            onClick={handleAdd}
            disabled={
              (!isSelectingAll && Object.keys(rowSelection).length === 0) ||
              isLoading
            }
          >
            {isLoading
              ? "Đang thêm..."
              : isSelectingAll
                ? "Thêm tất cả"
                : `Thêm ${Object.keys(rowSelection).length} người`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
