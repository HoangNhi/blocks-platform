import { useState, useCallback } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  SurveyCampaign,
  SurveyCampaignGetListPagingRequest,
} from "../types/survey-campaign.types";
import { surveyCampaignService } from "../api/survey-campaign.api";
import type { RowSelectionState } from "@tanstack/react-table";

export const useSurveyCampaign = () => {
  const EMPTY_SURVEY_CAMPAIGN: SurveyCampaign = {
    Id: "",
    CycleId: "",
    TemplateId: "",
    StakeholderType: 0,
    Name: "",
    Status: 1,
    ListScore: [],
    ListTextAnswer: [],
    ListTopic: [],
    ListSession: [],
    IsActived: true,
    IsEdit: false,
    FolderUpload: "",
  };

  const [isOpen, setIsOpen] = useState(false);
  const [surveyCampaign, setSurveyCampaign] = useState<SurveyCampaign | null>(
    null,
  );
  const [pageRequest, setPageRequest] =
    useState<SurveyCampaignGetListPagingRequest>({
      PageIndex: 1,
      PageSize: 10,
      TextSearch: "",
      CycleId: undefined,
      StakeholderType: undefined,
    });

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  // 1. Fetch List
  const {
    data: listResponse,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["survey-campaigns", pageRequest],
    queryFn: () => surveyCampaignService.getList(pageRequest),
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
    mutationFn: async (data: SurveyCampaign) => {
      const cleanedRequest = {
        ...data,
        CycleId: data.CycleId || "",
        TemplateId: data.TemplateId || "",
      };

      const response = await (data.IsEdit
        ? surveyCampaignService.update(cleanedRequest)
        : surveyCampaignService.insert(cleanedRequest));

      if (!response.Success) {
        throw new Error(response.Message);
      }
      return response;
    },
    onSuccess: (_, variables) => {
      toast.success(
        variables.IsEdit ? "Cập nhật thành công" : "Thêm mới thành công",
      );
      queryClient.invalidateQueries({ queryKey: ["survey-campaigns"] });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Lỗi khi lưu dữ liệu",
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const response = await surveyCampaignService.deleteList(ids);
      if (!response.Success) {
        throw new Error(response.Message);
      }
      return response;
    },
    onSuccess: () => {
      toast.success("Xóa chiến dịch thành công");
      queryClient.invalidateQueries({ queryKey: ["survey-campaigns"] });
      setRowSelection({});
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Lỗi khi xóa chiến dịch",
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
        const response = await surveyCampaignService.getById(id);
        if (response.Success && response.Data) {
          // Use the data directly, assuming IsEdit is handled or part of the object
          // Since getById returns SurveyCampaign, and we need to set IsEdit for the form context
          setSurveyCampaign({ ...response.Data, IsEdit: true });
          setIsOpen(true);
        }
      } catch {
        toast.error("Không thể lấy thông tin chi tiết");
      }
    } else {
      setSurveyCampaign(EMPTY_SURVEY_CAMPAIGN);
      setIsOpen(true);
    }
  }, []);

  const onOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setSurveyCampaign(null);
    }
  }, []);

  const saveChange = async (
    saveData: SurveyCampaign & { IsEdit: boolean },
    isAddMore: boolean,
  ) => {
    try {
      await saveMutation.mutateAsync(saveData);
      if (isAddMore) {
        setSurveyCampaign(EMPTY_SURVEY_CAMPAIGN);
      } else {
        setIsOpen(false);
        setSurveyCampaign(null);
      }
    } catch {
      // Error handled in mutation
    }
  };

  const deleteList = async (ids: string[]) => {
    await deleteMutation.mutateAsync(ids);
  };

  const changeStatusMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await surveyCampaignService.changeStatus(id);
      if (!response.Success) {
        throw new Error(response.Message);
      }
      return response;
    },
    onSuccess: () => {
      toast.success("Cập nhật trạng thái thành công");
      queryClient.invalidateQueries({ queryKey: ["survey-campaigns"] });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Lỗi khi cập nhật trạng thái",
      );
    },
  });

  const handleChangeStatus = async (id: string) => {
    await changeStatusMutation.mutateAsync(id);
  };

  return {
    data,
    surveyCampaign,
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
    handleChangeStatus,
    isLoading:
      saveMutation.isPending ||
      deleteMutation.isPending ||
      changeStatusMutation.isPending,
    isFetching,
  };
};
