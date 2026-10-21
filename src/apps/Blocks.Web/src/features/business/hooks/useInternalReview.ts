import { useCallback, useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { RowSelectionState } from "@tanstack/react-table";
import { internalReviewService } from "../api/internalreview.api";

import type { SarGetListPagingRequest, SarStatus } from "../types/sar.types";
import type { InternalReviewListItem } from "../types/internalreview.types";

const EMPTY_LIST = {
  Data: [] as InternalReviewListItem[],
  TotalRow: 0,
  PageIndex: 1,
  PageSize: 10,
};

async function buildListItem(
  cycleId: string,
  fallback: {
    SarReportId: string;
    CycleName: string;
    Year: number;
    Status: SarStatus;
    EvaluationPurpose?: string | null;
  },
): Promise<InternalReviewListItem> {
  const detailResponse = await internalReviewService.getSarByCycle(cycleId);
  const detail = detailResponse.Success ? detailResponse.Data : null;
  const status = (detail?.Status ?? fallback.Status) as SarStatus;
  const reviewRound = detail?.ReviewRound ?? 1;

  let commentCount = 0;
  if (status === 2 || status === 3) {
    try {
      const commentsResponse = await internalReviewService.getComments({
        CycleId: cycleId,
        ReviewRound: reviewRound,
      });

      if (commentsResponse.Success) {
        commentCount = commentsResponse.Data?.length ?? 0;
      }
    } catch {
      commentCount = 0;
    }
  }

  return {
    SarReportId: detail?.SarReportId ?? fallback.SarReportId,
    CycleId: cycleId,
    CycleName: fallback.CycleName,
    Year: fallback.Year,
    Status: status,
    ReviewRound: reviewRound,
    SubmittedAt: detail?.SubmittedAt ?? null,
    CommentCount: commentCount,
    RenderedHtml: detail?.RenderedHtml ?? null,
    YDocSnapshotBase64: detail?.YDocSnapshotBase64 ?? null,
    RevisionReason: detail?.RevisionReason ?? null,
    EvaluationPurpose: fallback.EvaluationPurpose ?? null,
    CurrentUserCouncilRoleId: detail?.CurrentUserCouncilRoleId ?? null,
    CanApproveByRole: detail?.CanApproveByRole ?? false,
  };
}

export const useInternalReview = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InternalReviewListItem | null>(null);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pageRequest, setPageRequest] = useState<SarGetListPagingRequest>({
    PageIndex: 1,
    PageSize: 10,
    TextSearch: "",
  });

  const { data: listResponse, isFetching, refetch } = useQuery({
    queryKey: ["internal-review", "list", pageRequest],
    queryFn: async () => {
      const response = await internalReviewService.getList(pageRequest);

      if (!response.Success || !response.Data) {
        return response;
      }

      const enriched = await Promise.all(
        (response.Data.Data ?? []).map((item) =>
          buildListItem(item.CycleId, {
            SarReportId: item.SarReportId,
            CycleName: item.CycleName,
            Year: item.Year,
            Status: item.Status as SarStatus,
            EvaluationPurpose: item.EvaluationPurpose,
          }),
        ),
      );

      return {
        ...response,
        Data: {
          ...response.Data,
          Data: enriched,
        },
      };
    },
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (listResponse && !listResponse.Success) {
      toast.error(
        listResponse.Message || "Không thể tải danh sách",
      );
    }
  }, [listResponse]);

  const data = useMemo(() => listResponse?.Data ?? EMPTY_LIST, [listResponse]);

  const openReviewPopup = useCallback((item: InternalReviewListItem) => {
    setSelectedItem(item);
    setIsOpen(true);
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
    openReviewPopup,
    onOpenChange,
  };
};
