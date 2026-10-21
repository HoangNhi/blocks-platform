import { useState, useCallback, useEffect } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { menuService } from "@/features/system/api/menu.api";
import type { Menu } from "@/features/system/types/menu.types";
import type { GetListPagingRequest } from "@/types/base/base.types";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import type { RowSelectionState } from "@tanstack/react-table";

export const useMenu = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Menu | null>(null);
  const [pageRequest, setPageRequest] = useState<GetListPagingRequest>({
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
    queryKey: ["menus", pageRequest],
    queryFn: () => menuService.getList(pageRequest),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    if (listResponse && !listResponse.Success) {
      toast.error(listResponse.Message);
    }
  }, [listResponse]);

  const data = listResponse?.Data || {
    Data: [],
    TotalRow: 0,
    PageIndex: 1,
    PageSize: 10,
  };

  // 2. Mutations
  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: (item: Menu) => {
      return item.IsEdit ? menuService.update(item) : menuService.insert(item);
    },
    onSuccess: (response, variables) => {
      if (response.Success) {
        toast.success(
          variables.IsEdit ? "Cập nhật thành công" : "Thêm mới thành công"
        );
        queryClient.invalidateQueries({ queryKey: ["menus"] });
      } else {
        toast.error(response.Message);
      }
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Lỗi khi lưu dữ liệu"
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (ids: string[]) => menuService.deleteList(ids),
    onSuccess: (response) => {
      if (response.Success) {
        toast.success("Xóa dữ liệu thành công");
        queryClient.invalidateQueries({ queryKey: ["menus"] });
        setRowSelection({});
      } else {
        toast.error(response.Message);
      }
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Lỗi khi xóa dữ liệu"
      );
    },
  });

  // 3. Handlers
  const getList = useCallback(() => {
    refetch();
  }, [refetch]);

  const showPopupDetail = useCallback(async (id: string, isEdit: boolean) => {
    if (isEdit) {
      const response = await menuService.getById(id);
      if (response?.Success) {
        setSelectedItem({ ...response.Data!, IsEdit: isEdit });
        setIsOpen(true);
      } else {
        toast.error(response?.Message);
      }
    } else {
      setSelectedItem({
        Id: id,
        Name: "",
        Controller: "",
        Sort: 0,
        SystemGroupId: "",
        CanView: false,
        CanAdd: false,
        CanUpdate: false,
        CanDelete: false,
        CanApprove: false,
        CanAnalyze: false,
        IsEdit: isEdit,
        IsActived: true,
        IsShowMenu: true,
      });
      setIsOpen(true);
    }
  }, []);

  const onOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    if (!open) setSelectedItem(null);
  }, []);

  const saveChange = async (item: Menu, isAddMore: boolean) => {
    const result = await saveMutation.mutateAsync(item);
    if (result.Success) {
      if (isAddMore) {
        setSelectedItem({
          Id: uuidv4(),
          Name: "",
          Controller: "",
          Sort: 0,
          SystemGroupId: "",
          CanView: false,
          CanAdd: false,
          CanUpdate: false,
          CanDelete: false,
          CanApprove: false,
          CanAnalyze: false,
          IsEdit: false,
          IsActived: true,
          IsShowMenu: true,
        });
      } else {
        setIsOpen(false);
        setSelectedItem(null);
      }
    }
  };

  const deleteList = async (ids: string[]) => {
    await deleteMutation.mutateAsync(ids);
  };

  return {
    data,
    selectedItem,
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
