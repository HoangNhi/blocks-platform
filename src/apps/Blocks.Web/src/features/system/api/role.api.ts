import api, { type ApiResponse } from "@/lib/api";
import type { GetPermissionByUser, Permission, PermissionRequest, Role } from "@/features/system/types/role.types";
import type { GetListPagingRequest, ModelCombobox } from "@/types/base/base.types";
import { API_ENDPOINTS } from "@/config/constants";
import type { GetListPagingResponse } from "@/types/base/base.types";

export const roleService = {
  getList: async (
    request: GetListPagingRequest
  ): Promise<ApiResponse<GetListPagingResponse<Role>>> => {
    return api.post<GetListPagingResponse<Role>>(
      API_ENDPOINTS.System.Role.GET_LIST,
      request
    );
  },

  getById: async (id: string): Promise<ApiResponse<Role>> => {
    return api.get<Role>(API_ENDPOINTS.System.Role.GET_BY_ID, {
      params: { id },
    });
  },

  insert: async (data: Role): Promise<ApiResponse<Role>> => {
    return api.post<Role>(API_ENDPOINTS.System.Role.INSERT, data);
  },

  update: async (data: Role): Promise<ApiResponse<Role>> => {
    return api.put<Role>(API_ENDPOINTS.System.Role.UPDATE, data);
  },

  deleteList: async (ids: string[]): Promise<ApiResponse<Role[]>> => {
    return api.delete<Role[]>(API_ENDPOINTS.System.Role.DELETE_LIST, {
      data: { ids },
    });
  },

  getAllCombobox: async (): Promise<ApiResponse<ModelCombobox[]>> => {
      return api.get<ModelCombobox[]>(API_ENDPOINTS.System.Role.GET_ALL_COMBOBOX);
    },

  getPermissionsByRole: async (id: string): Promise<ApiResponse<Permission[]>> => {
    return api.get<Permission[]>(API_ENDPOINTS.System.Role.GET_PERMISSIONS_BY_ROLE, {
      params: { id },
    });
  },
  
  updatePermission: async (data: PermissionRequest[]): Promise<ApiResponse<boolean>> => {
      return api.put<boolean>(API_ENDPOINTS.System.Role.UPDATE_PERMISSIONS, {
        permissions: data
      });
  },

  getPermissionsByUser: async (id: string): Promise<ApiResponse<GetPermissionByUser[]>> => {
    return api.get<GetPermissionByUser[]>(API_ENDPOINTS.System.Role.GET_PERMISSIONS_BY_USER, {
      params: { id },
    });
  },
};
