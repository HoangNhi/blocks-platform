import { useQuery, keepPreviousData, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import type { GetListSessionRequest } from "../types/survey-campaign.types";
import { surveyCampaignService } from "../api/survey-campaign.api";

export const useSurveySession = (
  request: GetListSessionRequest,
  enabled: boolean = true,
) => {
  const {
    data: listResponse,
    refetch,
    isFetching,
    isError,
  } = useQuery({
    queryKey: ["survey-sessions", request],
    queryFn: async () => {
      const response = await surveyCampaignService.getListSession(request);
      if (!response.Success) {
        toast.error(
          response.Message || "Không thể lấy danh sách người tham gia",
        );
        throw new Error(response.Message);
      }
      return response;
    },
    placeholderData: keepPreviousData,
    enabled: enabled && !!request.CampaignId,
  });

  const data = listResponse?.Data || {
    Data: [],
    TotalRow: 0,
    PageIndex: 1,
    PageSize: 10,
  };

  return {
    data: data.Data,
    totalRow: data.TotalRow,
    isFetching,
    isError,
    refetch,
  };
};

export const useDeleteSurveySession = () => {
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const response = await surveyCampaignService.deleteListSession(ids);
      if (!response.Success) {
        throw new Error(response.Message);
      }
      return response;
    },
    onSuccess: (response) => {
      if (response.Success) {
        toast.success("Xóa người tham gia thành công");
      }
    },
    onError: (error) => {
      toast.error(error.message || "Có lỗi xảy ra khi xóa người tham gia");
    },
  });
};
