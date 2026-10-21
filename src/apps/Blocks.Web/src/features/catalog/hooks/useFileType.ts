import { useState, useCallback } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { fileTypeService } from "@/features/catalog/api/filetype.api";
import type {
  FileType,
  FileTypeGetListPagingRequest,
} from "@/features/catalog/types/filetype.types";
import { toast } from "sonner";
import type { RowSelectionState } from "@tanstack/react-table";

export const useFileType = () => {
  const EMPTY_FILE_TYPE: FileType = {
    Id: "",
    Code: "",
    Name: "",
    IsActived: true,
    IsEdit: false,
    FolderUpload: "",
  };

  const [isOpen, setIsOpen] = useState(false);
  const [fileType, setFileType] = useState<FileType | null>(null);
  const [pageRequest, setPageRequest] =
    useState<FileTypeGetListPagingRequest>({
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
    queryKey: ["fileTypes", pageRequest],
    queryFn: () => fileTypeService.getList(pageRequest),
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
    mutationFn: async (data: FileType) => {
      const cleanedRequest = {
        ...data,
        FolderUpload: data.FolderUpload || undefined,
      };

      const response = await (data.IsEdit
        ? fileTypeService.update(cleanedRequest)
        : fileTypeService.insert(cleanedRequest));

      if (!response.Success) {
        throw new Error(response.Message);
      }
      return response;
    },
    onSuccess: (_, variables) => {
      toast.success(
        variables.IsEdit ? "Cập nhật thành công" : "Thêm mới thành công"
      );
      queryClient.invalidateQueries({ queryKey: ["fileTypes"] });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Lỗi khi lưu dữ liệu"
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const response = await fileTypeService.deleteList(ids);
      if (!response.Success) {
        throw new Error(response.Message);
      }
      return response;
    },
    onSuccess: () => {
      toast.success("Xóa dữ liệu thành công");
      queryClient.invalidateQueries({ queryKey: ["fileTypes"] });
      setRowSelection({});
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
    if (isEdit && id) {
      try {
        const response = await fileTypeService.getById(id);
        if (response.Success && response.Data) {
          setFileType({ ...response.Data, IsEdit: true });
          setIsOpen(true);
        }
      } catch {
        toast.error("Không thể lấy thông tin chi tiết");
      }
    } else {
      setFileType(EMPTY_FILE_TYPE);
      setIsOpen(true);
    }
  }, []);

  const onOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setFileType(null);
    }
  }, []);

  const saveChange = async (
    saveFileType: FileType & { IsEdit: boolean },
    isAddMore: boolean
  ) => {
    try {
      await saveMutation.mutateAsync(saveFileType);
      if (isAddMore) {
        setFileType(EMPTY_FILE_TYPE);
      } else {
        setIsOpen(false);
        setFileType(null);
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
    fileType,
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
