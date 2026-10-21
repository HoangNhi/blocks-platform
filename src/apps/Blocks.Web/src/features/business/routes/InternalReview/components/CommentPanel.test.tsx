import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CommentPanel from "./CommentPanel";
import type { InternalComment } from "@/features/business/types/internalreview.types";

const makeComment = (overrides: Partial<InternalComment> = {}): InternalComment =>
  ({
    Id: "comment-1",
    SarReportId: "sar-1",
    CommentText: "Sample comment",
    HighlightedText: "quoted text",
    CommentMarkId: "mark-1",
    ReviewRound: 1,
    CreatedAt: "2026-04-08T01:30:00.000Z",
    CreatedBy: "reviewer-1",
    CreatedByName: "Reviewer One",
    ...overrides,
  }) as InternalComment;

describe("CommentPanel", () => {
  it("scrolls active comment card into view", async () => {
    if (!HTMLElement.prototype.scrollIntoView) {
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
        value: () => undefined,
        writable: true,
      });
    }

    const scrollSpy = vi
      .spyOn(HTMLElement.prototype, "scrollIntoView")
      .mockImplementation(() => undefined);

    const comments = [
      makeComment(),
      makeComment({
        Id: "comment-2",
        CommentMarkId: "mark-2",
        CommentText: "Second comment",
      }),
    ];

    const { rerender } = render(<CommentPanel comments={comments} />);

    rerender(<CommentPanel comments={comments} activeCommentId="mark-2" />);

    await waitFor(() => {
      expect(scrollSpy).toHaveBeenCalledWith({ behavior: "smooth", block: "nearest" });
    });

    scrollSpy.mockRestore();
  });

  it("forwards comment click events", () => {
    const onCommentClick = vi.fn();
    const comments = [makeComment(), makeComment({ Id: "comment-2", CommentText: "Second" })];

    render(<CommentPanel comments={comments} onCommentClick={onCommentClick} />);

    fireEvent.click(screen.getByText("Sample comment"));

    expect(onCommentClick).toHaveBeenCalledTimes(1);
    expect(onCommentClick).toHaveBeenCalledWith(
      expect.objectContaining({ Id: "comment-1" }),
    );
  });
});

