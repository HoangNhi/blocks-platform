import { useCallback, useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { externalReviewService } from "@/features/business/api/externalReview.api";
import type { ExternalReviewDetail } from "@/features/business/types/externalReview.types";

function isMissingReviewResponse(message?: string): boolean {
  const normalized = (message || "").toLowerCase();
  return (
    normalized.includes("khong tim thay") ||
    normalized.includes("không tìm thấy") ||
    normalized.includes("not found") ||
    normalized.includes("does not exist")
  );
}

export function useExternalReview(selectedCycleId: string | null) {
  const queryClient = useQueryClient();

  const {
    data: review,
    isLoading,
    isFetching,
    isError,
    error,
  } = useQuery({
    queryKey: ["external-review", "detail", selectedCycleId],
    queryFn: async (): Promise<ExternalReviewDetail | null> => {
      if (!selectedCycleId) {
        return null;
      }

      const response = await externalReviewService.get({
        CycleId: selectedCycleId,
      });
      if (!response.Success) {
        if (isMissingReviewResponse(response.Message)) {
          return null;
        }

        throw new Error(response.Message || "Không thể tải External Review.");
      }

      const detail = response.Data ?? null;
      if (!detail) {
        return null;
      }

      return {
        ...detail,
        Accounts: [],
        Results: detail.Results || [],
      };
    },
    enabled: !!selectedCycleId,
  });

  useEffect(() => {
    if (!isError || !error) {
      return;
    }

    toast.error(
      error instanceof Error ? error.message : "Không thể tải External Review.",
    );
  }, [error, isError]);

  const invalidateCurrent = useCallback(async () => {
    if (!selectedCycleId) {
      return;
    }

    await queryClient.invalidateQueries({
      queryKey: ["external-review", "detail", selectedCycleId],
    });
  }, [queryClient, selectedCycleId]);

  const updateStatusMutation = useMutation({
    mutationFn: async (status: number) => {
      if (!review?.Id) {
        throw new Error("External Review chưa được khởi tạo.");
      }

      const response = await externalReviewService.updateStatus({
        ExternalReviewId: review.Id,
        Status: status,
      });

      if (!response.Success) {
        throw new Error(response.Message || "Không thể cập nhật trạng thái.");
      }
    },
    onSuccess: async () => {
      toast.success("Đã cập nhật trạng thái.");
      await invalidateCurrent();
    },
    onError: (mutationError) => {
      toast.error(
        mutationError instanceof Error
          ? mutationError.message
          : "Không thể cập nhật trạng thái.",
      );
    },
  });

  const updateWatermarkMutation = useMutation({
    mutationFn: async (payload: {
      text?: string | null;
      opacity: number;
      position: number;
    }) => {
      if (!review?.Id) {
        throw new Error("External Review chưa được khởi tạo.");
      }

      const response = await externalReviewService.updateWatermark({
        ExternalReviewId: review.Id,
        WatermarkText: payload.text,
        WatermarkOpacity: payload.opacity,
        WatermarkPosition: payload.position,
      });

      if (!response.Success) {
        throw new Error(response.Message || "Không thể cập nhật watermark.");
      }
    },
    onSuccess: async () => {
      toast.success("Đã cập nhật watermark.");
      await invalidateCurrent();
    },
    onError: (mutationError) => {
      toast.error(
        mutationError instanceof Error
          ? mutationError.message
          : "Không thể cập nhật watermark.",
      );
    },
  });

  const confirmCompletionMutation = useMutation({
    mutationFn: async () => {
      if (!review?.Id) {
        throw new Error("External Review chưa được khởi tạo.");
      }

      const response = await externalReviewService.confirmCompletion({
        ExternalReviewId: review.Id,
      });

      if (!response.Success) {
        throw new Error(response.Message || "Không thể xác nhận hoàn tất.");
      }
    },
    onSuccess: async () => {
      toast.success("Đã xác nhận hoàn tất đánh giá ngoài.");
      await invalidateCurrent();
    },
    onError: (mutationError) => {
      toast.error(
        mutationError instanceof Error
          ? mutationError.message
          : "Không thể xác nhận hoàn tất.",
      );
    },
  });

  const addAccountsMutation = useMutation({
    mutationFn: async (userIds: string[]) => {
      if (!review?.Id) {
        throw new Error("Đợt đánh giá ngoài chưa được khởi tạo.");
      }

      const response = await externalReviewService.addAccounts({
        ExternalReviewId: review.Id,
        UserIds: userIds,
      });

      if (!response.Success) {
        throw new Error(response.Message || "Không thể thêm tài khoản.");
      }
    },
    onSuccess: async () => {
      toast.success("Đã thêm tài khoản đánh giá ngoài.");
      await invalidateCurrent();
    },
    onError: (mutationError) => {
      toast.error(
        mutationError instanceof Error
          ? mutationError.message
          : "Không thể thêm tài khoản.",
      );
    },
  });

  const createAndLinkAccountMutation = useMutation({
    mutationFn: async (payload: {
      fullname: string;
      username: string;
      email: string;
      password: string;
    }) => {
      if (!review?.Id) {
        throw new Error("Đợt đánh giá ngoài chưa được khởi tạo.");
      }

      const response = await externalReviewService.createAndLinkAccount({
        ExternalReviewId: review.Id,
        Fullname: payload.fullname,
        Username: payload.username,
        Email: payload.email,
        Password: payload.password,
      });

      if (!response.Success) {
        throw new Error(
          response.Message || "Không thể tạo tài khoản chuyên gia.",
        );
      }
    },
    onSuccess: async () => {
      toast.success("Đã tạo và liên kết tài khoản chuyên gia.");
    },
  });

  const updateAccountMutation = useMutation({
    mutationFn: async (payload: {
      accountId: string;
      fullname: string;
      username: string;
      email: string;
      isActived: boolean;
      password?: string;
    }) => {
      if (!review?.Id) {
        throw new Error("Đợt đánh giá ngoài chưa được khởi tạo.");
      }

      const response = await externalReviewService.updateAccount({
        AccountId: payload.accountId,
        Fullname: payload.fullname,
        Username: payload.username,
        Email: payload.email,
        IsActived: payload.isActived,
        Password: payload.password,
      });

      if (!response.Success) {
        throw new Error(response.Message || "Không thể cập nhật tài khoản.");
      }
    },
    onSuccess: async () => {
      toast.success("Đã cập nhật tài khoản chuyên gia.");
    },
    onError: (mutationError) => {
      toast.error(
        mutationError instanceof Error
          ? mutationError.message
          : "Không thể cập nhật tài khoản.",
      );
    },
  });

  const removeAccountMutation = useMutation({
    mutationFn: async (accountId: string) => {
      if (!review?.Id) {
        throw new Error("Đợt đánh giá ngoài chưa được khởi tạo.");
      }

      const response = await externalReviewService.removeAccount({
        AccountId: accountId,
      });

      if (!response.Success) {
        throw new Error(response.Message || "Không thể gỡ tài khoản.");
      }
    },
  });

  const isMutating = useMemo(
    () =>
      updateStatusMutation.isPending ||
      updateWatermarkMutation.isPending ||
      confirmCompletionMutation.isPending ||
      addAccountsMutation.isPending ||
      createAndLinkAccountMutation.isPending ||
      updateAccountMutation.isPending ||
      removeAccountMutation.isPending,
    [
      addAccountsMutation.isPending,
      createAndLinkAccountMutation.isPending,
      confirmCompletionMutation.isPending,
      removeAccountMutation.isPending,
      updateAccountMutation.isPending,
      updateStatusMutation.isPending,
      updateWatermarkMutation.isPending,
    ],
  );

  return {
    review,
    isLoading,
    isFetching,
    isMutating,
    updateStatus: (status: number) => updateStatusMutation.mutateAsync(status),
    updateWatermark: (payload: {
      text?: string | null;
      opacity: number;
      position: number;
    }) => updateWatermarkMutation.mutateAsync(payload),
    confirmCompletion: () => confirmCompletionMutation.mutateAsync(),
    addAccounts: (userIds: string[]) =>
      addAccountsMutation.mutateAsync(userIds),
    createAndLinkAccount: (payload: {
      fullname: string;
      username: string;
      email: string;
      password: string;
    }) => createAndLinkAccountMutation.mutateAsync(payload),
    updateAccount: (payload: {
      accountId: string;
      fullname: string;
      username: string;
      email: string;
      isActived: boolean;
      password?: string;
    }) => updateAccountMutation.mutateAsync(payload),
    removeAccount: (accountId: string) =>
      removeAccountMutation.mutateAsync(accountId),
  };
}
