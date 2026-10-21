import type { SarStatus } from "./sar.types";

export interface InternalReviewListItem {
  SarReportId: string;
  CycleId: string;
  CycleName: string;
  Year: number;
  Status: SarStatus;
  ReviewRound: number;
  SubmittedAt?: string | null;
  CommentCount: number;
  RenderedHtml?: string | null;
  YDocSnapshotBase64?: string | null;
  RevisionReason?: string | null;
  EvaluationPurpose?: string | null;
  CurrentUserCouncilRoleId?: number | null;
  CanApproveByRole?: boolean | null;
}

export interface InternalComment {
  Id: string;
  SarReportId: string;
  CommentText: string;
  HighlightedText?: string | null;
  CommentMarkId?: string | null;
  ReviewRound: number;
  CreatedAt: string;
  CreatedBy: string;
  CreatedByName?: string | null;
  CreatedByAvatar?: string | null;
  UpdatedAt?: string | null;
  UpdatedBy?: string | null;
}

export interface GetInternalCommentsRequest {
  CycleId: string;
  ReviewRound?: number;
}

export interface AddInternalCommentRequest {
  CycleId: string;
  CommentText: string;
  HighlightedText?: string | null;
  CommentMarkId?: string | null;
}
