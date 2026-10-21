import api, { type ApiResponse } from "@/lib/api";
import type {
  GetListPagingResponse,
  ModelCombobox,
} from "@/types/base/base.types";
import { API_ENDPOINTS } from "@/config/constants";
import type { Cycle, CycleGetListPaging, CycleGetListPagingRequest } from "../types/cycle.types";

export const cycleService = {
  getList: async (
    request: CycleGetListPagingRequest,
  ): Promise<ApiResponse<GetListPagingResponse<CycleGetListPaging>>> => {
    return api.post<GetListPagingResponse<CycleGetListPaging>>(
      API_ENDPOINTS.Business.Cycle.GET_LIST,
      request,
    );
  },

  getById: async (id: string): Promise<ApiResponse<Cycle>> => {
    return api.get<Cycle>(API_ENDPOINTS.Business.Cycle.GET_BY_ID, {
      params: { id },
    });
  },

  insert: async (data: Cycle): Promise<ApiResponse<Cycle>> => {
    return api.post<Cycle>(API_ENDPOINTS.Business.Cycle.INSERT, data);
  },

  update: async (data: Cycle): Promise<ApiResponse<Cycle>> => {
    return api.put<Cycle>(API_ENDPOINTS.Business.Cycle.UPDATE, data);
  },

  deleteList: async (ids: string[]): Promise<ApiResponse<string>> => {
    return api.delete<string>(API_ENDPOINTS.Business.Cycle.DELETE_LIST, {
      data: { ids },
    });
  },

  getComboboxByUser: async (): Promise<ApiResponse<ModelCombobox[]>> => {
    return api.get<ModelCombobox[]>(
      API_ENDPOINTS.Business.Cycle.GET_COMBBOX_BY_USER,
    );
  },

  getComboboxForExternalReview: async (): Promise<ApiResponse<ModelCombobox[]>> => {
    return api.get<ModelCombobox[]>(
      API_ENDPOINTS.Business.Cycle.GET_COMBOBOX_FOR_EXTERNAL_REVIEW,
    );
  },

  changeStatus: async (id: string): Promise<ApiResponse<null>> => {
    return api.put<null>(API_ENDPOINTS.Business.Cycle.CHANGE_STATUS, { Id: id });
  },
};
