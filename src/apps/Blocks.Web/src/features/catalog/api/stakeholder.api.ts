import { api, type ApiResponse } from "@/lib/api";
import type {
  Stakeholder,
  StakeholderGetListPaging,
  StakeholderGetListPagingRequest,
} from "../types/stakeholder.types";
import type {
  GetListPagingResponse,
  ModelCombobox,
} from "@/types/base/base.types";
import { API_ENDPOINTS } from "@/config";

export const stakeholderApi = {
  getList: async (
    request: StakeholderGetListPagingRequest
  ): Promise<ApiResponse<GetListPagingResponse<StakeholderGetListPaging>>> => {
    return api.post<GetListPagingResponse<StakeholderGetListPaging>>(
      API_ENDPOINTS.Catalog.Stakeholder.GET_LIST,
      request
    );
  },

  getById: async (id: string): Promise<ApiResponse<Stakeholder>> => {
    return api.get<Stakeholder>(API_ENDPOINTS.Catalog.Stakeholder.GET_BY_ID, {
      params: { id },
    });
  },

  insert: async (data: Stakeholder): Promise<ApiResponse<Stakeholder>> => {
    return api.post<Stakeholder>(
      API_ENDPOINTS.Catalog.Stakeholder.INSERT,
      data
    );
  },

  update: async (data: Stakeholder): Promise<ApiResponse<Stakeholder>> => {
    return api.put<Stakeholder>(API_ENDPOINTS.Catalog.Stakeholder.UPDATE, data);
  },

  deleteList: async (ids: string[]): Promise<ApiResponse<string>> => {
    return api.delete<string>(API_ENDPOINTS.Catalog.Stakeholder.DELETE_LIST, {
      data: { ids },
    });
  },

  getAllCombobox: async (): Promise<ApiResponse<ModelCombobox[]>> => {
    return api.get<ModelCombobox[]>(
      API_ENDPOINTS.Catalog.Stakeholder.GET_ALL_COMBOBOX
    );
  },
};
