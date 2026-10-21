import { useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { actionPlanService } from "@/features/business/api/actionPlan.api";
import type {
  ActionPlanDeleteListRequest,
  ActionPlanUpsertRequest,
} from "@/features/business/types/actionPlan.types";

export function useActionPlan() {
  const queryClient = useQueryClient();

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["action-plan"] });
    await queryClient.invalidateQueries({ queryKey: ["task-execution"] });
  };

  const saveMutation = useMutation({
    mutationFn: async (request: ActionPlanUpsertRequest) => {
      const response =
        request.Id && request.Id !== "00000000-0000-0000-0000-000000000000"
          ? await actionPlanService.update(request)
          : await actionPlanService.insert(request);

      if (!response.Success || !response.Data) {
        throw new Error(response.Message || "Không thể lưu kế hoạch hành động.");
      }

      return response.Data;
    },
    onSuccess: async () => {
      toast.success("Đã lưu kế hoạch hành động.");
      await invalidate();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Không thể lưu kế hoạch hành động.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (request: ActionPlanDeleteListRequest) => {
      const response = await actionPlanService.deleteList(request);
      if (!response.Success) {
        throw new Error(response.Message || "Không thể xóa kế hoạch hành động.");
      }

      return response.Data!;
    },
    onSuccess: async (result) => {
      if (result.DeletedCount > 0 && result.SkippedCount === 0) {
        toast.success(`Đã xóa ${result.DeletedCount} kế hoạch hành động.`);
      } else if (result.DeletedCount > 0 && result.SkippedCount > 0) {
        toast.warning(
          `Đã xóa ${result.DeletedCount} kế hoạch. ${result.SkippedCount} kế hoạch bị bỏ qua do không có quyền.`,
        );
      } else {
        toast.error("Không có kế hoạch nào được xóa. Bạn không có quyền xóa các mục đã chọn.");
      }

      await invalidate();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Không thể xóa kế hoạch hành động.");
    },
  });

  return {
    savePlan: (request: ActionPlanUpsertRequest) => saveMutation.mutateAsync(request),
    deleteList: (request: ActionPlanDeleteListRequest) => deleteMutation.mutateAsync(request),
    isMutating: useMemo(
      () => saveMutation.isPending || deleteMutation.isPending,
      [saveMutation.isPending, deleteMutation.isPending],
    ),
  };
}
