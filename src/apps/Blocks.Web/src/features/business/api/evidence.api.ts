import api, { type ApiResponse } from "@/lib/api";
import type { Evidence, EvidenceGetListPagingRequest, EvidenceApproveRequest } from "@/features/business/types/evidence.types";
import type { GetListPagingResponse, ModelCombobox } from "@/types/base/base.types";
import { API_ENDPOINTS } from "@/config/constants";

export const evidenceService = {
  getList: async (request: EvidenceGetListPagingRequest): Promise<ApiResponse<GetListPagingResponse<Evidence>>> => {
    return api.post<GetListPagingResponse<Evidence>>(API_ENDPOINTS.Business.Evidence.GET_LIST, request);
  },

  getById: async (id: string): Promise<ApiResponse<Evidence>> => {
    return api.get<Evidence>(API_ENDPOINTS.Business.Evidence.GET_BY_ID, { params: { id } });
  },

  insert: async (data: Evidence): Promise<ApiResponse<Evidence>> => {
    return api.post<Evidence>(API_ENDPOINTS.Business.Evidence.INSERT, data);
  },

  update: async (data: Evidence): Promise<ApiResponse<Evidence>> => {
    return api.put<Evidence>(API_ENDPOINTS.Business.Evidence.UPDATE, data);
  },

  deleteList: async (ids: string[]): Promise<ApiResponse<string>> => {
    return api.delete<string>(API_ENDPOINTS.Business.Evidence.DELETE_LIST, { data: { ids } });
  },

  getAllCombobox: async (): Promise<ApiResponse<ModelCombobox[]>> => {
    return api.get<ModelCombobox[]>(API_ENDPOINTS.Business.Evidence.GET_ALL_COMBOBOX);
  },

  submitToApprove: async (ids: string[]): Promise<ApiResponse<null>> => {
    return api.post<null>(API_ENDPOINTS.Business.Evidence.SUBMIT_TO_APPROVE, { Ids: ids });
  },

  approve: async (request: EvidenceApproveRequest): Promise<ApiResponse<null>> => {
    return api.post<null>(API_ENDPOINTS.Business.Evidence.APPROVE, request);
  },
};
