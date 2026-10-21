import type {
  EvaluationStatus,
  FrameworkType,
} from "../../../types/criterionEvaluation.types";

export type ApprovalPanelMode =
  | "approved-readonly"
  | "approver-edit"
  | "pending-readonly";

interface GetOfficialResultDisplayInput {
  framework: FrameworkType;
  status: EvaluationStatus;
  officialScore: number | null;
  officialResult: boolean | null;
}

export function getApprovalPanelMode(input: {
  isApproved: boolean;
  canApprove: boolean;
}): ApprovalPanelMode {
  if (input.isApproved) return "approved-readonly";
  return input.canApprove ? "approver-edit" : "pending-readonly";
}

export function getOfficialResultDisplay(
  input: GetOfficialResultDisplayInput,
): { text: string } {
  if (input.status !== 3) return { text: "—" };

  if (input.framework === "AUN" && input.officialScore != null) {
    return { text: `${input.officialScore}/7` };
  }

  if (input.framework === "MOET" && input.officialResult === true) {
    return { text: "ĐẠT" };
  }

  if (input.framework === "MOET" && input.officialResult === false) {
    return { text: "KHÔNG ĐẠT" };
  }

  return { text: "Đã duyệt (chưa có kết quả)" };
}
