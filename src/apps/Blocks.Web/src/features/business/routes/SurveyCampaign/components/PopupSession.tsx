import { useState, useMemo, useEffect, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { getViewStakeholderColumns } from "./session-columns";
import { PopupChooseStakeholder } from "./PopupChooseStakeholder";
import { PopupViewAnswers } from "./PopupViewAnswers"; // NEW
import type {
  GetListSessionRequest,
  SurveySession,
} from "../../../types/survey-campaign.types";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { SearchIcon } from "lucide-react";
import {
  useSurveySession,
  useDeleteSurveySession,
} from "../../../hooks/useSurveySession";
import { Combobox } from "@/components/ui/combobox";
import { SESSION_STATUS_OPTIONS } from "@/constants/business.constants";
import { ConfirmDeleteDialog } from "@/components/ui/confirm-delete-dialog";
import { surveyCampaignService } from "@/features/business/api/survey-campaign.api";
import { toast } from "sonner";

interface PopupSessionProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  campaignName?: string;
}

export const PopupSession = ({
  open,
  onOpenChange,
  campaignId,
  campaignName,
}: PopupSessionProps) => {
  const [pageRequest, setPageRequest] = useState<GetListSessionRequest>({
    PageIndex: 1,
    PageSize: 10,
    TextSearch: null,
    CampaignId: campaignId,
    Status: undefined,
  });
  const [textSearch, setTextSearch] = useState("");
  const [openChooseStakeholder, setOpenChooseStakeholder] = useState(false);
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteItem, setDeleteItem] = useState<string[]>([]); // store ids to delete
  const [viewAnswerSession, setViewAnswerSession] =
    useState<SurveySession | null>(null); // NEW

  const { data, totalRow, isFetching, refetch } = useSurveySession(
    pageRequest,
    open,
  );
  const deleteSessionMutation = useDeleteSurveySession();

  useEffect(() => {
    if (campaignId) {
      setPageRequest((prev) => ({
        ...prev,
        CampaignId: campaignId,
        PageIndex: 1,
      }));
    }
  }, [campaignId]);

  useEffect(() => {
    if (!open) {
      setPageRequest((prev) => ({
        ...prev,
        PageIndex: 1,
        TextSearch: null,
        Status: undefined,
      }));
      setTextSearch("");
      setRowSelection({});
      setShowDeleteConfirm(false);
      setDeleteItem([]);
      setOpenChooseStakeholder(false);
    }
  }, [open]);

  const handleDelete = (ids: string[]) => {
    deleteSessionMutation.mutate(ids, {
      onSuccess: () => {
        refetch();
        setRowSelection({});
        setShowDeleteConfirm(false);
        setDeleteItem([]);
      },
    });
  };

  const handleAddStakeholder = () => {
    refetch();
  };

  const handleSendEmail = useCallback(
    async (item: SurveySession) => {
      try {
        await surveyCampaignService.sendSurveyInvitation(item.Id);
        toast.success("Gửi khảo sát thành công");
        refetch();
      } catch {
        toast.error("Gửi khảo sát thất bại");
      }
    },
    [refetch],
  );

  const columns = useMemo(
    () =>
      getViewStakeholderColumns(
        (item) => {
          setDeleteItem([item.Id]);
          setShowDeleteConfirm(true);
        },
        (item) => handleSendEmail(item),
        (item) => setViewAnswerSession(item), // NEW
      ),
    [handleSendEmail],
  );

  const handleSearchChange = (value: string) => {
    setTextSearch(value);
    setPageRequest((prev) => ({
      ...prev,
      TextSearch: value || null,
      PageIndex: 1,
    }));
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-5xl h-[600px] flex flex-col p-0 gap-0">
          <DialogHeader className="p-6 pb-2 shrink-0 space-y-1">
            <DialogTitle>
              Danh sách người tham gia
              {campaignName && (
                <span className="text-muted-foreground font-normal">
                  {" "}
                  - {campaignName}
                </span>
              )}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Danh sách người tham gia khảo sát
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-hidden min-h-0 bg-gray-50/50 relative">
            <div className="h-full px-6 py-4">
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-3 items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => setOpenChooseStakeholder(true)}
                    >
                      Thêm
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        const ids = data
                          .filter((_, idx) => rowSelection[idx])
                          .map((item) => item.Id);
                        setDeleteItem(ids);
                        setShowDeleteConfirm(true);
                      }}
                      disabled={Object.keys(rowSelection).length === 0}
                    >
                      Xóa
                    </Button>
                  </div>

                  <Combobox
                    options={SESSION_STATUS_OPTIONS}
                    value={pageRequest.Status?.toString()}
                    onValueChange={(val) => {
                      setPageRequest({
                        ...pageRequest,
                        Status: val ? Number(val) : undefined,
                        PageIndex: 1,
                      });
                    }}
                    placeholder="Tất cả trạng thái"
                    searchPlaceholder="Tìm kiếm trạng thái..."
                    emptyText="Không tìm thấy trạng thái."
                  />

                  <InputGroup className="bg-white">
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
                  data={data}
                  totalRow={totalRow}
                  pageRequest={pageRequest}
                  setPageRequest={setPageRequest}
                  isLoading={isFetching}
                  onRefresh={refetch}
                  rowSelection={rowSelection}
                  setRowSelection={setRowSelection}
                  containerClassName="h-[320px] overflow-auto w-full relative"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="p-4 border-t shrink-0 bg-white">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Đóng
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <PopupChooseStakeholder
        open={openChooseStakeholder}
        onOpenChange={setOpenChooseStakeholder}
        campaignId={campaignId}
        onAdd={handleAddStakeholder}
      />
      <ConfirmDeleteDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        onConfirm={() => handleDelete(deleteItem)}
        itemCount={deleteItem.length}
        isLoading={deleteSessionMutation.isPending}
        stopAutoClose={true}
      />
      <PopupViewAnswers
        open={!!viewAnswerSession}
        onOpenChange={(open) => !open && setViewAnswerSession(null)}
        token={viewAnswerSession?.Token}
        stakeholderName={viewAnswerSession?.StakeholderName}
      />
    </>
  );
};
