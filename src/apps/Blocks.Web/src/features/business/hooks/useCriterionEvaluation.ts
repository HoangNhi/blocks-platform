import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { criterionEvaluationService } from "../api/criterionEvaluation.api";
import { cycleService } from "@/features/business/api/cycle.api";
import type {
  ApproveEvaluationRequest,
  EvaluationSubmissionRequest,
  CriterionEvaluationGetListRequest,
} from "../types/criterionEvaluation.types";

export const useCriterionEvaluation = () => {
  const queryClient = useQueryClient();

  const [selectedCycleId, setSelectedCycleId] = useState<string>("");
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [viewingSubmission, setViewingSubmission] = useState<string | null>(null);
  const [filters, setFilters] = useState<
    Pick<CriterionEvaluationGetListRequest, "TextSearch" | "Status">
  >({ TextSearch: "", Status: undefined });
  const autoInitializedCycleIdRef = useRef<string | null>(null);

  // Reset filters when cycle changes
  useEffect(() => {
    if (selectedCycleId) {
      queueMicrotask(() => {
        setFilters({ TextSearch: "", Status: undefined });
      });
    }
  }, [selectedCycleId]);

  // Fetch full cycle data to get StandardSetId
  const { data: cycleData } = useQuery({
    queryKey: ["cycle-detail", selectedCycleId],
    queryFn: async () => {
      const res = await cycleService.getById(selectedCycleId);
      return res.Data;
    },
    enabled: !!selectedCycleId,
  });

  const standardSetId = cycleData?.StandardSetId ?? "";

  // Summary bar
  const { data: summaryResponse, isLoading: isSummaryLoading } = useQuery({
    queryKey: ["criterionEvaluation", "summary", selectedCycleId, standardSetId],
    queryFn: () =>
      criterionEvaluationService.getSummary({
        CycleId: selectedCycleId,
        StandardSetId: standardSetId,
      }),
    enabled: !!selectedCycleId && !!standardSetId,
  });

  const summary = summaryResponse?.Data ?? null;

  // Grouped list
  const { data: listResponse, isLoading: isListLoading } = useQuery({
    queryKey: [
      "criterionEvaluation",
      "list",
      selectedCycleId,
      standardSetId,
      filters,
    ],
    queryFn: () =>
      criterionEvaluationService.getList({
        CycleId: selectedCycleId,
        StandardSetId: standardSetId,
        ...filters,
      }),
    enabled: !!selectedCycleId && !!standardSetId,
  });

  const groups = listResponse?.Data ?? [];

  // Combined popup data query (submissions, evidences, mySubmission, survey campaigns, evaluation mode)
  const { data: popupDataResponse, isLoading: isPopupDataLoading, isFetching: isPopupDataFetching } = useQuery({
    queryKey: ["criterionEvaluation", "popupData", activeItemId, selectedCycleId],
    queryFn: () =>
      criterionEvaluationService.getPopupData({
        CriterionEvaluationId: activeItemId!,
        CycleId: selectedCycleId,
      }),
    enabled: !!activeItemId && !!selectedCycleId,
  });

  const submissions = popupDataResponse?.Data?.Submissions ?? [];
  const evidences = popupDataResponse?.Data?.Evidences ?? [];
  const mySubmission = popupDataResponse?.Data?.MySubmission ?? null;
  const surveyCampaigns = popupDataResponse?.Data?.SurveyCampaigns ?? [];
  const evaluationMode = popupDataResponse?.Data?.EvaluationMode ?? 1;
  const officialFields = popupDataResponse?.Data?.OfficialFields ?? null;
  const isRevisionAllowed = popupDataResponse?.Data?.IsRevisionAllowed ?? false;

  // Submit mutation
  const submitMutation = useMutation({
    mutationFn: async (request: EvaluationSubmissionRequest) => {
      const res = await criterionEvaluationService.submit(request);
      if (!res.Success) throw new Error(res.Message);
      return res;
    },
    onSuccess: () => {
      toast.success("Gửi phiếu đánh giá thành công");
      queryClient.invalidateQueries({
        queryKey: ["criterionEvaluation", "popupData", activeItemId],
      });
      queryClient.invalidateQueries({
        queryKey: ["criterionEvaluation", "list", selectedCycleId],
      });
      queryClient.invalidateQueries({
        queryKey: ["criterionEvaluation", "summary", selectedCycleId],
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Lỗi khi gửi phiếu đánh giá",
      );
    },
  });

  // Approve mutation
  const approveMutation = useMutation({
    mutationFn: async (request: ApproveEvaluationRequest) => {
      const res = await criterionEvaluationService.approve(request);
      if (!res.Success) throw new Error(res.Message);
      return res;
    },
    onSuccess: () => {
      toast.success("Duyệt tiêu chí thành công");
      queryClient.invalidateQueries({
        queryKey: ["criterionEvaluation", "list", selectedCycleId],
      });
      queryClient.invalidateQueries({
        queryKey: ["criterionEvaluation", "summary", selectedCycleId],
      });
      setActiveItemId(null);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Lỗi khi duyệt tiêu chí",
      );
    },
  });

  // Initialize mutation (called after cycle transitions to Ongoing)
  const initializeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedCycleId || !standardSetId)
        throw new Error("Chưa chọn chu kỳ");
      const res = await criterionEvaluationService.initialize({
        CycleId: selectedCycleId,
        StandardSetId: standardSetId,
      });
      if (!res.Success) throw new Error(res.Message);
      return res;
    },
    onSuccess: () => {
      toast.success("Khởi tạo tiêu chí đánh giá thành công");
      queryClient.invalidateQueries({
        queryKey: ["criterionEvaluation", "list", selectedCycleId],
      });
      queryClient.invalidateQueries({
        queryKey: ["criterionEvaluation", "summary", selectedCycleId],
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Lỗi khi khởi tạo đánh giá",
      );
    },
  });

  // Auto-initialize criteria when cycle is Ongoing and list is empty
  useEffect(() => {
    // Only run after initial list load completes
    if (isListLoading) return;

    // Get cycle status from cycleData
    const cycleStatus = Number(cycleData?.Status ?? 0);

    // Check if we should auto-init
    if (
      groups.length === 0 &&
      cycleStatus === 2 && // Ongoing
      standardSetId &&
      selectedCycleId &&
      autoInitializedCycleIdRef.current !== selectedCycleId && // Haven't already tried for this cycle
      !filters.TextSearch && // Only auto-init when no text search is active
      filters.Status === undefined // Only auto-init when no status filter is active
    ) {
      // Mark this cycle as being auto-initialized
      autoInitializedCycleIdRef.current = selectedCycleId;
      // Trigger initialization
      initializeMutation.mutate();
    }
  }, [groups, cycleData?.Status, standardSetId, selectedCycleId, isListLoading, filters]);

  return {
    // State
    selectedCycleId,
    setSelectedCycleId,
    activeItemId,
    setActiveItemId,
    viewingSubmission,
    setViewingSubmission,
    filters,
    setFilters,
    // Data
    cycleData,
    standardSetId,
    summary,
    groups,
    submissions,
    evidences,
    mySubmission,
    surveyCampaigns,
    evaluationMode,
    officialFields,
    isRevisionAllowed,
    // Loading
    isSummaryLoading,
    isListLoading,
    isPopupDataLoading,
    isPopupDataFetching,
    isSubmitting: submitMutation.isPending,
    isApproving: approveMutation.isPending,
    // Actions
    handleSubmit: (request: EvaluationSubmissionRequest) =>
      submitMutation.mutateAsync(request),
    handleApprove: (request: ApproveEvaluationRequest) =>
      approveMutation.mutateAsync(request),
    handleInitialize: () => initializeMutation.mutateAsync(),
  };
};
