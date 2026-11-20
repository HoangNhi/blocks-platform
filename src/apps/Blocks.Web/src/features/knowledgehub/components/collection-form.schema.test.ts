import { describe, expect, it } from "vitest";
import {
  collectionFormSchema,
  toCollectionInput,
} from "./collection-form.schema";

describe("collection form normalization", () => {
  it("trims values and converts blank description to null", () => {
    const v = collectionFormSchema.parse({
      Name: "  Kiến thức  ",
      Description: "   ",
    });
    expect(toCollectionInput(v)).toEqual({
      Name: "Kiến thức",
      Description: null,
    });
  });

  it("counts supplementary Unicode as one code point", () => {
    expect(
      collectionFormSchema.safeParse({
        Name: "😀".repeat(200),
        Description: "",
      }).success,
    ).toBe(true);
    expect(
      collectionFormSchema.safeParse({
        Name: "😀".repeat(201),
        Description: "",
      }).success,
    ).toBe(false);
  });

  it("rejects blank Name and embedded NUL", () => {
    expect(
      collectionFormSchema.safeParse({
        Name: "   ",
        Description: "",
      }).success,
    ).toBe(false);
    expect(
      collectionFormSchema.safeParse({
        Name: "valid\0bad",
        Description: "",
      }).success,
    ).toBe(false);
  });
});
