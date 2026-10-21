import { describe, expect, it } from "vitest";
import { shouldHandleCommentActivated, shouldShowCommentComposerBubble } from "./PopupInternalReview";

describe("shouldShowCommentComposerBubble", () => {
  it("keeps bubble visible while composer is open even when selection is collapsed", () => {
    expect(shouldShowCommentComposerBubble({ from: 10, to: 10 }, true)).toBe(true);
  });

  it("shows bubble when user has a text selection", () => {
    expect(shouldShowCommentComposerBubble({ from: 10, to: 20 }, false)).toBe(true);
  });

  it("hides bubble when no selection and composer is closed", () => {
    expect(shouldShowCommentComposerBubble({ from: 10, to: 10 }, false)).toBe(false);
  });
});

describe("shouldHandleCommentActivated", () => {
  it("ignores activation while user is selecting text", () => {
    expect(
      shouldHandleCommentActivated({
        selectionFrom: 10,
        selectionTo: 20,
        isComposerOpen: false,
        hasDraft: false,
      }),
    ).toBe(false);
  });

  it("ignores activation while composer is open", () => {
    expect(
      shouldHandleCommentActivated({
        selectionFrom: 10,
        selectionTo: 10,
        isComposerOpen: true,
        hasDraft: false,
      }),
    ).toBe(false);
  });

  it("ignores activation while composer draft exists", () => {
    expect(
      shouldHandleCommentActivated({
        selectionFrom: 10,
        selectionTo: 10,
        isComposerOpen: false,
        hasDraft: true,
      }),
    ).toBe(false);
  });

  it("handles activation only when cursor is collapsed and composer flow is idle", () => {
    expect(
      shouldHandleCommentActivated({
        selectionFrom: 10,
        selectionTo: 10,
        isComposerOpen: false,
        hasDraft: false,
      }),
    ).toBe(true);
  });
});
