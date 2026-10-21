import { useCallback, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { externalReviewService } from "@/features/business/api/externalReview.api";
import type {
  AddExternalReviewFindingRequest,
  ExternalReviewResult,
  UpdateExternalReviewFindingRequest,
} from "@/features/business/types/externalReview.types";

function buildMissingReviewError(): Error {
  return new Error("External Review chưa được khởi tạo.");
}

export function useExternalReviewResults(externalReviewId: string | null) {
  const queryClient = useQueryClient();

  const invalidateCurrent = useCallback(async () => {
    if (!externalReviewId) {
      return;
    }

    await queryClient.invalidateQueries({
      queryKey: ["external-review", "detail"],
    });
  }, [externalReviewId, queryClient]);

  const upsertResultMutation = useMutation({
    mutationFn: async (payload: {
      standardId: string;
      strengths?: string | null;
    }): Promise<ExternalReviewResult> => {
      if (!externalReviewId) {
        throw buildMissingReviewError();
      }

      const response = await externalReviewService.upsertResult({
        ExternalReviewId: externalReviewId,
        StandardId: payload.standardId,
        Strengths: payload.strengths,
      });

      if (!response.Success) {
        throw new Error(response.Message || "Không thể lưu kết quả đánh giá.");
      }

      if (!response.Data) {
        throw new Error("Không thể lưu kết quả đánh giá.");
      }

      return response.Data;
    },
    onSuccess: async () => {
      toast.success("Đã lưu kết quả đánh giá.");
      await invalidateCurrent();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Không thể lưu kết quả đánh giá.");
    },
  });

  const addFindingMutation = useMutation({
    mutationFn: async (payload: AddExternalReviewFindingRequest) => {
      if (!externalReviewId) {
        throw buildMissingReviewError();
      }

      const response = await externalReviewService.addFinding(payload);
      if (!response.Success) {
        throw new Error(response.Message || "Không thể thêm phát hiện.");
      }
    },
    onSuccess: async () => {
      toast.success("Đã thêm phát hiện.");
      await invalidateCurrent();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Không thể thêm phát hiện.");
    },
  });

  const updateFindingMutation = useMutation({
    mutationFn: async (payload: UpdateExternalReviewFindingRequest) => {
      if (!externalReviewId) {
        throw buildMissingReviewError();
      }

      const response = await externalReviewService.updateFinding(payload);
      if (!response.Success) {
        throw new Error(response.Message || "Không thể cập nhật phát hiện.");
      }
    },
    onSuccess: async () => {
      toast.success("Đã cập nhật phát hiện.");
      await invalidateCurrent();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Không thể cập nhật phát hiện.");
    },
  });

  const deleteFindingMutation = useMutation({
    mutationFn: async (findingId: string) => {
      if (!externalReviewId) {
        throw buildMissingReviewError();
      }

      const response = await externalReviewService.deleteFinding({ FindingId: findingId });
      if (!response.Success) {
        throw new Error(response.Message || "Không thể xóa phát hiện.");
      }
    },
    onSuccess: async () => {
      toast.success("Đã xóa phát hiện.");
      await invalidateCurrent();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Không thể xóa phát hiện.");
    },
  });

  const isMutating = useMemo(
    () =>
      upsertResultMutation.isPending ||
      addFindingMutation.isPending ||
      updateFindingMutation.isPending ||
      deleteFindingMutation.isPending,
    [
      addFindingMutation.isPending,
      deleteFindingMutation.isPending,
      updateFindingMutation.isPending,
      upsertResultMutation.isPending,
    ],
  );

  return {
    isMutating,
    upsertResult: (payload: { standardId: string; strengths?: string | null }) =>
      upsertResultMutation.mutateAsync(payload),
    addFinding: (payload: AddExternalReviewFindingRequest) =>
      addFindingMutation.mutateAsync(payload),
    updateFinding: (payload: UpdateExternalReviewFindingRequest) =>
      updateFindingMutation.mutateAsync(payload),
    deleteFinding: (findingId: string) => deleteFindingMutation.mutateAsync(findingId),
  };
}
