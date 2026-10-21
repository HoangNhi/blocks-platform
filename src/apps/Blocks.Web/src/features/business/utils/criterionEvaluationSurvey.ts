import type { SurveyCampaignGetListPaging } from "../types/survey-campaign.types";

const COMPLETED_CAMPAIGN_STATUS = 3;

export function getCompletedCampaignsForCycle(
  campaigns: SurveyCampaignGetListPaging[],
  cycleId: string,
): SurveyCampaignGetListPaging[] {
  if (!cycleId) return [];

  return campaigns.filter(
    (campaign) =>
      campaign.CycleId.toLowerCase() === cycleId.toLowerCase() &&
      campaign.Status === COMPLETED_CAMPAIGN_STATUS,
  );
}

