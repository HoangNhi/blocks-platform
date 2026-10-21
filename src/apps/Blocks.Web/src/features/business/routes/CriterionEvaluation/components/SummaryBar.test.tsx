import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CriterionEvaluationSummary } from "../../../types/criterionEvaluation.types";
import { SummaryBar } from "./SummaryBar";

function buildSummary(
  partial: Partial<CriterionEvaluationSummary> = {},
): CriterionEvaluationSummary {
  return {
    TotalCriteria: partial.TotalCriteria ?? 10,
    ApprovedCriteria: partial.ApprovedCriteria ?? 4,
    PrerequisiteTotal: partial.PrerequisiteTotal ?? 2,
    PrerequisitePassed: partial.PrerequisitePassed ?? 2,
    FailedStandards: partial.FailedStandards ?? 1,
    FailedCriteria: partial.FailedCriteria ?? 2,
    MoetProgramVerdict: partial.MoetProgramVerdict ?? null,
    PreviousCycleId: partial.PreviousCycleId ?? null,
    PreviousCycleName: partial.PreviousCycleName ?? null,
    PreviousApprovedCriteria: partial.PreviousApprovedCriteria ?? null,
    PreviousFailedCriteria: partial.PreviousFailedCriteria ?? null,
    PreviousFailedStandards: partial.PreviousFailedStandards ?? null,
    PreviousMoetProgramVerdict: partial.PreviousMoetProgramVerdict ?? null,
    ImprovedCriteria: partial.ImprovedCriteria ?? null,
    RegressedCriteria: partial.RegressedCriteria ?? null,
    AunProgramVerdict: partial.AunProgramVerdict ?? null,
  };
}

describe("SummaryBar", () => {
  it("shows the AUN verdict badge when framework is AUN", () => {
    render(
      <SummaryBar
        framework="AUN"
        summary={buildSummary({ AunProgramVerdict: 5 })}
      />,
    );

    expect(screen.getByText("5/7")).toBeInTheDocument();
  });

  it("keeps the MOET verdict badge behavior unchanged", () => {
    render(
      <SummaryBar
        framework="MOET"
        summary={buildSummary({ MoetProgramVerdict: "\u0110\u1ea1t" })}
      />,
    );

    expect(screen.getByText("\u0110\u1ea1t")).toBeInTheDocument();
  });
});
