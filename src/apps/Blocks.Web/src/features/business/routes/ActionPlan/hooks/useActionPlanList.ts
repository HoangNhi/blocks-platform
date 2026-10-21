import { useCallback, useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { RowSelectionState } from "@tanstack/react-table";
import { toast } from "sonner";
import { actionPlanService } from "@/features/business/api/actionPlan.api";
import type {
  ActionPlanDetail,
  ActionPlanGetListRequest,
  ActionPlanListItem,
  ActionPlanListResponse,
} from "@/features/business/types/actionPlan.types";

const EMPTY_LIST: ActionPlanListResponse = {
  Data: [],
  TotalRow: 0,
  PageIndex: 1,
  PageSize: 10,
};

function createEmptyPlan(cycleId?: string | null): ActionPlanDetail {
  return {
    Id: "00000000-0000-0000-0000-000000000000",
    IsEdit: false,
    CycleId: cycleId ?? "",
    Title: "",
    Description: "",
    StandardId: null,
    CriterionId: null,
    Priority: 2,
    Deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    Status: 1,
    SourceFindingId: null,
    CompletedAt: null,
    CompletedBy: null,
    AssignedAt: null,
    AssignedBy: null,
    Assignees: [],
    Attachments: [],
    Tasks: [],
  };
}

export function useActionPlanList() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ActionPlanDetail | null>(null);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pageRequest, setPageRequest] = useState<ActionPlanGetListRequest>({
    PageIndex: 1,
    PageSize: 10,
    TextSearch: "",
  });

  const {
    data: listResponse,
    isFetching,
    refetch,
    isError,
    error,
  } = useQuery({
    queryKey: ["action-plan", "list", pageRequest],
    queryFn: async (): Promise<ActionPlanListResponse> => {
      const response = await actionPlanService.getList(pageRequest);
      if (!response.Success || !response.Data) {
        throw new Error(response.Message || "Không thể tải danh sách kế hoạch hành động.");
      }
      return response.Data;
    },
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (!isError || !error) {
      return;
    }

    toast.error(error instanceof Error ? error.message : "Không thể tải danh sách kế hoạch hành động.");
  }, [error, isError]);

  const data = useMemo(() => listResponse ?? EMPTY_LIST, [listResponse]);

  const openNew = useCallback(() => {
    setSelectedItem(createEmptyPlan(pageRequest.CycleId));
    setIsOpen(true);
  }, [pageRequest.CycleId]);

  const openPopup = useCallback(async (item: ActionPlanListItem) => {
    const response = await actionPlanService.getById(item.Id);
    if (response.Success && response.Data) {
      setSelectedItem({
        ...response.Data,
        IsEdit: response.Data.IsEdit ?? true,
      });
      setIsOpen(true);
      return;
    }

    toast.error(response.Message || "Không thể tải chi tiết kế hoạch hành động.");
  }, []);

  const onOpenChange = useCallback(
    (open: boolean) => {
      setIsOpen(open);
      if (!open) {
        setSelectedItem(null);
        void refetch();
      }
    },
    [refetch],
  );

  const refreshList = useCallback(() => {
    void refetch();
  }, [refetch]);

  return {
    data,
    rowSelection,
    setRowSelection,
    pageRequest,
    setPageRequest,
    isFetching,
    refreshList,
    isOpen,
    selectedItem,
    openPopup,
    openNew,
    onOpenChange,
  };
}
