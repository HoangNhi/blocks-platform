export type EvaluationStatus = 0 | 2 | 3;

export const EVALUATION_STATUS = {
  EMPTY: 0,
  WAITING: 2,
  APPROVED: 3,
} as const;

export const EVALUATION_STATUS_CONFIG: Record<
  EvaluationStatus,
  { label: string; color: string }
> = {
  0: { label: "Trống", color: "bg-gray-100 text-gray-500" },
  2: { label: "Chờ duyệt", color: "bg-orange-100 text-orange-700" },
  3: { label: "Đã duyệt", color: "bg-green-100 text-green-700" },
};

export const AUN_SCORE_CONFIG: Record<
  number,
  { label: string; bgClass: string; textClass: string }
> = {
  1: {
    label: "Không đáp ứng",
    bgClass: "bg-red-100",
    textClass: "text-red-700",
  },
  2: {
    label: "Cần cải tiến nhiều",
    bgClass: "bg-red-100",
    textClass: "text-red-700",
  },
  3: {
    label: "Cần cải tiến nhỏ",
    bgClass: "bg-orange-100",
    textClass: "text-orange-700",
  },
  4: { label: "Đáp ứng", bgClass: "bg-slate-100", textClass: "text-slate-600" },
  5: {
    label: "Tốt hơn mong đợi",
    bgClass: "bg-emerald-100",
    textClass: "text-emerald-700",
  },
  6: {
    label: "Hình mẫu chất lượng",
    bgClass: "bg-emerald-100",
    textClass: "text-emerald-700",
  },
  7: {
    label: "Xuất sắc",
    bgClass: "bg-emerald-200",
    textClass: "text-emerald-800",
  },
};

export type FrameworkType = "AUN" | "MOET";

export interface CriterionEvaluationSummary {
  TotalCriteria: number;
  ApprovedCriteria: number;
  PrerequisiteTotal: number;
  PrerequisitePassed: number;
  FailedStandards: number;
  FailedCriteria: number;
  AunProgramVerdict?: number | null;
  MoetProgramVerdict?: string | null;

  // Comparison with previous cycle (null = no previous cycle)
  PreviousCycleId?: string | null;
  PreviousCycleName?: string | null;
  PreviousApprovedCriteria?: number | null;
  PreviousFailedCriteria?: number | null;
  PreviousFailedStandards?: number | null;
  PreviousMoetProgramVerdict?: string | null;
  ImprovedCriteria?: number | null;
  RegressedCriteria?: number | null;
}

export interface CriterionEvaluationItem {
  Id: string;
  CriterionId: string;
  CriterionCode: string;
  CriterionName: string;
  IsPrerequisite: boolean;
  Status: EvaluationStatus;
  OfficialScore: number | null;
  OfficialResult: boolean | null;
  EvidenceCount: number;
  MissingEvidenceCount: number;
  SubmissionCount: number;
  TotalEvaluators: number;
}

export interface StandardEvaluationGroup {
  StandardId: string;
  StandardCode: string;
  StandardName: string;
  IsPassed: boolean;
  StandardScore: number | null;
  ApprovedCount: number;
  TotalCount: number;
  Items: CriterionEvaluationItem[];
}

export interface EvaluationSubmission {
  Id: string;
  EvaluatorId: string;
  EvaluatorName: string;
  EvaluatorAvatar?: string;
  CurrentState: string | null;
  Strengths: string | null;
  Weaknesses: string | null;
  ActionPlan: string | null;
  ProposedScore: number | null;
  ProposedResult: boolean | null;
  CreatedAt: string;
  UpdatedAt: string | null;
}

export interface EvaluationSubmissionRequest {
  Id?: string;
  CriterionEvaluationId: string;
  CurrentState?: string;
  Strengths?: string;
  Weaknesses?: string;
  ActionPlan?: string;
  ProposedScore?: number | null;
  ProposedResult?: boolean | null;
}

export interface ApproveEvaluationRequest {
  CriterionEvaluationId: string;
  OfficialScore?: number | null;
  OfficialResult?: boolean | null;
  OfficialCurrentState?: string;
  OfficialStrengths?: string;
  OfficialWeaknesses?: string;
  OfficialActionPlan?: string;
}

export interface OfficialDescriptiveFields {
  CurrentState?: string | null;
  Strengths?: string | null;
  Weaknesses?: string | null;
  ActionPlan?: string | null;
}

export interface CriterionEvaluationGetListRequest {
  CycleId: string;
  StandardSetId: string;
  TextSearch?: string;
  Status?: EvaluationStatus;
}

export interface GetCriterionEvaluationSummaryRequest {
  CycleId: string;
  StandardSetId: string;
}

export interface InitializeCycleEvaluationRequest {
  CycleId: string;
  StandardSetId: string;
}

export interface CriterionEvidence {
  Id: string;
  Code: string;
  Name: string;
  EvidenceCycleMapId: string;
}

export interface SurveyCampaignItem {
  Id: string;
  Name: string;
  Status: number;
  CreatedAt: string;
  Cycle?: string;
  Stakeholder?: string;
}

export interface CriterionPopupData {
  Submissions: EvaluationSubmission[];
  MySubmission: EvaluationSubmissionRequest | null;
  Evidences: CriterionEvidence[];
  SurveyCampaigns: SurveyCampaignItem[];
  EvaluationMode: number; // 1: AUN, 2: MOET
  OfficialFields?: OfficialDescriptiveFields | null;
  IsRevisionAllowed: boolean;
}

export interface GetPopupDataRequest {
  CriterionEvaluationId: string;
  CycleId: string;
}
