import { describe, expect, it } from "vitest";
import type { InternalReviewListItem } from "@/features/business/types/internalreview.types";
import {
  canDecideInternalReview,
  resolveEvidenceTagClickTargetId,
  shouldSyncInternalReviewCommentMarks,
} from "./PopupInternalReview";

function createItem(
  overrides: Partial<InternalReviewListItem> = {},
): InternalReviewListItem {
  return {
    SarReportId: "sar-1",
    CycleId: "cycle-1",
    CycleName: "Cycle 1",
    Year: 2026,
    Status: 2,
    ReviewRound: 1,
    CommentCount: 0,
    ...overrides,
  };
}

describe("canDecideInternalReview", () => {
  it.each([
    [null, false],
    [createItem({ Status: 1, CanApproveByRole: true }), false],
    [createItem({ Status: 2, CanApproveByRole: false }), false],
    [createItem({ Status: 2, CanApproveByRole: null }), false],
    [createItem({ Status: 2, CanApproveByRole: true }), true],
  ])("returns %s => %s", (item, expected) => {
    expect(canDecideInternalReview(item as InternalReviewListItem | null)).toBe(expected);
  });
});

describe("shouldSyncInternalReviewCommentMarks", () => {
  it("only syncs cleanup while the review popup is open in review mode", () => {
    expect(shouldSyncInternalReviewCommentMarks(2, true, false)).toBe(true);
    expect(shouldSyncInternalReviewCommentMarks(3, true, false)).toBe(false);
    expect(shouldSyncInternalReviewCommentMarks(2, false, false)).toBe(false);
    expect(shouldSyncInternalReviewCommentMarks(2, true, true)).toBe(false);
  });
});

describe("resolveEvidenceTagClickTargetId", () => {
  it("returns a trimmed evidence id for evidence tags", () => {
    expect(
      resolveEvidenceTagClickTargetId({
        type: { name: "evidenceTag" },
        attrs: { evidenceId: "  ev-123  " },
      } as never),
    ).toBe("ev-123");
  });

  it("returns null for non evidence tags", () => {
    expect(
      resolveEvidenceTagClickTargetId({
        type: { name: "paragraph" },
        attrs: { evidenceId: "ev-123" },
      } as never),
    ).toBeNull();
  });

  it("returns null when the evidence id is blank", () => {
    expect(
      resolveEvidenceTagClickTargetId({
        type: { name: "evidenceTag" },
        attrs: { evidenceId: "   " },
      } as never),
    ).toBeNull();
  });
});
