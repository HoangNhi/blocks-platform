import { describe, expect, it } from "vitest";
import { isRevisionReasonValid } from "./DecisionToolbar";

describe("isRevisionReasonValid", () => {
  it("accepts a single non-whitespace character", () => {
    expect(isRevisionReasonValid("x")).toBe(true);
  });

  it("accepts a short reason", () => {
    expect(isRevisionReasonValid("Cần sửa")).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(isRevisionReasonValid("")).toBe(false);
  });
});
