import { describe, expect, it } from "vitest";
import { buildComposerDraftFromSelection } from "./PopupInternalReview";

describe("buildComposerDraftFromSelection", () => {
  it("returns null when selection is collapsed", () => {
    expect(
      buildComposerDraftFromSelection({
        from: 20,
        to: 20,
        highlightedText: "abc",
        markId: "id-1",
      }),
    ).toBeNull();
  });

  it("returns null when selected text is empty after trimming", () => {
    expect(
      buildComposerDraftFromSelection({
        from: 5,
        to: 15,
        highlightedText: "   ",
        markId: "id-2",
      }),
    ).toBeNull();
  });

  it("returns draft with saved range when selection is valid", () => {
    expect(
      buildComposerDraftFromSelection({
        from: 5,
        to: 15,
        highlightedText: "đoạn văn bản được chọn",
        markId: "id-3",
      }),
    ).toEqual({
      markId: "id-3",
      highlightedText: "đoạn văn bản được chọn",
      from: 5,
      to: 15,
    });
  });
});
