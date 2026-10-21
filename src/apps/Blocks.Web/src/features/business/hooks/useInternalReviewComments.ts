import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { internalReviewService } from "../api/internalreview.api";

import type {
  AddInternalCommentRequest,
  InternalComment,
} from "../types/internalreview.types";

const EMPTY_COMMENTS: InternalComment[] = [];

interface UseInternalReviewCommentsOptions {
  cycleId?: string;
  reviewRound?: number;
  enabled?: boolean;
}

function commentsQueryKey(cycleId?: string, reviewRound?: number) {
  return ["internal-review", "comments", cycleId, reviewRound];
}

export function useInternalReviewComments({
  cycleId,
  reviewRound,
  enabled = true,
}: UseInternalReviewCommentsOptions) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: commentsQueryKey(cycleId, reviewRound),
    queryFn: async () => {
      if (!cycleId) {
        return EMPTY_COMMENTS;
      }

      const response = await internalReviewService.getComments({
        CycleId: cycleId,
        ReviewRound: reviewRound,
      });

      if (!response.Success) {
        throw new Error(response.Message || "Failed to load comments");
      }

      return response.Data ?? EMPTY_COMMENTS;
    },
    enabled: enabled && !!cycleId,
  });

  useEffect(() => {
    if (query.error instanceof Error) {
      toast.error(
        query.error.message || "Không thể tải danh sách nhận xét.",
      );
    }
  }, [query.error]);

  const addMutation = useMutation({
    mutationFn: async (request: AddInternalCommentRequest) => {
      const response = await internalReviewService.addComment(request);
      if (!response.Success || !response.Data) {
        throw new Error(response.Message || "Cannot add comment");
      }
      return response.Data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: commentsQueryKey(cycleId, reviewRound),
      });
    },
    onError: (error) => {
      toast.error(
        (error instanceof Error ? error.message : undefined) ||
          "Không thể thêm nhận xét.",
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (commentId: string) => {
      const response = await internalReviewService.deleteComment(commentId);
      if (!response.Success) {
        throw new Error(response.Message || "Cannot delete comment");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: commentsQueryKey(cycleId, reviewRound),
      });
    },
    onError: (error) => {
      toast.error(
        (error instanceof Error ? error.message : undefined) ||
          "Không thể xóa nhận xét.",
      );
    },
  });

  return {
    comments: query.data ?? EMPTY_COMMENTS,
    isLoading: query.isLoading || query.isFetching,
    refetch: query.refetch,
    addComment: addMutation.mutateAsync,
    isAdding: addMutation.isPending,
    deleteComment: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  };
}
