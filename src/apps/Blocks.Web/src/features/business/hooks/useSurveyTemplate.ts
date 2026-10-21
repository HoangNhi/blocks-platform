import { useState, useCallback } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import type {
  SurveyTemplate,
  SurveyTemplateGetListPagingRequest,
} from "../types/survey-template.types";
import { toast } from "sonner";
import type { RowSelectionState } from "@tanstack/react-table";
import { v4 as uuidv4 } from "uuid";
import { surveyTemplateService } from "../api/survey-template.api";

export const useSurveyTemplate = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [surveyTemplate, setSurveyTemplate] = useState<SurveyTemplate | null>(
    null
  );
  const [pageRequest, setPageRequest] =
    useState<SurveyTemplateGetListPagingRequest>({
      PageIndex: 1,
      PageSize: 10,
      TextSearch: "",
      IsActived: true,
      IsEdit: false,
      FolderUpload: "",
    });
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  // 1. Fetch List
  const {
    data: listResponse,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["survey-templates", pageRequest],
    queryFn: () => surveyTemplateService.getList(pageRequest),
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
    mutationFn: async (data: SurveyTemplate & { IsEdit: boolean }) => {
      const commonFields = {
        IsActived: data.IsActived,
        IsEdit: data.IsEdit,
        FolderUpload: uuidv4(), // Or pass from data if needed
      };

      if (data.IsEdit) {
        // Ensure we are passing UpdateSurveyTemplateCommand structure
        return await surveyTemplateService.update({
          Id: data.Id,
          Title: data.Title,
          StakeholderType: data.StakeholderType,
          Description: data.Description,
          ListTopic: data.ListTopic,
          ...commonFields,
        });
      } else {
        return await surveyTemplateService.insert({
          Id: data.Id,
          Title: data.Title,
          StakeholderType: data.StakeholderType,
          Description: data.Description,
          ListTopic: data.ListTopic,
          ...commonFields,
        });
      }
    },
    onSuccess: (data, variables) => {
      if (data.Success) {
        toast.success(
          variables.IsEdit ? "Cập nhật thành công" : "Thêm mới thành công"
        );
        queryClient.invalidateQueries({ queryKey: ["survey-templates"] });
      } else {
        toast.error(data.Message || "Lỗi khi lưu dữ liệu");
      }
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Lỗi khi lưu dữ liệu"
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      return await surveyTemplateService.deleteList(ids);
    },
    onSuccess: (data) => {
      if (data.Success) {
        toast.success("Xóa dữ liệu thành công");
        queryClient.invalidateQueries({ queryKey: ["survey-templates"] });
        setRowSelection({});
      } else {
        toast.error(data.Message || "Lỗi khi xóa dữ liệu");
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
      const loadingId = toast.loading("Đang tải dữ liệu...");
      try {
        const response = await surveyTemplateService.getById(id);

        toast.dismiss(loadingId);

        if (response?.Success && response.Data) {
          setSurveyTemplate({ ...response.Data, IsEdit: true });
          setIsOpen(true);
        } else {
          toast.error(response?.Message || "Không thể tải dữ liệu");
        }
      } catch {
        toast.dismiss(loadingId);
        toast.error("Đã có lỗi xảy ra khi tải dữ liệu");
      }
    } else {
      setSurveyTemplate({
        Id: id,
        Title: "",
        StakeholderType: 1,
        Description: "",
        IsActived: true,
        IsEdit: false,
        ListTopic: [],
        FolderUpload: "",
      });
      setIsOpen(true);
    }
  }, []);

  const onOpenChange = useCallback((open: boolean) => {
    setIsOpen(open);
    if (!open) setSurveyTemplate(null);
  }, []);

  const saveChange = async (
    saveData: SurveyTemplate & { IsEdit: boolean },
    isAddMore: boolean
  ) => {
    try {
      const result = await saveMutation.mutateAsync(saveData);

      if (!result.Success) return;

      if (isAddMore) {
        setSurveyTemplate({
          Id: uuidv4(),
          Title: "",
          StakeholderType: 1,
          Description: "",
          IsActived: true,
          IsEdit: false,
          ListTopic: [],
          FolderUpload: "",
        });
      } else {
        setIsOpen(false);
        setSurveyTemplate(null);
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
    surveyTemplate,
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
