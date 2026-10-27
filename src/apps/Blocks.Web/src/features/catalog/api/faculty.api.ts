import api, { type ApiResponse } from "@/lib/api";
import type { Faculty } from "@/features/catalog/types/faculty.types";
import type { GetListPagingRequest, GetListPagingResponse, ModelCombobox } from "@/types/base/base.types";
import { API_ENDPOINTS } from "@/config/constants";

export const facultyService = {
  getList: async (request: GetListPagingRequest): Promise<ApiResponse<GetListPagingResponse<Faculty>>> => {
    return api.post<GetListPagingResponse<Faculty>>(API_ENDPOINTS.Catalog.Faculty.GET_LIST, request);
  },

  getById: async (id: string): Promise<ApiResponse<Faculty>> => {
    return api.get<Faculty>(API_ENDPOINTS.Catalog.Faculty.GET_BY_ID, { params: { id } });
  },

  insert: async (data: Faculty): Promise<ApiResponse<Faculty>> => {
    return api.post<Faculty>(API_ENDPOINTS.Catalog.Faculty.INSERT, data);
  },

  update: async (data: Faculty): Promise<ApiResponse<Faculty>> => {
    return api.put<Faculty>(API_ENDPOINTS.Catalog.Faculty.UPDATE, data);
  },

  deleteList: async (ids: string[]): Promise<ApiResponse<string>> => {
    return api.delete<string>(API_ENDPOINTS.Catalog.Faculty.DELETE_LIST, { data: { ids } });
  },
  
  getAllCombobox: async (): Promise<ApiResponse<ModelCombobox[]>> => {
      return api.get<ModelCombobox[]>(API_ENDPOINTS.Catalog.Faculty.GET_ALL_COMBOBOX);
  }
};
