import { useCallback, useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import type { RowSelectionState } from "@tanstack/react-table";
import { toast } from "sonner";
import { taskExecutionService } from "@/features/business/api/taskExecution.api";
import type {
  TaskExecutionGetPlansRequest,
  TaskExecutionPlanDetail,
  TaskExecutionPlanListItem,
  TaskExecutionPlanListResponse,
} from "@/features/business/types/taskExecution.types";

const EMPTY_LIST: TaskExecutionPlanListResponse = {
  Data: [],
  TotalRow: 0,
  PageIndex: 1,
  PageSize: 10,
};

export function useTaskExecutionPlans() {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<TaskExecutionPlanListItem | null>(null);
  const [loadingItemId, setLoadingItemId] = useState<string | null>(null);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pageRequest, setPageRequest] = useState<TaskExecutionGetPlansRequest>({
    PageIndex: 1,
    PageSize: 10,
    TextSearch: "",
    Status: undefined,
  });

  const {
    data: listResponse,
    isFetching,
    refetch,
    isError,
    error,
  } = useQuery({
    queryKey: ["task-execution", "my-plans", pageRequest],
    queryFn: async (): Promise<TaskExecutionPlanListResponse> => {
      const response = await taskExecutionService.getMyPlans(pageRequest);

      if (!response.Success || !response.Data) {
        throw new Error(response.Message || "Không thể tải danh sách kế hoạch thực hiện.");
      }

      return response.Data;
    },
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (!isError || !error) {
      return;
    }

    toast.error(error instanceof Error ? error.message : "Không thể tải danh sách kế hoạch thực hiện.");
  }, [error, isError]);

  const data = useMemo(() => listResponse ?? EMPTY_LIST, [listResponse]);

  const openPopup = useCallback(
    async (item: TaskExecutionPlanListItem) => {
      setLoadingItemId(item.Id);
      try {
        await queryClient.fetchQuery({
          queryKey: ["task-execution", "plan-detail", item.Id],
          queryFn: async (): Promise<TaskExecutionPlanDetail> => {
            const response = await taskExecutionService.getPlanDetail(item.Id);

            if (!response.Success || !response.Data) {
              throw new Error(response.Message || "Không thể tải chi tiết kế hoạch.");
            }

            return response.Data;
          },
        });

        setSelectedItem(item);
        setIsOpen(true);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Không thể tải chi tiết kế hoạch.");
      } finally {
        setLoadingItemId(null);
      }
    },
    [queryClient],
  );

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
    loadingItemId,
    openPopup,
    onOpenChange,
  };
}
