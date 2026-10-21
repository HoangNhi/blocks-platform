import { describe, expect, it } from "vitest";
import { canEvaluatorSubmit } from "./permissions";

describe("canEvaluatorSubmit", () => {
  it("rejects non-evaluator roles", () => {
    expect(canEvaluatorSubmit(1, ["std-1"], "std-1")).toBe(false);
  });

  it("rejects evaluators without an assigned standard match", () => {
    expect(canEvaluatorSubmit(4, ["std-2"], "std-1")).toBe(false);
  });

  it("rejects evaluators when no assigned standards are present", () => {
    expect(canEvaluatorSubmit(4, [], "std-1")).toBe(false);
  });

  it("allows evaluators only when the active standard is assigned", () => {
    expect(canEvaluatorSubmit(4, ["std-1", "std-2"], "std-1")).toBe(true);
  });
});
