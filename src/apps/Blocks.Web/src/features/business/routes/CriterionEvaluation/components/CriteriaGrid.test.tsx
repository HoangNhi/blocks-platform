import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  CriterionEvaluationItem,
  FrameworkType,
  StandardEvaluationGroup,
} from "../../../types/criterionEvaluation.types";
import { CriteriaGrid } from "./CriteriaGrid";

function buildItem(
  partial: Partial<CriterionEvaluationItem>,
): CriterionEvaluationItem {
  return {
    Id: partial.Id ?? "criterion-1",
    CriterionId: partial.CriterionId ?? "criterion-base-1",
    CriterionCode: partial.CriterionCode ?? "1.1",
    CriterionName: partial.CriterionName ?? "Criterion Name",
    IsPrerequisite: partial.IsPrerequisite ?? false,
    Status: partial.Status ?? 0,
    OfficialScore: partial.OfficialScore ?? null,
    OfficialResult: partial.OfficialResult ?? null,
    EvidenceCount: partial.EvidenceCount ?? 0,
    MissingEvidenceCount: partial.MissingEvidenceCount ?? 0,
    SubmissionCount: partial.SubmissionCount ?? 0,
    TotalEvaluators: partial.TotalEvaluators ?? 0,
  };
}

function buildGroups(
  framework: FrameworkType,
  item: CriterionEvaluationItem,
  options?: {
    standardScore?: number | null;
    isPassed?: boolean;
  },
): StandardEvaluationGroup[] {
  return [
    {
      StandardId: "std-1",
      StandardCode: "Standard 1",
      StandardName: "Expected Learning Outcomes",
      IsPassed: options?.isPassed ?? (framework === "AUN" ? true : !!item.OfficialResult),
      StandardScore: options?.standardScore ?? (framework === "AUN" ? 4 : null),
      ApprovedCount: 1,
      TotalCount: 1,
      Items: [item],
    },
  ];
}

describe("CriteriaGrid result column", () => {
  it("always shows result as last column header", () => {
    const groups = buildGroups(
      "AUN",
      buildItem({ Status: 3, OfficialScore: 4, OfficialResult: null }),
    );

    render(<CriteriaGrid groups={groups} framework="AUN" onRowClick={vi.fn()} />);

    expect(screen.getByRole("columnheader", { name: /kết quả/i })).toBeInTheDocument();
    expect(screen.queryByText(/điểm/i)).not.toBeInTheDocument();
  });

  it("shows MOET final result as PASS when approved", () => {
    const groups = buildGroups(
      "MOET",
      buildItem({ Status: 3, OfficialScore: null, OfficialResult: true }),
    );

    render(<CriteriaGrid groups={groups} framework="MOET" onRowClick={vi.fn()} />);

    expect(screen.getByText("ĐẠT")).toBeInTheDocument();
  });

  it("shows AUN standard score in the standard header", () => {
    const groups = buildGroups(
      "AUN",
      buildItem({ Status: 0, OfficialScore: null, OfficialResult: null }),
      { standardScore: 5 },
    );

    render(<CriteriaGrid groups={groups} framework="AUN" onRowClick={vi.fn()} />);

    expect(screen.getByText("5/7")).toBeInTheDocument();
  });

  it("shows AUN score text when approved", () => {
    const groups = buildGroups(
      "AUN",
      buildItem({ Status: 3, OfficialScore: 6, OfficialResult: null }),
    );

    render(<CriteriaGrid groups={groups} framework="AUN" onRowClick={vi.fn()} />);

    expect(screen.getByText("6/7")).toBeInTheDocument();
  });
});
