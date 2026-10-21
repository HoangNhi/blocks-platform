import api, { type ApiResponse } from "@/lib/api";
import type {
  AddAllStakeholderToCampaignRequest,
  AddListStakeholderToCampaignRequest,
  AggregatedSurveyResult,
  GetListSessionRequest,
  GetStakeholderNotInCampaignRequest,
  SurveyCampaign,
  SurveyCampaignGetListPaging,
  SurveyCampaignGetListPagingRequest,
  SurveySession,
  SurveySubmissionRequest,
  SurveyView,
} from "../types/survey-campaign.types";
import type { GetListPagingResponse } from "@/types/base/base.types";
import { API_ENDPOINTS } from "@/config";
import type { Stakeholder } from "@/features/catalog/types/stakeholder.types";

export const surveyCampaignService = {
  getList: async (
    request: SurveyCampaignGetListPagingRequest,
  ): Promise<
    ApiResponse<GetListPagingResponse<SurveyCampaignGetListPaging>>
  > => {
    // Clean request: convert empty string CycleId to undefined for backend Nullable<Guid>
    const cleanedRequest = {
      ...request,
      CycleId: request.CycleId || undefined,
    };
    return api.post<GetListPagingResponse<SurveyCampaignGetListPaging>>(
      API_ENDPOINTS.Business.SurveyCampaign.GET_LIST,
      cleanedRequest,
    );
  },

  getById: async (id: string): Promise<ApiResponse<SurveyCampaign>> => {
    return api.get<SurveyCampaign>(
      API_ENDPOINTS.Business.SurveyCampaign.GET_BY_ID,
      {
        params: { id },
      },
    );
  },

  insert: async (
    request: SurveyCampaign,
  ): Promise<ApiResponse<SurveyCampaign>> => {
    return api.post<SurveyCampaign>(
      API_ENDPOINTS.Business.SurveyCampaign.INSERT,
      request,
    );
  },

  update: async (
    request: SurveyCampaign,
  ): Promise<ApiResponse<SurveyCampaign>> => {
    return api.put<SurveyCampaign>(
      API_ENDPOINTS.Business.SurveyCampaign.UPDATE,
      request,
    );
  },

  deleteList: async (ids: string[]): Promise<ApiResponse<string>> => {
    return api.delete<string>(
      API_ENDPOINTS.Business.SurveyCampaign.DELETE_LIST,
      {
        data: { Ids: ids },
      },
    );
  },

  getStakeholderNotInCampaign: async (
    request: GetStakeholderNotInCampaignRequest,
  ): Promise<ApiResponse<GetListPagingResponse<Stakeholder>>> => {
    return api.post<GetListPagingResponse<Stakeholder>>(
      API_ENDPOINTS.Business.SurveyCampaign.GET_STAKEHOLDER_NOT_IN_CAMPAIGN,
      request,
    );
  },

  getListSession: async (
    request: GetListSessionRequest,
  ): Promise<ApiResponse<GetListPagingResponse<SurveySession>>> => {
    return api.post<GetListPagingResponse<SurveySession>>(
      API_ENDPOINTS.Business.SurveyCampaign.GET_LIST_SESSION,
      request,
    );
  },

  addAllStakeholderToCampaign: async (
    request: AddAllStakeholderToCampaignRequest,
  ): Promise<ApiResponse> => {
    return api.post(
      API_ENDPOINTS.Business.SurveyCampaign.ADD_ALL_STAKEHOLDER_TO_CAMPAIGN,
      request,
    );
  },

  addListStakeholderToCampaign: async (
    request: AddListStakeholderToCampaignRequest,
  ): Promise<ApiResponse> => {
    return api.post(
      API_ENDPOINTS.Business.SurveyCampaign.ADD_LIST_STAKEHOLDER_TO_CAMPAIGN,
      request,
    );
  },

  deleteListSession: async (ids: string[]): Promise<ApiResponse<string>> => {
    return api.delete<string>(
      API_ENDPOINTS.Business.SurveyCampaign.DELETE_LIST_SESSION,
      {
        data: { Ids: ids },
      },
    );
  },

  changeStatus: async (id: string): Promise<ApiResponse<boolean>> => {
    return api.post(API_ENDPOINTS.Business.SurveyCampaign.CHANGE_STATUS, {
      id,
    });
  },

  sendSurveyInvitation: async (id: string): Promise<ApiResponse<boolean>> => {
    return api.post(
      API_ENDPOINTS.Business.SurveyCampaign.SEND_SURVEY_INVITATION,
      {
        id,
      },
    );
  },

  getSurveyByToken: async (token: string): Promise<ApiResponse<SurveyView>> => {
    return api.get<SurveyView>(
      API_ENDPOINTS.Business.SurveyCampaign.GET_SURVEY_BY_TOKEN,
      {
        params: { token },
      },
    );
  },

  submitSurvey: async (
    data: SurveySubmissionRequest,
  ): Promise<ApiResponse<boolean>> => {
    return api.post<boolean>(
      API_ENDPOINTS.Business.SurveyCampaign.SUBMIT_SURVEY,
      data,
    );
  },

  getAggregatedResults: async (
    campaignId: string,
  ): Promise<ApiResponse<AggregatedSurveyResult>> => {
    return api.get<AggregatedSurveyResult>(
      API_ENDPOINTS.Business.SurveyCampaign.GET_AGGREGATED_RESULTS,
      {
        params: { campaignId },
      },
    );
  },
};
