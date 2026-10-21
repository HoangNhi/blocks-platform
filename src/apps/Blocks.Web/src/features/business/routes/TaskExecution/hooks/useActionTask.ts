import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { taskExecutionService } from "@/features/business/api/taskExecution.api";
import type {
  TaskExecutionDeleteTaskRequest,
  TaskExecutionUpsertTaskRequest,
} from "@/features/business/types/taskExecution.types";

export function useActionTask() {
  const queryClient = useQueryClient();

  const invalidateTaskLists = async () => {
    await queryClient.invalidateQueries({ queryKey: ["task-execution", "task-list"] });
  };

  const saveMutation = useMutation({
    mutationFn: async (request: TaskExecutionUpsertTaskRequest) => {
      const response =
        request.Id && request.Id !== "00000000-0000-0000-0000-000000000000"
          ? await taskExecutionService.updateTask(request)
          : await taskExecutionService.insertTask(request);

      if (!response.Success || !response.Data) {
        throw new Error(response.Message || "Không thể lưu công việc.");
      }

      return response.Data;
    },
    onSuccess: async () => {
      toast.success("Đã lưu công việc.");
      await invalidateTaskLists();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Không thể lưu công việc.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (request: TaskExecutionDeleteTaskRequest) => {
      const response = await taskExecutionService.deleteTask(request);
      if (!response.Success) {
        throw new Error(response.Message || "Không thể xóa công việc.");
      }
    },
    onSuccess: async () => {
      toast.success("Đã xóa công việc.");
      await invalidateTaskLists();
    },
  });

  return {
    saveTask: (request: TaskExecutionUpsertTaskRequest) => saveMutation.mutateAsync(request),
    deleteTask: (request: TaskExecutionDeleteTaskRequest) => deleteMutation.mutateAsync(request),
    isMutating: useMemo(
      () => saveMutation.isPending || deleteMutation.isPending,
      [deleteMutation.isPending, saveMutation.isPending],
    ),
  };
}
