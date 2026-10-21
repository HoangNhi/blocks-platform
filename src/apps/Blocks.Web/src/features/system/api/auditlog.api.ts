import api, { type ApiResponse } from "@/lib/api";
import type {
    AuditLog,
    AuditLogGetListRequest,
} from "@/types/auditlog.types";
import type { GetListPagingResponse } from "@/types/base/base.types";
import { API_ENDPOINTS } from "@/config/constants";

export const auditLogService = {
    getList: async (
        request: AuditLogGetListRequest,
    ): Promise<ApiResponse<GetListPagingResponse<AuditLog>>> => {
        return api.post<GetListPagingResponse<AuditLog>>(
            API_ENDPOINTS.System.AuditLog.GET_LIST,
            request,
        );
    },

    getById: async (id: string): Promise<ApiResponse<AuditLog>> => {
        return api.get<AuditLog>(API_ENDPOINTS.System.AuditLog.GET_BY_ID, {
            params: { id },
        });
    },

    getEntityNames: async (): Promise<ApiResponse<string[]>> => {
        return api.get<string[]>(API_ENDPOINTS.System.AuditLog.GET_ENTITY_NAMES);
    },

    getActions: async (): Promise<ApiResponse<string[]>> => {
        return api.get<string[]>(API_ENDPOINTS.System.AuditLog.GET_ACTIONS);
    },
};
