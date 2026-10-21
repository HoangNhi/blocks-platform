import type { GetListPagingRequest, GetListPagingResponse } from "@/types/base/base.types";

export enum ExternalReviewStatus {
  New = 0,
  InProgress = 1,
  Completed = 2,
}

export enum FindingType {
  Improve = 0,
  Recommendation = 1,
}

export enum WatermarkPosition {
  Diagonal = 0,
  Center = 1,
  Repeat = 2,
}

export interface ExternalReview {
  Id: string;
  CycleId: string;
  CycleName?: string | null;
  Status: ExternalReviewStatus | number;
  WatermarkText?: string | null;
  WatermarkOpacity: number;
  WatermarkPosition: WatermarkPosition | number;
  DynamicWatermarkText?: string | null;
  IsCompleted: boolean;
  CompletedAt?: string | null;
  CompletedBy?: string | null;
  CreatedAt?: string | null;
  CreatedBy?: string | null;
  UpdatedAt?: string | null;
  UpdatedBy?: string | null;
  CurrentUserCouncilRoleId?: number | null;
  IsAdmin?: boolean;
}

export interface ExternalReviewAccount {
  Id: string;
  ExternalReviewId: string;
  UserId: string;
  Username?: string | null;
  Fullname?: string | null;
  Email?: string | null;
  Avatar?: string | null;
  IsActived?: boolean;
  CreatedAt?: string | null;
  CreatedBy?: string | null;
}

export interface ExternalReviewFinding {
  Id: string;
  ExternalReviewResultId: string;
  FindingType: FindingType | number;
  Content: string;
  CriterionId?: string | null;
  CriterionCode?: string | null;
  CriterionName?: string | null;
  CreatedAt?: string | null;
  CreatedBy?: string | null;
  UpdatedAt?: string | null;
  UpdatedBy?: string | null;
}

export interface ExternalReviewResult {
  Id: string;
  ExternalReviewId: string;
  StandardId: string;
  StandardCode?: string | null;
  StandardName?: string | null;
  Strengths?: string | null;
  CreatedAt?: string | null;
  CreatedBy?: string | null;
  UpdatedAt?: string | null;
  UpdatedBy?: string | null;
  Findings: ExternalReviewFinding[];
}

export interface ExternalReviewDetail extends ExternalReview {
  Accounts: ExternalReviewAccount[];
  Results: ExternalReviewResult[];
}

export interface ExternalReviewListItem {
  Id: string;
  CycleId: string;
  CycleName: string;
  Year: number;
  Status: ExternalReviewStatus | number;
  IsCompleted: boolean;
  AccountCount: number;
  ResultCount: number;
  CreatedAt?: string | null;
}

export interface ExternalReviewGetListRequest extends GetListPagingRequest {
  Status?: ExternalReviewStatus | number | null;
  CycleId?: string | null;
}

export interface CreateExternalReviewRequest {
  CycleId: string;
}

export interface GetExternalReviewRequest {
  CycleId: string;
}

export interface UpdateExternalReviewStatusRequest {
  ExternalReviewId: string;
  Status: ExternalReviewStatus | number;
}

export interface UpdateExternalReviewWatermarkRequest {
  ExternalReviewId: string;
  WatermarkText?: string | null;
  WatermarkOpacity: number;
  WatermarkPosition: WatermarkPosition | number;
}

export interface ConfirmExternalReviewCompletionRequest {
  ExternalReviewId: string;
}

export interface UpsertExternalReviewResultRequest {
  ExternalReviewId: string;
  StandardId: string;
  Strengths?: string | null;
}

export interface AddExternalReviewFindingRequest {
  ExternalReviewResultId: string;
  FindingType: FindingType | number;
  Content: string;
  CriterionId?: string | null;
}

export interface UpdateExternalReviewFindingRequest {
  FindingId: string;
  FindingType: FindingType | number;
  Content: string;
  CriterionId?: string | null;
}

export interface DeleteExternalReviewFindingRequest {
  FindingId: string;
}

export interface GetExternalReviewAccountsRequest {
  ExternalReviewId: string;
}

export interface ExternalReviewAccountGetListRequest
  extends GetListPagingRequest {
  ExternalReviewId: string;
}

export type ExternalReviewAccountGetListResponse =
  GetListPagingResponse<ExternalReviewAccount>;

export interface ExternalReviewAccountUpdateRequest {
  AccountId: string;
  Fullname: string;
  Username: string;
  Email: string;
  IsActived: boolean;
  Password?: string;
}

export interface AddExternalReviewAccountsRequest {
  ExternalReviewId: string;
  UserIds: string[];
}

export interface CreateAndLinkExternalReviewAccountRequest {
  ExternalReviewId: string;
  Fullname: string;
  Username: string;
  Email: string;
  Password: string;
}

export interface RemoveExternalReviewAccountRequest {
  AccountId: string;
}

export type ModelExternalReview = ExternalReview;
export type ModelExternalReviewResult = ExternalReviewResult;
export type ModelExternalReviewFinding = ExternalReviewFinding;
export type ModelExtAccount = ExternalReviewAccount;
export type ExternalReviewListResponse = GetListPagingResponse<ExternalReviewListItem>;
