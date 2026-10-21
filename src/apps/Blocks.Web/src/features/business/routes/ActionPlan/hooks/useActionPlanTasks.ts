import { useCallback, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { actionPlanService } from "@/features/business/api/actionPlan.api";
import { taskExecutionService } from "@/features/business/api/taskExecution.api";
import type {
  ActionPlanUpdateTaskRequest,
  ActionTask,
} from "@/features/business/types/actionPlan.types";
import type {
  TaskExecutionGetTaskListRequest,
  TaskExecutionTaskListResponse,
} from "@/features/business/types/taskExecution.types";

export function useActionPlanTasks(planId: string, open: boolean) {
  const [pageRequest, setPageRequest] = useState<TaskExecutionGetTaskListRequest>({
    ActionPlanId: planId,
    PageIndex: 1,
    PageSize: 10,
  });

  const taskListQuery = useQuery({
    queryKey: ["action-plan", "tasks", planId, pageRequest],
    queryFn: async (): Promise<TaskExecutionTaskListResponse> => {
      const response = await taskExecutionService.getTaskList({
        ...pageRequest,
        ActionPlanId: planId,
      });

      if (!response.Success || !response.Data) {
        throw new Error(response.Message || "Không thể tải danh sách công việc.");
      }

      return response.Data;
    },
    enabled: open && Boolean(planId),
  });

  const updateMutation = useMutation({
    mutationFn: async (request: ActionPlanUpdateTaskRequest) => {
      const response = await actionPlanService.updateTask(request);
      if (!response.Success || !response.Data) {
        throw new Error(response.Message || "Không thể cập nhật công việc.");
      }

      return response.Data;
    },
    onSuccess: () => {
      toast.success("Đã cập nhật công việc.");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Không thể cập nhật công việc.");
    },
  });

  const updateTask = useCallback(
    (request: ActionPlanUpdateTaskRequest): Promise<ActionTask> =>
      updateMutation.mutateAsync(request),
    [updateMutation],
  );

  const refetch = useCallback(async () => {
    await taskListQuery.refetch();
  }, [taskListQuery]);

  return {
    tasks: taskListQuery.data?.Data ?? [],
    totalRow: taskListQuery.data?.TotalRow ?? 0,
    doneCount: taskListQuery.data?.DoneCount ?? 0,
    isLoading: taskListQuery.isLoading,
    isFetching: taskListQuery.isFetching,
    pageRequest,
    setPageRequest,
    updateTask,
    isMutating: updateMutation.isPending,
    refetch,
  };
}
