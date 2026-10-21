import { useState, useCallback, useEffect } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { roleService } from "@/features/system/api/role.api";
import type {
  PermissionRequest,
  Role,
} from "@/features/system/types/role.types";
import type { GetListPagingRequest } from "@/types/base/base.types";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import type { RowSelectionState } from "@tanstack/react-table";

export const useRole = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<Role | null>(null);

  const [isOpenPermission, setIsOpenPermission] = useState(false);
  const [permissionRoleId, setPermissionRoleId] = useState<string | null>(null);

  const [pageRequest, setPageRequest] = useState<GetListPagingRequest>({
    PageIndex: 1,
    PageSize: 10,
    TextSearch: "",
  });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  // 1. Queries
  const {
    data: listResponse,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["roles", pageRequest],
    queryFn: () => roleService.getList(pageRequest),
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

  const { data: permissionResponse } = useQuery({
    queryKey: ["permissions", permissionRoleId],
    queryFn: () => roleService.getPermissionsByRole(permissionRoleId!),
    enabled: !!permissionRoleId && isOpenPermission,
  });

  useEffect(() => {
    if (permissionResponse && !permissionResponse.Success) {
      toast.error(permissionResponse.Message);
    }
  }, [permissionResponse]);

  const permissionData = permissionResponse?.Data || [];

  // 2. Mutations
  const queryClient = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: (item: Role) => {
      return item.IsEdit ? roleService.update(item) : roleService.insert(item);
    },
    onSuccess: (response, variables) => {
      if (response.Success) {
        toast.success(
          variables.IsEdit ? "Cập nhật thành công" : "Thêm mới thành công"
        );
        queryClient.invalidateQueries({ queryKey: ["roles"] });
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
    mutationFn: (ids: string[]) => roleService.deleteList(ids),
    onSuccess: (response) => {
      if (response.Success) {
        toast.success("Xóa dữ liệu thành công");
        queryClient.invalidateQueries({ queryKey: ["roles"] });
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

  const savePermissionMutation = useMutation({
    mutationFn: (data: PermissionRequest[]) =>
      roleService.updatePermission(data),
    onSuccess: (response) => {
      if (response.Success) {
        toast.success("Cập nhật phân quyền thành công");
        queryClient.invalidateQueries({
          queryKey: ["permissions", permissionRoleId],
        });
        setIsOpenPermission(false);
      } else {
        toast.error(response.Message);
      }
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Lỗi khi lưu phân quyền"
      );
    },
  });

  // 3. Handlers
  const getList = useCallback(() => {
    refetch();
  }, [refetch]);

  const showPopupDetail = useCallback(async (id: string, isEdit: boolean) => {
    if (isEdit) {
      const response = await roleService.getById(id);
      if (response?.Success && response.Data) {
        setSelectedItem({ ...response.Data, IsEdit: isEdit });
        setIsOpen(true);
      } else {
        toast.error(response?.Message);
      }
    } else {
      setSelectedItem({
        Id: id,
        Name: "",
        IsEdit: isEdit,
        CreatedAt: "",
        UpdatedAt: "",
        IsActived: true,
      });
      setIsOpen(true);
    }
  }, []);

  const showPopupPermission = useCallback((id: string) => {
    setPermissionRoleId(id);
    setIsOpenPermission(true);
  }, []);

  const onOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    if (!open) setSelectedItem(null);
  }, []);

  const onOpenPermissionChange = useCallback((open: boolean) => {
    setIsOpenPermission(open);
    if (!open) setPermissionRoleId(null);
  }, []);

  const saveChange = async (item: Role, isAddMore: boolean) => {
    const result = await saveMutation.mutateAsync(item);
    if (result.Success) {
      if (isAddMore) {
        setSelectedItem({
          Id: uuidv4(),
          Name: "",
          IsEdit: false,
          CreatedAt: "",
          UpdatedAt: "",
          IsActived: true,
        });
      } else {
        setIsOpen(false);
        setSelectedItem(null);
      }
    }
  };

  const savePermission = async (data: PermissionRequest[]) => {
    await savePermissionMutation.mutateAsync(data);
  };

  const deleteList = async (ids: string[]) => {
    await deleteMutation.mutateAsync(ids);
  };

  return {
    data,
    selectedItem,
    isOpen,
    isOpenPermission,
    permissionData,
    pageRequest,
    rowSelection,
    setPageRequest,
    setRowSelection,
    getList,
    showPopupDetail,
    showPopupPermission,
    onOpenChange,
    onOpenPermissionChange,
    saveChange,
    savePermission,
    deleteList,
    isLoading:
      saveMutation.isPending ||
      deleteMutation.isPending ||
      savePermissionMutation.isPending,
    isFetching,
  };
};
