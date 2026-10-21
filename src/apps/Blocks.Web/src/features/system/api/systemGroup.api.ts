import api, { type ApiResponse } from "@/lib/api";
import type {
  SystemGroup,
  SystemGroupGetListPaging,
} from "@/features/system/types/systemGroup.types";
import type {
  GetListPagingRequest,
  ModelCombobox,
} from "@/types/base/base.types";
import { API_ENDPOINTS } from "@/config/constants";
import type { GetListPagingResponse } from "@/types/base/base.types";

export const systemGroupService = {
  getList: async (
    request: GetListPagingRequest
  ): Promise<ApiResponse<GetListPagingResponse<SystemGroupGetListPaging>>> => {
    return api.post<GetListPagingResponse<SystemGroupGetListPaging>>(
      API_ENDPOINTS.System.SystemGroup.GET_LIST,
      request
    );
  },

  getById: async (id: string): Promise<ApiResponse<SystemGroup>> => {
    return api.get<SystemGroup>(API_ENDPOINTS.System.SystemGroup.GET_BY_ID, {
      params: { id },
    });
  },

  insert: async (data: SystemGroup): Promise<ApiResponse<SystemGroup>> => {
    return api.post<SystemGroup>(API_ENDPOINTS.System.SystemGroup.INSERT, data);
  },

  update: async (data: SystemGroup): Promise<ApiResponse<SystemGroup>> => {
    return api.put<SystemGroup>(API_ENDPOINTS.System.SystemGroup.UPDATE, data);
  },

  deleteList: async (ids: string[]): Promise<ApiResponse<SystemGroup[]>> => {
    return api.delete<SystemGroup[]>(
      API_ENDPOINTS.System.SystemGroup.DELETE_LIST,
      { data: { ids } }
    );
  },

  getAllCombobox: async (): Promise<ApiResponse<ModelCombobox[]>> => {
    return api.get<ModelCombobox[]>(
      API_ENDPOINTS.System.SystemGroup.GET_ALL_COMBOBOX
    );
  },
  getAllNotParentCombobox: async (): Promise<ApiResponse<ModelCombobox[]>> => {
    return api.get<ModelCombobox[]>(
      API_ENDPOINTS.System.SystemGroup.GET_ALL_NOT_PARENT_COMBOBOX
    );
  },
  getAll: async (): Promise<ApiResponse<SystemGroup[]>> => {
    return api.get<SystemGroup[]>(API_ENDPOINTS.System.SystemGroup.GET_ALL);
  },
};
