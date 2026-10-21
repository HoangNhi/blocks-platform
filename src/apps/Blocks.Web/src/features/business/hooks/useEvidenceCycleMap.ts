import { useState, useCallback, useEffect } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { evidenceCycleMapService } from "@/features/business/api/evidenceCycleMap.api";
import { toast } from "sonner";
import { v4 as uuidv4 } from "uuid";
import type { RowSelectionState } from "@tanstack/react-table";
import type { EvidenceCycleMap, EvidenceCycleMapGetListPagingRequest, ApproveRequest } from "../types/evidence-cycle-map.types";
import type { Evidence } from "../types/evidence.types";

export const useEvidenceCycleMap = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [evidenceCycleMap, setEvidenceCycleMap] = useState<EvidenceCycleMap | null>(null);
  const [pageRequest, setPageRequest] = useState<EvidenceCycleMapGetListPagingRequest>({
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
    queryKey: ["evidenceCycleMaps", pageRequest],
    queryFn: () => evidenceCycleMapService.getList(pageRequest),
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
    mutationFn: (data: EvidenceCycleMap) => {
      return data.IsEdit
        ? evidenceCycleMapService.update(data)
        : evidenceCycleMapService.insertWithEvidence(data);
    },
    onSuccess: (response, variables) => {
      if (response.Success) {
        toast.success(
          variables.IsEdit ? "Cập nhật thành công" : "Thêm mới thành công"
        );
        queryClient.invalidateQueries({ queryKey: ["evidenceCycleMaps"] });
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
    mutationFn: (ids: string[]) => evidenceCycleMapService.deleteList(ids),
    onSuccess: (response) => {
      if (response.Success) {
        toast.success("Xóa dữ liệu thành công");
        queryClient.invalidateQueries({ queryKey: ["evidenceCycleMaps"] });
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

  const approveMutation = useMutation({
    mutationFn: (request: ApproveRequest) =>
      evidenceCycleMapService.approve(request),
    onSuccess: (response) => {
      if (response.Success) {
        toast.success("Cập nhật trạng thái thành công");
        queryClient.invalidateQueries({ queryKey: ["evidenceCycleMaps"] });
      } else {
        toast.error(response.Message);
      }
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Lỗi khi cập nhật trạng thái"
      );
    },
  });

  const submitToApproveMutation = useMutation({
    mutationFn: (ids: string[]) =>
      evidenceCycleMapService.submitToApprove({ Ids: ids }),
    onSuccess: (response) => {
      if (response.Success) {
        toast.success("Gửi duyệt thành công");
        queryClient.invalidateQueries({ queryKey: ["evidenceCycleMaps"] });
        setRowSelection({});
      } else {
        toast.error(response.Message);
      }
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Lỗi khi gửi duyệt"
      );
    },
  });

  // 3. Handlers
  const getList = useCallback(() => {
    refetch();
  }, [refetch]);

  const showPopupDetail = useCallback(async (id: string, isEdit: boolean) => {
    if (isEdit) {
      const response = await evidenceCycleMapService.getById(id);
      if (response?.Success && response?.Data) {
        setEvidenceCycleMap({ ...response.Data, IsEdit: isEdit });
        setIsOpen(true);
      } else {
        toast.error(response?.Message);
      }
    } else {
      // For new records, create with nested Evidence object
      const newEvidence: Evidence = {
        Id: uuidv4(),
        Name: "",
        Code: "",
        Status: 1,
        FileTypeId: "",
        CycleId: "",
        IsEdit: false,
        IsActived: true,
        AttachmentIds: [],
        ListAttachment: [],
        FolderUpload: uuidv4(),
        CreatedBy: "",
        CreatedAt: "",
      };

      setEvidenceCycleMap({
        Id: id,
        EvidenceId: "",
        CycleId: "",
        ReviewStatus: 1,
        Evidence: newEvidence,
        IsEdit: isEdit,
        IsActived: true,
        FolderUpload: uuidv4(),
        CreatedBy: "",
        CreatedAt: "",
      });
      setIsOpen(true);
    }
  }, []);

  const onOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    if (!open) setEvidenceCycleMap(null);
  }, []);

  const saveChange = async (saveData: EvidenceCycleMap, isAddMore: boolean) => {
    const result = await saveMutation.mutateAsync(saveData);
    if (result.Success) {
      if (isAddMore) {
        const newEvidence: Evidence = {
          Id: uuidv4(),
          Name: "",
          Code: "",
          Status: 1,
          FileTypeId: "",
          CycleId: "",
          IsEdit: false,
          IsActived: true,
          AttachmentIds: [],
          ListAttachment: [],
          FolderUpload: uuidv4(),
          CreatedBy: "",
          CreatedAt: "",
        };

        setEvidenceCycleMap({
          Id: uuidv4(),
          EvidenceId: "",
          CycleId: "",
          ReviewStatus: 1,
          Evidence: newEvidence,
          IsEdit: false,
          IsActived: true,
          FolderUpload: uuidv4(),
          CreatedBy: "",
          CreatedAt: "",
        });
      } else {
        setIsOpen(false);
        setEvidenceCycleMap(null);
      }
    }
  };

  const deleteList = async (ids: string[]) => {
    await deleteMutation.mutateAsync(ids);
  };

  const submitToApprove = (ids: string[]) => {
    submitToApproveMutation.mutate(ids);
  };

  const approve = async (id: string, status: number, reason?: string) => {
    const result = await approveMutation.mutateAsync({
      Id: id,
      EvidenceStatus: status,
      RejectionReason: reason,
    });
    if (result.Success) {
      setIsOpen(false);
      setEvidenceCycleMap(null);
    }
  };

  return {
    data,
    evidenceCycleMap,
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
    submitToApprove,
    approve,
    isLoading: saveMutation.isPending || deleteMutation.isPending,
    isSubmitting: submitToApproveMutation.isPending,
    isApproving: approveMutation.isPending,
    isFetching,
  };
};
