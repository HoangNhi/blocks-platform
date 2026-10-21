import api, { type ApiResponse } from "@/lib/api";
import type {
  FileType,
  FileTypeGetListPagingRequest,
} from "@/features/catalog/types/filetype.types";
import type { GetListPagingResponse, ModelCombobox } from "@/types/base/base.types";
import { API_ENDPOINTS } from "@/config/constants";

export const fileTypeService = {
  getList: async (request: FileTypeGetListPagingRequest): Promise<ApiResponse<GetListPagingResponse<FileType>>> => {
    return api.post<GetListPagingResponse<FileType>>(API_ENDPOINTS.Catalog.FileType.GET_LIST, request);
  },

  getById: async (id: string): Promise<ApiResponse<FileType>> => {
    return api.get<FileType>(API_ENDPOINTS.Catalog.FileType.GET_BY_ID, { params: { id } });
  },

  insert: async (data: FileType): Promise<ApiResponse<FileType>> => {
    return api.post(API_ENDPOINTS.Catalog.FileType.INSERT, data);
  },

  update: async (data: FileType): Promise<ApiResponse<FileType>> => {
    return api.put(API_ENDPOINTS.Catalog.FileType.UPDATE, data);
  },

  deleteList: async (ids: string[]): Promise<ApiResponse<string>> => {
    return api.delete(API_ENDPOINTS.Catalog.FileType.DELETE_LIST, { data: { ids } });
  },
  
  getAllCombobox: async (): Promise<ApiResponse<ModelCombobox[]>> => {
      return api.get<ModelCombobox[]>(API_ENDPOINTS.Catalog.FileType.GET_ALL_COMBOBOX);
  }
};
