import { useCallback, useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { RowSelectionState } from "@tanstack/react-table";
import { externalReviewService } from "@/features/business/api/externalReview.api";
import type {
  ExternalReviewGetListRequest,
  ExternalReviewListItem,
  ExternalReviewListResponse,
} from "@/features/business/types/externalReview.types";

const EMPTY_LIST: ExternalReviewListResponse = {
  Data: [],
  TotalRow: 0,
  PageIndex: 1,
  PageSize: 10,
};

export function useExternalReviewList() {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<ExternalReviewListItem | null>(null);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pageRequest, setPageRequest] = useState<ExternalReviewGetListRequest>({
    PageIndex: 1,
    PageSize: 10,
    TextSearch: "",
  });

  const { data: listResponse, isFetching, refetch, isError, error } = useQuery({
    queryKey: ["external-review", "list", pageRequest],
    queryFn: async (): Promise<ExternalReviewListResponse> => {
      const response = await externalReviewService.getList(pageRequest);
      if (!response.Success || !response.Data) {
        throw new Error(response.Message || "Không thể tải danh sách External Review.");
      }
      return response.Data;
    },
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (!isError || !error) {
      return;
    }

    toast.error(error instanceof Error ? error.message : "Không thể tải danh sách External Review.");
  }, [error, isError]);

  const data = useMemo(() => listResponse ?? EMPTY_LIST, [listResponse]);

  const openPopup = useCallback((item: ExternalReviewListItem) => {
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
    openPopup,
    onOpenChange,
  };
}
