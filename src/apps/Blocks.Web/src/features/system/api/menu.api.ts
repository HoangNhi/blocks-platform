import api, { type ApiResponse } from "@/lib/api";
import type { Menu, MenuGetListPaging } from "@/features/system/types/menu.types";
import type { GetListPagingRequest } from "@/types/base/base.types";
import { API_ENDPOINTS } from "@/config/constants";
import type { GetListPagingResponse } from "@/types/base/base.types";

export const menuService = {
  getList: async (
    request: GetListPagingRequest
  ): Promise<ApiResponse<GetListPagingResponse<MenuGetListPaging>>> => {
    return api.post<GetListPagingResponse<MenuGetListPaging>>(
      API_ENDPOINTS.System.Menu.GET_LIST,
      request
    );
  },

  getById: async (id: string): Promise<ApiResponse<Menu>> => {
    return api.get<Menu>(API_ENDPOINTS.System.Menu.GET_BY_ID, {
      params: { id },
    });
  },

  insert: async (data: Menu): Promise<ApiResponse<Menu>> => {
    return api.post<Menu>(API_ENDPOINTS.System.Menu.INSERT, data);
  },

  update: async (data: Menu): Promise<ApiResponse<Menu>> => {
    return api.put<Menu>(API_ENDPOINTS.System.Menu.UPDATE, data);
  },

  deleteList: async (ids: string[]): Promise<ApiResponse<Menu[]>> => {
    return api.delete<Menu[]>(API_ENDPOINTS.System.Menu.DELETE_LIST, {
      data: { ids },
    });
  },
  getListByUser: async (id: string): Promise<ApiResponse<MenuGetListPaging[]>> => {
    return api.get<MenuGetListPaging[]>(API_ENDPOINTS.System.Menu.GET_LIST_BY_USER, {
      params: { id },
    });
  },
};
