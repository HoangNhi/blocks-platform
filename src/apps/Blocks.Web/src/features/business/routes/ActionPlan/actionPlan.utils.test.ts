import { describe, expect, it } from "vitest";
import { ActionPlanStatus } from "@/features/business/types/actionPlan.types";
import {
  canDeleteActionPlan,
  canEditActionPlan,
  normalizeActionPlanStatusForSave,
  shouldShowAssigneeSection,
} from "./actionPlan.utils";

describe("normalizeActionPlanStatusForSave", () => {
  it("forces Draft when creating a new action plan", () => {
    expect(
      normalizeActionPlanStatusForSave(ActionPlanStatus.InProgress, true),
    ).toBe(ActionPlanStatus.Draft);
  });

  it("keeps selected status when editing", () => {
    expect(
      normalizeActionPlanStatusForSave(ActionPlanStatus.PendingReview, false),
    ).toBe(ActionPlanStatus.PendingReview);
  });
});

describe("shouldShowAssigneeSection", () => {
  it("hides assignee section in create mode", () => {
    expect(shouldShowAssigneeSection(true)).toBe(false);
  });

  it("shows assignee section in update mode", () => {
    expect(shouldShowAssigneeSection(false)).toBe(true);
  });
});

describe("canDeleteActionPlan", () => {
  it("allows delete only for Draft", () => {
    expect(canDeleteActionPlan(ActionPlanStatus.Draft)).toBe(true);
    expect(canDeleteActionPlan(ActionPlanStatus.InProgress)).toBe(false);
    expect(canDeleteActionPlan(ActionPlanStatus.PendingReview)).toBe(false);
    expect(canDeleteActionPlan(ActionPlanStatus.Completed)).toBe(false);
  });
});

describe("canEditActionPlan", () => {
  it("allows editing for Draft", () => {
    expect(canEditActionPlan(ActionPlanStatus.Draft)).toBe(true);
  });

  it("allows editing for InProgress", () => {
    expect(canEditActionPlan(ActionPlanStatus.InProgress)).toBe(true);
  });

  it("allows editing for PendingReview", () => {
    expect(canEditActionPlan(ActionPlanStatus.PendingReview)).toBe(true);
  });

  it("allows editing for Completed", () => {
    expect(canEditActionPlan(ActionPlanStatus.Completed)).toBe(true);
  });
});
