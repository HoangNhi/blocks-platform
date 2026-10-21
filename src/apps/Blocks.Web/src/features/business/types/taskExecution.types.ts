import type { GetListPagingRequest, GetListPagingResponse } from "@/types/base/base.types";
import type {
  ActionPlanAssignee,
  ActionPlanAttachmentItem,
  ActionPlanStatus,
  ActionPriority,
  ActionTask,
  ActionTaskAttachment,
} from "./actionPlan.types";

export interface TaskExecutionPlanListItem {
  Id: string;
  CycleId: string;
  CycleName: string;
  Year: number;
  Title: string;
  StandardId?: string | null;
  CriterionId?: string | null;
  Priority: ActionPriority | number;
  Deadline: string;
  Status: ActionPlanStatus | number;
  AssignedToNames?: string | null;
  StatusName?: string | null;
  TotalTaskCount: number;
  DoneTaskCount: number;
}

export interface TaskExecutionPlanDetail {
  Id: string;
  CycleId: string;
  Title: string;
  Description?: string | null;
  StandardId?: string | null;
  CriterionId?: string | null;
  Priority: ActionPriority | number;
  Deadline: string;
  Status: ActionPlanStatus | number;
  SourceFindingId?: string | null;
  CompletedAt?: string | null;
  CompletedBy?: string | null;
  Assignees: ActionPlanAssignee[];
  Attachments: ActionPlanAttachmentItem[];
}

export interface TaskExecutionGetPlansRequest extends GetListPagingRequest {
  CycleId?: string | null;
  Status?: number | null;
}

export interface TaskExecutionGetTaskListRequest {
  ActionPlanId: string;
  PageIndex: number;
  PageSize: number;
  TextSearch?: string | null;
}

export interface TaskExecutionTaskListResponse {
  PageIndex: number;
  PageSize: number;
  TotalRow: number;
  DoneCount: number;
  Data: TaskExecutionTask[];
}

export interface TaskExecutionUpsertTaskRequest {
  Id: string;
  ActionPlanId: string;
  Description: string;
  Note?: string | null;
  TaskStatus: number;
  DueDate?: string | null;
  FolderUpload?: string | null;
  DeletedAttachmentIds: string[];
}

export interface TaskExecutionDeleteTaskRequest {
  TaskId: string;
}

export type TaskExecutionAttachment = ActionTaskAttachment;

export type TaskExecutionTask = ActionTask;

export type TaskExecutionPlanListResponse = GetListPagingResponse<TaskExecutionPlanListItem>;
