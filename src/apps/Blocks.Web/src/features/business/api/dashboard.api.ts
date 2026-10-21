import api, { type ApiResponse } from "@/lib/api";
import { API_ENDPOINTS } from "@/config/constants";
import type { DashboardOverview } from "@/features/business/types/dashboard.types";

export const dashboardService = {
  getCyclesSummary: async (): Promise<ApiResponse<DashboardOverview>> => {
    return api.get<DashboardOverview>(API_ENDPOINTS.Business.Dashboard.GET_CYCLES_SUMMARY);
  },
};
