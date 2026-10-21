import type { GetListPagingRequest } from "@/types/base/base.types";

export type SarStatus = 1 | 2 | 3 | 4;

export interface SarGetListPagingRequest extends GetListPagingRequest {
  Status?: SarStatus;
  CycleId?: string;
  ExcludeDraft?: boolean;
}

export interface SarGetListItem {
  SarReportId: string;
  CycleId: string;
  CycleName: string;
  Year: number;
  Status: SarStatus;
  ReviewRound?: number;
  SubmittedAt?: string | null;
  RevisionReason?: string | null;
  LastSavedAt?: string | null;
  UpdatedAt?: string | null;
  UpdatedBy?: string | null;
  EvaluationPurpose?: string | null;
}

export interface SarDraft {
  SarReportId: string;
  CycleId: string;
  Status: SarStatus;
  ReviewRound?: number;
  CurrentUserCouncilRoleId?: number | null;
  CanApproveByRole?: boolean;
  CanSubmitByRole?: boolean;
  CanEditByRole?: boolean;
  YDocSnapshotBase64?: string | null;
  RenderedHtml?: string | null;
  RevisionReason?: string | null;
  SubmittedAt?: string | null;
  SubmittedBy?: string | null;
  LastSavedAt?: string | null;
  CreatedAt: string;
  CreatedBy: string;
  UpdatedAt?: string | null;
  UpdatedBy?: string | null;
}

export interface GetSarByCycleRequest {
  CycleId: string;
}

export interface SaveSarDraftRequest {
  CycleId: string;
  YDocSnapshotBase64?: string | null;
  RenderedHtml?: string | null;
}

export interface SubmitSarRequest {
  CycleId: string;
}

export interface RequestSarRevisionRequest {
  CycleId: string;
  RevisionReason: string;
}

export interface ApproveSarRequest {
  CycleId: string;
}

export interface GetSarAutofillPayloadRequest {
  CycleId: string;
}

export interface SarAutofillPayloadDto {
  CycleId: string;
  Payload: string;
}

export interface ExportSarDocxRequest {
  CycleId: string;
}

export interface GetSarDraftMetadataRequest {
  CycleId: string;
}

export interface SarDraftMetadata {
  SarReportId: string;
  CycleId: string;
  Status: SarStatus;
  ReviewRound?: number;
  CanSubmitByRole?: boolean;
  CanEditByRole?: boolean;
  RevisionReason?: string | null;
  LastSavedAt?: string | null;
  UpdatedAt?: string | null;
  UpdatedBy?: string | null;
}
