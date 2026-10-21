import { describe, expect, it } from "vitest";
import type { SurveyCampaignGetListPaging } from "../types/survey-campaign.types";
import { getCompletedCampaignsForCycle } from "./criterionEvaluationSurvey";

function buildCampaign(
  partial: Partial<SurveyCampaignGetListPaging>,
): SurveyCampaignGetListPaging {
  return {
    Id: partial.Id ?? "id-1",
    CycleId: partial.CycleId ?? "cycle-a",
    TemplateId: partial.TemplateId ?? "template-1",
    StakeholderType: partial.StakeholderType ?? 1,
    Name: partial.Name ?? "Campaign",
    Status: partial.Status ?? 1,
    ListSession: partial.ListSession ?? [],
    ListScore: partial.ListScore ?? [],
    ListTextAnswer: partial.ListTextAnswer ?? [],
    ListTopic: partial.ListTopic ?? [],
    Cycle: partial.Cycle ?? "Cycle A",
    Stakeholder: partial.Stakeholder ?? "Student",
    IsActived: partial.IsActived ?? true,
    IsEdit: partial.IsEdit ?? false,
    FolderUpload: partial.FolderUpload ?? "",
  };
}

describe("criterionEvaluationSurvey utils", () => {
  it("returns only completed campaigns in selected cycle", () => {
    const campaigns: SurveyCampaignGetListPaging[] = [
      buildCampaign({ Id: "c1", CycleId: "cycle-a", Status: 3 }),
      buildCampaign({ Id: "c2", CycleId: "cycle-a", Status: 2 }),
      buildCampaign({ Id: "c3", CycleId: "cycle-b", Status: 3 }),
      buildCampaign({ Id: "c4", CycleId: "cycle-a", Status: 3 }),
    ];

    const result = getCompletedCampaignsForCycle(campaigns, "cycle-a");

    expect(result.map((x) => x.Id)).toEqual(["c1", "c4"]);
  });

  it("returns empty list when cycle is not selected", () => {
    const campaigns: SurveyCampaignGetListPaging[] = [
      buildCampaign({ Id: "c1", CycleId: "cycle-a", Status: 3 }),
    ];

    const result = getCompletedCampaignsForCycle(campaigns, "");

    expect(result).toEqual([]);
  });
});

