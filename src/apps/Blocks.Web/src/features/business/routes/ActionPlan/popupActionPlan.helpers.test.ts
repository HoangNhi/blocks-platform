import { describe, expect, it } from "vitest";
import type { ModelCombobox } from "@/types/base/base.types";
import {
  getActionPlanStatusComboboxOptions,
  getFindingCriterionDisplay,
  getFindingStandardDisplay,
  resolveCriterionSelection,
} from "./popupActionPlan.helpers";

describe("getActionPlanStatusComboboxOptions", () => {
  it("returns four options with string Value for shared Combobox", () => {
    const options = getActionPlanStatusComboboxOptions();

    expect(options).toHaveLength(4);
    expect(options[0]).toEqual({ Value: "1", Text: "Nháp" });
  });
});

describe("finding display helpers", () => {
  it("renders standard code-name string when metadata is available", () => {
    expect(
      getFindingStandardDisplay({
        StandardCode: "STD-01",
        StandardName: "Tiêu chuẩn 01",
      } as any),
    ).toBe("STD-01 - Tiêu chuẩn 01");
  });

  it("falls back to 'Chưa gắn tiêu chí ở đánh giá ngoài' when criterion metadata is missing", () => {
    expect(getFindingCriterionDisplay({} as any)).toBe(
      "Chưa gắn tiêu chí ở đánh giá ngoài",
    );
  });
});

describe("resolveCriterionSelection", () => {
  it("returns criterion id when it exists in loaded options", () => {
    const options: ModelCombobox[] = [
      { Value: "cri-1", Text: "C1.1 - Tiêu chí 1.1" },
    ];

    expect(resolveCriterionSelection("cri-1", options)).toBe("cri-1");
  });

  it("returns empty string when criterion id does not exist in options", () => {
    const options: ModelCombobox[] = [
      { Value: "cri-2", Text: "C1.2 - Tiêu chí 1.2" },
    ];

    expect(resolveCriterionSelection("cri-1", options)).toBe("");
  });
});
