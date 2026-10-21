import type { ModelCombobox } from "@/types/base/base.types";
import type { ExternalFindingOption } from "@/features/business/types/actionPlan.types";
import {
  ACTION_PLAN_STATUS_OPTIONS,
  getActionPlanStatusLabel,
} from "./actionPlan.utils";

export function getActionPlanStatusComboboxOptions(): ModelCombobox[] {
  return ACTION_PLAN_STATUS_OPTIONS.map((status) => ({
    Value: String(status.value),
    Text: getActionPlanStatusLabel(status.value),
  }));
}

export function getFindingStandardDisplay(
  finding: Partial<ExternalFindingOption>,
): string {
  if (finding.StandardCode && finding.StandardName) {
    return `${finding.StandardCode} - ${finding.StandardName}`;
  }

  return finding.StandardCode || finding.StandardName || "Không có tiêu chuẩn";
}

export function getFindingCriterionDisplay(
  finding: Partial<ExternalFindingOption>,
): string {
  if (finding.CriterionCode && finding.CriterionName) {
    return `${finding.CriterionCode} - ${finding.CriterionName}`;
  }

  return (
    finding.CriterionCode ||
    finding.CriterionName ||
    "Chưa gắn tiêu chí ở đánh giá ngoài"
  );
}

export function resolveCriterionSelection(
  pendingCriterionId: string | null,
  criteriaOptions: ModelCombobox[],
): string {
  if (!pendingCriterionId) {
    return "";
  }

  return criteriaOptions.some((option) => option.Value === pendingCriterionId)
    ? pendingCriterionId
    : "";
}
