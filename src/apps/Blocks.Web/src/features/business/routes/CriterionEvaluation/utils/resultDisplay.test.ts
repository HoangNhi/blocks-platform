import { describe, expect, it } from "vitest";
import {
  getApprovalPanelMode,
  getOfficialResultDisplay,
} from "./resultDisplay";

describe("getOfficialResultDisplay", () => {
  it("returns AUN score when approved and score exists", () => {
    const view = getOfficialResultDisplay({
      framework: "AUN",
      status: 3,
      officialScore: 4,
      officialResult: null,
    });
    expect(view.text).toBe("4/7");
  });

  it("returns MOET pass/fail text when approved", () => {
    expect(
      getOfficialResultDisplay({
        framework: "MOET",
        status: 3,
        officialScore: null,
        officialResult: true,
      }).text,
    ).toBe("ĐẠT");
    expect(
      getOfficialResultDisplay({
        framework: "MOET",
        status: 3,
        officialScore: null,
        officialResult: false,
      }).text,
    ).toBe("KHÔNG ĐẠT");
  });

  it("returns approved fallback when approved but missing data", () => {
    const view = getOfficialResultDisplay({
      framework: "MOET",
      status: 3,
      officialScore: null,
      officialResult: null,
    });
    expect(view.text).toBe("Đã duyệt (chưa có kết quả)");
  });
});

describe("getApprovalPanelMode", () => {
  it("returns approved-readonly for approved item", () => {
    expect(getApprovalPanelMode({ isApproved: true, canApprove: false })).toBe(
      "approved-readonly",
    );
  });

  it("returns approver-edit for approver with pending item", () => {
    expect(getApprovalPanelMode({ isApproved: false, canApprove: true })).toBe(
      "approver-edit",
    );
  });

  it("returns pending-readonly for non-approver with pending item", () => {
    expect(getApprovalPanelMode({ isApproved: false, canApprove: false })).toBe(
      "pending-readonly",
    );
  });
});
