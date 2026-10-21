import { useState, useCallback } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { standardSetService } from "@/features/catalog/api/standardset.api";
import type {
  StandardSet,
  StandardSetGetListPagingRequest,
} from "@/features/catalog/types/standardset.types";
import { toast } from "sonner";
import type { RowSelectionState } from "@tanstack/react-table";

export const useStandardSet = () => {
  const EMPTY_STANDARD_SET: StandardSet = {
    Id: "",
    Code: "",
    Name: "",
    EvaluationMode: 1,
    ChartType: 0,
    IsActived: true,
    IsEdit: false,
    FolderUpload: "",
    CreatedBy: "",
    CreatedAt: "",
    UpdatedBy: "",
    UpdatedAt: "",
  };

  const [isOpen, setIsOpen] = useState(false);
  const [standardSet, setStandardSet] = useState<StandardSet | null>(null);
  const [pageRequest, setPageRequest] =
    useState<StandardSetGetListPagingRequest>({
      PageIndex: 1,
      PageSize: 10,
      TextSearch: "",
    });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const {
    data: listResponse,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["standardSets", pageRequest],
    queryFn: () => standardSetService.getList(pageRequest),
    placeholderData: keepPreviousData,
  });

  const data = listResponse?.Data || {
    Data: [],
    TotalRow: 0,
    PageIndex: 1,
    PageSize: 10,
  };

  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: async (data: StandardSet) => {
      const cleanedRequest = {
        ...data,
        FolderUpload: data.FolderUpload || undefined,
      };

      const response = await (data.IsEdit
        ? standardSetService.update(cleanedRequest)
        : standardSetService.insert(cleanedRequest));

      if (!response.Success) {
        throw new Error(response.Message);
      }
      return response;
    },
    onSuccess: (_, variables) => {
      toast.success(
        variables.IsEdit ? "Cập nhật thành công" : "Thêm mới thành công",
      );
      queryClient.invalidateQueries({ queryKey: ["standardSets"] });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Lỗi khi lưu dữ liệu");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const response = await standardSetService.deleteList(ids);
      if (!response.Success) {
        throw new Error(response.Message);
      }
      return response;
    },
    onSuccess: () => {
      toast.success("Xóa dữ liệu thành công");
      queryClient.invalidateQueries({ queryKey: ["standardSets"] });
      setRowSelection({});
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Lỗi khi xóa dữ liệu");
    },
  });

  const getList = useCallback(() => {
    refetch();
  }, [refetch]);

  const showPopupDetail = useCallback(async (id: string, isEdit: boolean) => {
    if (isEdit && id) {
      try {
        const response = await standardSetService.getById(id);
        if (response.Success && response.Data) {
          setStandardSet({ ...response.Data, IsEdit: true });
          setIsOpen(true);
        }
      } catch {
        toast.error("Không thể lấy thông tin chi tiết");
      }
    } else {
      setStandardSet(EMPTY_STANDARD_SET);
      setIsOpen(true);
    }
  }, []);

  const onOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setStandardSet(null);
    }
  }, []);

  const saveChange = async (
    saveStandardSet: StandardSet & { IsEdit: boolean },
    isAddMore: boolean,
  ) => {
    try {
      await saveMutation.mutateAsync(saveStandardSet);
      if (isAddMore) {
        setStandardSet(EMPTY_STANDARD_SET);
      } else {
        setIsOpen(false);
        setStandardSet(null);
      }
    } catch {
      // Error handled in mutation
    }
  };

  const deleteList = async (ids: string[]) => {
    await deleteMutation.mutateAsync(ids);
  };

  return {
    data,
    standardSet,
    isOpen,
    pageRequest,
    rowSelection,
    setPageRequest,
    setRowSelection,
    getList,
    showPopupDetail,
    onOpenChange,
    saveChange,
    deleteList,
    isLoading: saveMutation.isPending || deleteMutation.isPending,
    isFetching,
  };
};
