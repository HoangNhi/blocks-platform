export interface ActionPlanFormState {
  Id: string;
  CycleId: string;
  Title: string;
  Description: string;
  StandardId: string;
  CriterionId: string;
  Priority: string;
  Deadline: string;
  SourceFindingId: string;
  Status: number;
}

export type ActionPlanPopupTab = "general" | "tasks";
