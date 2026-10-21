import { describe, expect, it } from "vitest";
import { canChangeExternalReviewStatus } from "./PopupExternalReview";

describe("canChangeExternalReviewStatus", () => {
  it("trả về true cho admin dù không có roleId", () => {
    expect(canChangeExternalReviewStatus({ IsAdmin: true, CurrentUserCouncilRoleId: null })).toBe(
      true,
    );
  });

  it("trả về true cho Chủ tịch Hội đồng", () => {
    expect(canChangeExternalReviewStatus({ IsAdmin: false, CurrentUserCouncilRoleId: 1 })).toBe(
      true,
    );
  });

  it("trả về true cho Phó Chủ tịch Hội đồng", () => {
    expect(canChangeExternalReviewStatus({ IsAdmin: false, CurrentUserCouncilRoleId: 2 })).toBe(
      true,
    );
  });

  it("trả về false cho Thư ký", () => {
    expect(canChangeExternalReviewStatus({ IsAdmin: false, CurrentUserCouncilRoleId: 3 })).toBe(
      false,
    );
  });

  it("trả về false cho Thành viên đánh giá", () => {
    expect(canChangeExternalReviewStatus({ IsAdmin: false, CurrentUserCouncilRoleId: 4 })).toBe(
      false,
    );
  });

  it("trả về false khi không phải admin và roleId là null", () => {
    expect(canChangeExternalReviewStatus({ IsAdmin: false, CurrentUserCouncilRoleId: null })).toBe(
      false,
    );
  });

  it("trả về false khi không phải admin và không có roleId", () => {
    expect(canChangeExternalReviewStatus({})).toBe(false);
  });
});
