import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { RowSelectionState } from "@tanstack/react-table";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce";
import { externalReviewService } from "@/features/business/api/externalReview.api";
import type {
  ExternalReviewAccountGetListRequest,
  ExternalReviewAccountGetListResponse,
} from "@/features/business/types/externalReview.types";

const EMPTY_LIST: ExternalReviewAccountGetListResponse = {
  Data: [],
  TotalRow: 0,
  PageIndex: 1,
  PageSize: 10,
};

export function useExternalReviewAccountList(externalReviewId?: string) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [pageRequest, setPageRequest] = useState<ExternalReviewAccountGetListRequest>({
    ExternalReviewId: externalReviewId ?? "",
    PageIndex: 1,
    PageSize: 10,
    TextSearch: "",
  });

  const debouncedSearchTerm = useDebounce(searchTerm, 400);

  useEffect(() => {
    setPageRequest((prev) => ({
      ...prev,
      ExternalReviewId: externalReviewId ?? "",
      PageIndex: 1,
      TextSearch: "",
    }));
    setSearchTerm("");
    setRowSelection({});
  }, [externalReviewId]);

  useEffect(() => {
    setPageRequest((prev) => {
      if (prev.TextSearch === debouncedSearchTerm) {
        return prev;
      }

      return {
        ...prev,
        TextSearch: debouncedSearchTerm,
        PageIndex: 1,
      };
    });
  }, [debouncedSearchTerm]);

  const handleResetFilters = () => {
    setSearchTerm("");
    setPageRequest((prev) => ({
      ...prev,
      TextSearch: "",
      PageIndex: 1,
    }));
    setRowSelection({});
  };

  const query = useQuery({
    queryKey: ["external-review", "accounts", externalReviewId, pageRequest],
    enabled: !!externalReviewId,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<ExternalReviewAccountGetListResponse> => {
      const response = await externalReviewService.getAccountsList(pageRequest);

      if (!response.Success || !response.Data) {
        throw new Error(response.Message || "Không thể tải danh sách tài khoản.");
      }

      return response.Data;
    },
  });

  useEffect(() => {
    if (!query.isError || !query.error) {
      return;
    }

    toast.error(
      query.error instanceof Error
        ? query.error.message
        : "Không thể tải danh sách tài khoản.",
    );
  }, [query.error, query.isError]);

  const data = useMemo(
    () => query.data ?? EMPTY_LIST,
    [query.data],
  );

  return {
    data,
    rowSelection,
    setRowSelection,
    searchTerm,
    setSearchTerm,
    pageRequest,
    setPageRequest,
    handleResetFilters,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    refetch: query.refetch,
  };
}
