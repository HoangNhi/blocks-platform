import api, { type ApiResponse } from "@/lib/api";
import { API_ENDPOINTS } from "@/config/constants";
import type { GetListPagingResponse } from "@/types/base/base.types";
import type {
  ActionPlanDeleteListRequest,
  ActionPlanDeleteResult,
  ActionPlanDetail,
  ActionPlanExternalFindingRequest,
  ActionPlanGetListRequest,
  ActionPlanListItem,
  ActionPlanUpsertRequest,
  ActionPlanUpdateTaskRequest,
  AssignableMember,
  ExternalFindingOption,
  ActionTask,
} from "../types/actionPlan.types";

export const actionPlanService = {
  getList: (request: ActionPlanGetListRequest): Promise<ApiResponse<GetListPagingResponse<ActionPlanListItem>>> =>
    api.post<GetListPagingResponse<ActionPlanListItem>>(API_ENDPOINTS.Business.ActionPlan.GET_LIST, request),

  getById: (id: string): Promise<ApiResponse<ActionPlanDetail>> =>
    api.get<ActionPlanDetail>(API_ENDPOINTS.Business.ActionPlan.GET_BY_ID, { params: { id } }),

  insert: (request: ActionPlanUpsertRequest): Promise<ApiResponse<ActionPlanDetail>> =>
    api.post<ActionPlanDetail>(API_ENDPOINTS.Business.ActionPlan.INSERT, request),

  update: (request: ActionPlanUpsertRequest): Promise<ApiResponse<ActionPlanDetail>> =>
    api.put<ActionPlanDetail>(API_ENDPOINTS.Business.ActionPlan.UPDATE, request),

  deleteList: (
    request: ActionPlanDeleteListRequest,
  ): Promise<ApiResponse<ActionPlanDeleteResult>> =>
    api.delete<ActionPlanDeleteResult>(API_ENDPOINTS.Business.ActionPlan.DELETE_LIST, {
      data: request,
    }),

  getExternalReviewFindings: (
    request: ActionPlanExternalFindingRequest,
  ): Promise<ApiResponse<ExternalFindingOption[]>> =>
    api.post<ExternalFindingOption[]>(
      API_ENDPOINTS.Business.ActionPlan.GET_EXTERNAL_REVIEW_FINDINGS,
      request,
    ),

  getAssignableMembers: (cycleId: string): Promise<ApiResponse<AssignableMember[]>> =>
    api.get<AssignableMember[]>(API_ENDPOINTS.Business.ActionPlan.GET_ASSIGNABLE_MEMBERS, {
      params: { cycleId },
    }),

  getAssignableUsersCombobox: (): Promise<ApiResponse<AssignableMember[]>> =>
    api.get<AssignableMember[]>(
      API_ENDPOINTS.Business.ActionPlan.GET_ASSIGNABLE_USERS_COMBOBOX,
    ),

  getMyCouncilRole: (cycleId: string): Promise<ApiResponse<number>> =>
    api.get<number>(API_ENDPOINTS.Business.ActionPlan.GET_MY_COUNCIL_ROLE, {
      params: { cycleId },
    }),

  updateTask: (
    request: ActionPlanUpdateTaskRequest,
  ): Promise<ApiResponse<ActionTask>> =>
    api.put<ActionTask>(API_ENDPOINTS.Business.ActionPlan.UPDATE_TASK, request),
};
