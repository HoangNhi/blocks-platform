import { useState, useCallback } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { stakeholderApi } from "@/features/catalog/api/stakeholder.api";
import type {
  Stakeholder,
  StakeholderGetListPagingRequest,
} from "@/features/catalog/types/stakeholder.types";
import { toast } from "sonner";
import type { RowSelectionState } from "@tanstack/react-table";

export const useStakeholder = () => {
  const EMPTY_STAKEHOLDER: Stakeholder = {
    Id: "",
    FullName: "",
    Email: "",
    Type: 0,
    Description: "",
    IsEdit: false,
    IsActived: true,
    FolderUpload: "",
  };

  const [isOpen, setIsOpen] = useState(false);
  const [stakeholder, setStakeholder] = useState<Stakeholder | null>(null);
  const [pageRequest, setPageRequest] =
    useState<StakeholderGetListPagingRequest>({
      PageIndex: 1,
      PageSize: 10,
      TextSearch: "",
    });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  // 1. Fetch List
  const {
    data: listResponse,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["stakeholders", pageRequest],
    queryFn: () => stakeholderApi.getList(pageRequest),
    placeholderData: keepPreviousData,
  });

  const data = listResponse?.Data || {
    Data: [],
    TotalRow: 0,
    PageIndex: 1,
    PageSize: 10,
  };

  // 2. Mutations
  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: async (data: Stakeholder) => {
      const response = await (data.IsEdit
        ? stakeholderApi.update(data)
        : stakeholderApi.insert(data));
      if (!response.Success) {
        throw new Error(response.Message);
      }
      return response;
    },
    onSuccess: (_, variables) => {
      toast.success(
        variables.IsEdit ? "Cập nhật thành công" : "Thêm mới thành công",
      );
      queryClient.invalidateQueries({ queryKey: ["stakeholders"] });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Lỗi khi lưu dữ liệu",
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const response = await stakeholderApi.deleteList(ids);
      if (!response.Success) {
        throw new Error(response.Message);
      }
      return response;
    },
    onSuccess: () => {
      toast.success("Xóa dữ liệu thành công");
      queryClient.invalidateQueries({ queryKey: ["stakeholders"] });
      setRowSelection({});
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Lỗi khi xóa dữ liệu",
      );
    },
  });

  // 3. Handlers
  const getList = useCallback(() => {
    refetch();
  }, [refetch]);

  const showPopupDetail = useCallback(async (id: string, isEdit: boolean) => {
    if (isEdit) {
      try {
        const response = await stakeholderApi.getById(id);
        if (response.Success && response.Data) {
          setStakeholder({ ...response.Data, IsEdit: isEdit });
          setIsOpen(true);
        }
      } catch {
        toast.error("Không thể lấy thông tin chi tiết");
      }
    } else {
      setStakeholder(EMPTY_STAKEHOLDER);
      setIsOpen(true);
    }
  }, []);

  const onOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    if (!open) setStakeholder(null);
  }, []);

  const saveChange = async (saveData: Stakeholder, isAddMore: boolean) => {
    try {
      await saveMutation.mutateAsync(saveData);
      if (isAddMore) {
        setStakeholder(EMPTY_STAKEHOLDER);
      } else {
        setIsOpen(false);
        setStakeholder(null);
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
    stakeholder,
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
