import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { ActionPlanStatus } from "@/features/business/types/actionPlan.types";
import {
  getPopupSaveStatus,
  getPopupPanelInitialOpenState,
  isAssigneeSectionVisible,
  isActionPlanTasksTabEnabled,
  shouldShowActionPlanSidePanel,
} from "./PopupActionPlan";

vi.mock("@/components/ui/upload-file", () => ({
  default: () => null,
}));

describe("isAssigneeSectionVisible", () => {
  it("returns false for create mode", () => {
    expect(isAssigneeSectionVisible(true)).toBe(false);
  });

  it("returns true for update mode", () => {
    expect(isAssigneeSectionVisible(false)).toBe(true);
  });
});

describe("getPopupSaveStatus", () => {
  it("forces Draft for create mode", () => {
    expect(getPopupSaveStatus(ActionPlanStatus.InProgress, true)).toBe(
      ActionPlanStatus.Draft,
    );
  });

  it("keeps selected status for update mode", () => {
    expect(getPopupSaveStatus(ActionPlanStatus.PendingReview, false)).toBe(
      ActionPlanStatus.PendingReview,
    );
  });
});

describe("getPopupPanelInitialOpenState", () => {
  it("opens the panel for new items", () => {
    expect(getPopupPanelInitialOpenState(undefined)).toBe(true);
    expect(getPopupPanelInitialOpenState({ IsEdit: false })).toBe(true);
  });

  it("closes the panel for edit items", () => {
    expect(getPopupPanelInitialOpenState({ IsEdit: true })).toBe(false);
  });
});

describe("isActionPlanTasksTabEnabled", () => {
  it("disables tasks tab while creating a new plan", () => {
    expect(isActionPlanTasksTabEnabled(true)).toBe(false);
  });

  it("enables tasks tab for existing plans", () => {
    expect(isActionPlanTasksTabEnabled(false)).toBe(true);
  });
});

describe("shouldShowActionPlanSidePanel", () => {
  it("shows the side panel only on the general tab when open", () => {
    expect(shouldShowActionPlanSidePanel("general", true)).toBe(true);
    expect(shouldShowActionPlanSidePanel("tasks", true)).toBe(false);
  });
});
