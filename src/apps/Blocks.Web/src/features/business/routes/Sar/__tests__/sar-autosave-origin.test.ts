import { describe, expect, it } from "vitest";
import { isLocalSarAutosaveOrigin } from "../autosave-origin";

describe("isLocalSarAutosaveOrigin", () => {
  it("returns true for local editor-originated updates", () => {
    expect(
      isLocalSarAutosaveOrigin(
        { origin: { source: "local-editor" } },
        { source: "remote-provider" } as never,
      ),
    ).toBe(true);
  });

  it("returns false for remote provider-originated updates", () => {
    const provider = { source: "remote-provider" } as never;
    expect(isLocalSarAutosaveOrigin({ origin: provider }, provider)).toBe(false);
  });

  it.each([null, undefined, { origin: undefined }, { origin: "unknown" }, { origin: 123 }])(
    "returns false for unknown or missing origin %s",
    (value) => {
      expect(isLocalSarAutosaveOrigin(value as never)).toBe(false);
    },
  );
});
