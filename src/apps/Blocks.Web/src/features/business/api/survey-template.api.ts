import api, { type ApiResponse } from "@/lib/api";
import type {
  GetListPagingResponse,
  ModelCombobox,
} from "@/types/base/base.types";
import { API_ENDPOINTS } from "@/config/constants";
import type {
  SurveyTemplate,
  SurveyTemplateGetComboboxRequest,
  SurveyTemplateGetListPaging,
  SurveyTemplateGetListPagingRequest,
} from "../types/survey-template.types";

export const surveyTemplateService = {
  getList: async (
    request: SurveyTemplateGetListPagingRequest,
  ): Promise<
    ApiResponse<GetListPagingResponse<SurveyTemplateGetListPaging>>
  > => {
    return api.post<GetListPagingResponse<SurveyTemplateGetListPaging>>(
      API_ENDPOINTS.Business.SurveyTemplate.GET_LIST,
      request,
    );
  },

  getById: async (id: string): Promise<ApiResponse<SurveyTemplate>> => {
    return api.get<SurveyTemplate>(
      API_ENDPOINTS.Business.SurveyTemplate.GET_BY_ID,
      {
        params: { id },
      },
    );
  },

  insert: async (
    data: SurveyTemplate,
  ): Promise<ApiResponse<SurveyTemplate>> => {
    return api.post<SurveyTemplate>(
      API_ENDPOINTS.Business.SurveyTemplate.INSERT,
      data,
    );
  },

  update: async (
    data: SurveyTemplate,
  ): Promise<ApiResponse<SurveyTemplate>> => {
    return api.put<SurveyTemplate>(
      API_ENDPOINTS.Business.SurveyTemplate.UPDATE,
      data,
    );
  },

  deleteList: async (ids: string[]): Promise<ApiResponse<string>> => {
    return api.delete<string>(
      API_ENDPOINTS.Business.SurveyTemplate.DELETE_LIST,
      {
        data: { ids },
      },
    );
  },

  getAllCombobox: async (
    request: SurveyTemplateGetComboboxRequest,
  ): Promise<ApiResponse<ModelCombobox[]>> => {
    return api.get<ModelCombobox[]>(
      API_ENDPOINTS.Business.SurveyTemplate.GET_ALL_COMBOBOX,
      {
        params: request,
      },
    );
  },
};
