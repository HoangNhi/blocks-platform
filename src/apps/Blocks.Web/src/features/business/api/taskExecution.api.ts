import api, { type ApiResponse } from "@/lib/api";
import { API_ENDPOINTS } from "@/config/constants";
import type {
  TaskExecutionDeleteTaskRequest,
  TaskExecutionGetPlansRequest,
  TaskExecutionGetTaskListRequest,
  TaskExecutionPlanDetail,
  TaskExecutionPlanListResponse,
  TaskExecutionTask,
  TaskExecutionTaskListResponse,
  TaskExecutionUpsertTaskRequest,
} from "../types/taskExecution.types";

export const taskExecutionService = {
  getMyPlans: (
    request: TaskExecutionGetPlansRequest,
  ): Promise<ApiResponse<TaskExecutionPlanListResponse>> =>
    api.get<TaskExecutionPlanListResponse>(API_ENDPOINTS.Business.TaskExecution.GET_MY_PLANS, {
      params: {
        pageIndex: request.PageIndex,
        pageSize: request.PageSize,
        textSearch: request.TextSearch,
        cycleId: request.CycleId,
        status: request.Status,
      },
    }),

  getPlanDetail: (id: string): Promise<ApiResponse<TaskExecutionPlanDetail>> =>
    api.get<TaskExecutionPlanDetail>(API_ENDPOINTS.Business.TaskExecution.GET_PLAN_DETAIL, {
      params: { id },
    }),

  getTaskDetail: (id: string): Promise<ApiResponse<TaskExecutionTask>> =>
    api.get<TaskExecutionTask>(API_ENDPOINTS.Business.TaskExecution.GET_TASK_DETAIL, {
      params: { id },
    }),

  getTaskList: (
    request: TaskExecutionGetTaskListRequest,
  ): Promise<ApiResponse<TaskExecutionTaskListResponse>> =>
    api.post<TaskExecutionTaskListResponse>(
      API_ENDPOINTS.Business.TaskExecution.GET_TASK_LIST,
      request,
    ),

  insertTask: (
    request: TaskExecutionUpsertTaskRequest,
  ): Promise<ApiResponse<TaskExecutionTask>> =>
    api.post<TaskExecutionTask>(
      API_ENDPOINTS.Business.TaskExecution.INSERT_TASK,
      request,
    ),

  updateTask: (
    request: TaskExecutionUpsertTaskRequest,
  ): Promise<ApiResponse<TaskExecutionTask>> =>
    api.put<TaskExecutionTask>(
      API_ENDPOINTS.Business.TaskExecution.UPDATE_TASK,
      request,
    ),

  deleteTask: (
    request: TaskExecutionDeleteTaskRequest,
  ): Promise<ApiResponse<null>> =>
    api.delete<null>(API_ENDPOINTS.Business.TaskExecution.DELETE_TASK, {
      data: request,
    }),
};
