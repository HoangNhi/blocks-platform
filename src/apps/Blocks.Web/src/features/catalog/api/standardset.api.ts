import api, { type ApiResponse } from "@/lib/api";
import type {
  StandardSet,
  StandardSetGetListPagingRequest,
} from "@/features/catalog/types/standardset.types";
import type {
  GetListPagingResponse,
  ModelCombobox,
} from "@/types/base/base.types";
import { API_ENDPOINTS } from "@/config/constants";

export const standardSetService = {
  getList: async (
    request: StandardSetGetListPagingRequest
  ): Promise<ApiResponse<GetListPagingResponse<StandardSet>>> => {
    return api.post<GetListPagingResponse<StandardSet>>(
      API_ENDPOINTS.Catalog.StandardSet.GET_LIST,
      request
    );
  },

  getById: async (id: string): Promise<ApiResponse<StandardSet>> => {
    return api.get<StandardSet>(API_ENDPOINTS.Catalog.StandardSet.GET_BY_ID, {
      params: { id },
    });
  },

  insert: async (data: StandardSet): Promise<ApiResponse<StandardSet>> => {
    return api.post(API_ENDPOINTS.Catalog.StandardSet.INSERT, data);
  },

  update: async (data: StandardSet): Promise<ApiResponse<StandardSet>> => {
    return api.put(API_ENDPOINTS.Catalog.StandardSet.UPDATE, data);
  },

  deleteList: async (ids: string[]): Promise<ApiResponse<string>> => {
    return api.delete(API_ENDPOINTS.Catalog.StandardSet.DELETE_LIST, {
      data: { ids },
    });
  },

  getAllCombobox: async (): Promise<ApiResponse<ModelCombobox[]>> => {
    return api.get<ModelCombobox[]>(
      API_ENDPOINTS.Catalog.StandardSet.GET_ALL_COMBOBOX
    );
  },
};
