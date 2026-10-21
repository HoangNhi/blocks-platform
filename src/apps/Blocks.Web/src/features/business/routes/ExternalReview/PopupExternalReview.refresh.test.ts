import { describe, expect, it } from "vitest";
import { shouldTriggerParentRefresh } from "./PopupExternalReview";

describe("shouldTriggerParentRefresh", () => {
  it("returns true only when popup closes", () => {
    expect(shouldTriggerParentRefresh(false)).toBe(true);
    expect(shouldTriggerParentRefresh(true)).toBe(false);
  });
});
