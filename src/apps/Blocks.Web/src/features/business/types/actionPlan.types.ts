import type { GetListPagingRequest, GetListPagingResponse } from "@/types/base/base.types";

export enum ActionPlanStatus {
  Draft = 1,
  InProgress = 2,
  PendingReview = 3,
  Completed = 4,
}

export enum ActionPriority {
  High = 1,
  Medium = 2,
  Low = 3,
}

export enum ActionTaskStatus {
  Todo = 1,
  InProgress = 2,
  Done = 3,
  HasError = 4,
}

export interface ActionPlanAssignee {
  Id: string;
  ActionPlanId: string;
  UserId: string;
  AssignedAt: string;
  AssignedBy: string;
  Fullname?: string | null;
  Username?: string | null;
}

export interface ActionTaskAttachment {
  Id: string;
  ActionTaskId: string;
  AttachmentId?: string | null;
  FileName: string;
  FileExtension?: string | null;
  FileSize?: number | null;
  FileUrl?: string | null;
  UploadedAt: string;
  UploadedBy: string;
}

export interface ActionTask {
  Id: string;
  ActionPlanId: string;
  Description: string;
  Note?: string | null;
  TaskStatus: ActionTaskStatus | number;
  DueDate?: string | null;
  CompletedAt?: string | null;
  CreatedBy: string;
  CreatedByFullname?: string | null;
  Attachments: ActionTaskAttachment[];
}

export interface ActionPlanAttachmentItem {
  Id: string;
  ReferenceType: number;
  RelatedId: string;
  FileName: string;
  FileExtension: string;
  FileSize?: number | null;
  FileUrl: string;
  FullFileName?: string | null;
}

export interface ActionPlanDetail {
  Id: string;
  IsEdit: boolean;
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
  AssignedAt?: string | null;
  AssignedBy?: string | null;
  Assignees: ActionPlanAssignee[];
  Attachments: ActionPlanAttachmentItem[];
  Tasks: ActionTask[];
}

export interface ActionPlanListItem {
  Id: string;
  CycleId: string;
  CycleName: string;
  Year: number;
  Title: string;
  Description?: string | null;
  StandardId?: string | null;
  CriterionId?: string | null;
  Priority: ActionPriority | number;
  Deadline: string;
  Status: ActionPlanStatus | number;
  AssigneeCount: number;
  TotalTaskCount: number;
  DoneTaskCount: number;
  StatusName?: string | null;
  PriorityName?: string | null;
}

export interface AssignableMember {
  UserId: string;
  Fullname: string;
  Username?: string | null;
}

export interface ExternalFindingOption {
  Id: string;
  ExternalReviewResultId: string;
  CriterionId?: string | null;
  StandardId?: string | null;
  Content: string;
  Summary?: string | null;
  StandardCode?: string | null;
  StandardName?: string | null;
  CriterionCode?: string | null;
  CriterionName?: string | null;
}

export interface ActionPlanGetListRequest extends GetListPagingRequest {
  CycleId?: string | null;
  StandardId?: string | null;
  CriterionId?: string | null;
  SourceFindingId?: string | null;
  Status?: ActionPlanStatus | number | null;
  Priority?: ActionPriority | number | null;
}

export interface ActionPlanUpsertRequest {
  Id: string;
  CycleId: string;
  Title: string;
  Description?: string | null;
  StandardId?: string | null;
  CriterionId?: string | null;
  Priority: ActionPriority | number;
  Deadline: string;
  SourceFindingId?: string | null;
  AssignedTo: string[];
  Status: ActionPlanStatus | number;
  AttachmentIds: string[];
  IsActived?: boolean;
  FolderUpload?: string | null;
}

export interface ActionPlanDeleteListRequest {
  Ids: string[];
}

export interface ActionPlanDeleteResult {
  DeletedCount: number;
  SkippedCount: number;
}

export interface ActionPlanExternalFindingRequest {
  CycleId?: string | null;
  TextSearch?: string | null;
  CurrentActionPlanId?: string | null;
}

export interface ActionPlanUpdateTaskRequest {
  Id: string;
  ActionPlanId: string;
  Description: string;
  Note?: string | null;
  TaskStatus: number;
  DueDate?: string | null;
  FolderUpload?: string | null;
  DeletedAttachmentIds: string[];
}

export type ActionPlanListResponse = GetListPagingResponse<ActionPlanListItem>;
