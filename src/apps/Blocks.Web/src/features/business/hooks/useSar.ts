import { useCallback, useEffect, useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { RowSelectionState } from "@tanstack/react-table";
import { sarService } from "../api/sar.api";
import type {
  SarDraft,
  SarDraftMetadata,
  SarGetListItem,
  SarGetListPagingRequest,
  SaveSarDraftRequest,
  SubmitSarRequest,
} from "../types/sar.types";

const EMPTY_LIST = {
  Data: [] as SarGetListItem[],
  TotalRow: 0,
  PageIndex: 1,
  PageSize: 10,
};

const READ_ONLY_STATUS_HINTS = [
  /SAR is not in a valid state for save draft/i,
  /SAR is approved and read-only/i,
];

export function getSarMetadataPollInterval(
  isOpen: boolean,
  cycleId?: string,
): number | false {
  return isOpen && !!cycleId ? 10000 : false;
}

export function mergeSarDraftWithMetadata(
  draft: SarDraft | null,
  metadata: SarDraftMetadata | null,
): SarDraft | null {
  if (!draft) return null;
  if (!metadata) return draft;

  return {
    ...draft,
    Status: metadata.Status,
    ReviewRound: metadata.ReviewRound,
    CanEditByRole: metadata.CanEditByRole,
    CanSubmitByRole: metadata.CanSubmitByRole,
    RevisionReason: metadata.RevisionReason,
    LastSavedAt: metadata.LastSavedAt,
    UpdatedAt: metadata.UpdatedAt,
    UpdatedBy: metadata.UpdatedBy,
  };
}

export const useSar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedSar, setSelectedSar] = useState<SarGetListItem | null>(null);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pageRequest, setPageRequest] = useState<SarGetListPagingRequest>({
    PageIndex: 1,
    PageSize: 10,
    TextSearch: "",
  });

  const { data: listResponse, isFetching, refetch } = useQuery({
    queryKey: ["sar", "list", pageRequest],
    queryFn: () => sarService.getList(pageRequest),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (listResponse && !listResponse.Success) {
      toast.error(listResponse.Message || "Không thể tải danh sách SAR.");
    }
  }, [listResponse]);

  const data = listResponse?.Data ?? EMPTY_LIST;

  const {
    data: draftResponse,
    isLoading: isDraftFetching,
    refetch: refetchDraft,
  } = useQuery({
    queryKey: ["sar", "draft", selectedSar?.CycleId],
    queryFn: () => {
      if (!selectedSar) {
        throw new Error("Không có chu kỳ để tải bản nháp SAR.");
      }
      return sarService.getByCycle({ CycleId: selectedSar.CycleId });
    },
    enabled: isOpen && !!selectedSar?.CycleId,
    refetchInterval: false,
    refetchIntervalInBackground: false,
  });

  const { data: metadataResponse } = useQuery({
    queryKey: ["sar", "draft-metadata", selectedSar?.CycleId],
    queryFn: () => {
      if (!selectedSar) {
        throw new Error("Không có chu kỳ để tải metadata SAR.");
      }
      return sarService.getDraftMetadata({ CycleId: selectedSar.CycleId });
    },
    enabled: isOpen && !!selectedSar?.CycleId,
    refetchInterval: getSarMetadataPollInterval(isOpen, selectedSar?.CycleId),
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    if (draftResponse && !draftResponse.Success) {
      toast.error(draftResponse.Message || "Không thể tải nội dung SAR.");
    }
  }, [draftResponse]);

  const draft = useMemo<SarDraft | null>(() => {
    const baseDraft = draftResponse?.Data ?? null;
    const metadata = metadataResponse?.Data ?? null;
    return mergeSarDraftWithMetadata(baseDraft, metadata);
  }, [draftResponse?.Data, metadataResponse?.Data]);

  const forceReadOnlyLocalState = useCallback(() => {
    setSelectedSar((prev) => {
      if (!prev || prev.Status === 2 || prev.Status === 4) {
        return prev;
      }

      return { ...prev, Status: 2 };
    });
  }, []);

  const shouldForceReadOnly = useCallback((message?: string | null) => {
    if (!message) {
      return false;
    }

    return READ_ONLY_STATUS_HINTS.some((pattern) => pattern.test(message));
  }, []);

  const saveDraftMutation = useMutation({
    mutationFn: (request: SaveSarDraftRequest) => sarService.saveDraft(request),
    onSuccess: async (response) => {
      if (response.Success) return;

      if (shouldForceReadOnly(response.Message)) {
        forceReadOnlyLocalState();
      }

      toast.error(
        response.Message || "Không thể lưu bản nháp SAR.",
      );
      await refetchDraft();
    },
    onError: async (error) => {
      const message = error instanceof Error ? error.message : undefined;
      if (shouldForceReadOnly(message)) {
        forceReadOnlyLocalState();
      }

      toast.error(
        message || "Không thể lưu bản nháp SAR.",
      );
      await refetchDraft();
    },
  });

  const submitMutation = useMutation({
    mutationFn: (request: SubmitSarRequest) => sarService.submit(request),
    onSuccess: (response) => {
      if (!response.Success) {
        toast.error(
          response.Message || "Không thể gửi SAR phê duyệt.",
        );
        return;
      }

      forceReadOnlyLocalState();
    },
    onError: (error) => {
      toast.error(
        (error instanceof Error ? error.message : undefined) ||
          "Không thể gửi SAR phê duyệt.",
      );
    },
  });

  const showPopupDetail = useCallback((item: SarGetListItem) => {
    setSelectedSar(item);
    setIsOpen(true);
  }, []);

  const onOpenChange = useCallback(
    (open: boolean) => {
      setIsOpen(open);
      if (!open) {
        setSelectedSar(null);
        void refetch();
      }
    },
    [refetch],
  );

  const getList = useCallback(() => {
    void refetch();
  }, [refetch]);

  const saveDraft = useCallback(
    async (request: SaveSarDraftRequest) => {
      try {
        const response = await saveDraftMutation.mutateAsync(request);
        if (!response.Success) {
          await refetchDraft();
        }
        return response.Success;
      } catch {
        await refetchDraft();
        return false;
      }
    },
    [refetchDraft, saveDraftMutation],
  );

  const submitSar = useCallback(
    async (cycleId: string) => {
      try {
        const response = await submitMutation.mutateAsync({ CycleId: cycleId });
        if (response.Success) {
          await refetchDraft();
        }
        return response.Success;
      } catch {
        await refetchDraft();
        return false;
      }
    },
    [refetchDraft, submitMutation],
  );

  return {
    data,
    rowSelection,
    setRowSelection,
    pageRequest,
    setPageRequest,
    getList,
    isFetching,
    isOpen,
    selectedSar,
    showPopupDetail,
    onOpenChange,
    draft,
    isDraftFetching,
    refetchDraft,
    saveDraft,
    submitSar,
    isSubmitting: submitMutation.isPending,
  };
};
