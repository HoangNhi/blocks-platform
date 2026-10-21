import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import { describe, expect, it, vi } from "vitest";
import type { InternalComment } from "@/features/business/types/internalreview.types";
import SarReviewCommentsPanel from "./SarReviewCommentsPanel";

const makeComment = (overrides: Partial<InternalComment> = {}): InternalComment =>
  ({
    Id: "comment-1",
    SarReportId: "sar-1",
    CommentText: "Cần bổ sung nguồn trích dẫn rõ hơn.",
    HighlightedText: "chuẩn đầu ra",
    ReviewRound: 2,
    CreatedAt: "2026-04-10T08:00:00.000Z",
    CreatedBy: "reviewer-1",
    CreatedByName: "Nguyễn Văn A",
    ...overrides,
  }) as InternalComment;

type FakeDescendant = {
  isText: true;
  text: string;
  pos: number;
  marks?: FakeMark[];
  nodeSize?: number;
};

type FakeMark = {
  type: { name: string };
  attrs: Record<string, unknown>;
};

function createEditor(
  descendants: FakeDescendant[],
  isDestroyed = false,
  textBetweenImpl?: (from: number, to: number) => string,
  dom?: HTMLElement,
) {
  const focus = vi.fn(() => chainApi);
  const setTextSelection = vi.fn(() => chainApi);
  const scrollIntoView = vi.fn(() => chainApi);
  const run = vi.fn();

  const chainApi = {
    focus,
    setTextSelection,
    scrollIntoView,
    run,
  };

  return {
    isDestroyed,
    state: {
      doc: {
        descendants(callback: (node: FakeDescendant, pos: number) => boolean | void) {
          descendants.forEach((node) => {
            callback(
              {
                ...node,
                marks: node.marks ?? [],
                nodeSize: node.nodeSize ?? node.text.length,
              },
              node.pos,
            );
          });
        },
        textBetween: textBetweenImpl ?? vi.fn(() => ""),
      },
    },
    chain: () => chainApi,
    view: { dom: dom ?? document.createElement("div") },
  } as unknown as Editor;
}

describe("SarReviewCommentsPanel", () => {
  it("shows the loading state", () => {
    render(
      <SarReviewCommentsPanel
        comments={[]}
        editor={null}
        isLoading
        reviewRound={2}
      />,
    );

    expect(screen.getByTestId("sar-review-panel-loading")).toBeInTheDocument();
    expect(screen.queryByText(/chưa có nhận xét/i)).not.toBeInTheDocument();
  });

  it("shows the empty state when there are no comments", () => {
    render(
      <SarReviewCommentsPanel
        comments={[]}
        editor={null}
        isLoading={false}
        reviewRound={2}
      />,
    );

    expect(screen.getByText(/chưa có nhận xét/i)).toBeInTheDocument();
  });

  it("renders the author and comment text", () => {
    render(
      <SarReviewCommentsPanel
        comments={[makeComment()]}
        editor={null}
        isLoading={false}
        reviewRound={2}
      />,
    );

    expect(screen.getByText("Nguyễn Văn A")).toBeInTheDocument();
    expect(screen.getByText("Cần bổ sung nguồn trích dẫn rõ hơn.")).toBeInTheDocument();
  });

  it("renders the highlighted text as a blockquote when present", () => {
    render(
      <SarReviewCommentsPanel
        comments={[makeComment({ HighlightedText: "chuẩn đầu ra" })]}
        editor={null}
        isLoading={false}
        reviewRound={2}
      />,
    );

    expect(screen.getByText("chuẩn đầu ra").closest("blockquote")).toBeInTheDocument();
  });

  it("does not render a blockquote when highlighted text is absent", () => {
    const { container } = render(
      <SarReviewCommentsPanel
        comments={[makeComment({ HighlightedText: null })]}
        editor={null}
        isLoading={false}
        reviewRound={2}
      />,
    );

    expect(container.querySelector("blockquote")).not.toBeInTheDocument();
  });

  it("does not render a go-to-position button", () => {
    const editor = createEditor([{ isText: true, text: "Giới thiệu chuẩn đầu ra", pos: 5 }]);

    render(
      <SarReviewCommentsPanel
        comments={[makeComment()]}
        editor={editor}
        isLoading={false}
        reviewRound={2}
      />,
    );

    expect(screen.queryByRole("button", { name: /đến vị trí/i })).not.toBeInTheDocument();
  });

  it("scrolls the editor mark element into view when clicking a linked comment card", () => {
    const dom = document.createElement("div");
    const span = document.createElement("span");
    span.setAttribute("data-comment-id", "comment-1");
    dom.appendChild(span);
    const scrollIntoViewMock = vi.fn();
    span.scrollIntoView = scrollIntoViewMock;

    const editor = createEditor(
      [{ isText: true, text: "Giới thiệu chuẩn đầu ra", pos: 5 }],
      false,
      undefined,
      dom,
    );
    const onCommentClick = vi.fn();

    render(
      <SarReviewCommentsPanel
        comments={[makeComment()]}
        editor={editor}
        isLoading={false}
        reviewRound={2}
        onCommentClick={onCommentClick}
      />,
    );

    const card = screen.getByText("Nguyễn Văn A").closest("article");
    expect(card).toHaveClass("cursor-pointer");
    fireEvent.click(card!);
    expect(onCommentClick).toHaveBeenCalledOnce();
    expect(onCommentClick).toHaveBeenCalledWith(
      expect.objectContaining({ Id: "comment-1" }),
    );

    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
  });

  it("does not call editor.chain when navigating from the comment panel", () => {
    const dom = document.createElement("div");
    const editor = createEditor(
      [{ isText: true, text: "Giới thiệu chuẩn đầu ra", pos: 5 }],
      false,
      undefined,
      dom,
    );
    const chainSpy = vi.spyOn(editor, "chain");

    render(
      <SarReviewCommentsPanel
        comments={[makeComment()]}
        editor={editor}
        isLoading={false}
        reviewRound={2}
      />,
    );

    const card = screen.getByText("Nguyễn Văn A").closest("article");
    fireEvent.click(card!);

    expect(chainSpy).not.toHaveBeenCalled();
  });

  it("shows text-modified when the marked text no longer matches the original highlight", () => {
    const comment = makeComment({
      CommentMarkId: "mark-xyz",
      HighlightedText: "chuẩn đầu ra",
    });

    const editor = createEditor(
      [
        {
          isText: true,
          text: "chuẩn đầu ra đã được chỉnh sửa",
          pos: 0,
          marks: [
            {
              type: { name: "comment" },
              attrs: { commentId: "mark-xyz" },
            },
          ],
        },
      ],
      false,
      () => "chuẩn đầu ra đã được chỉnh sửa",
    );

    render(
      <SarReviewCommentsPanel
        comments={[comment]}
        editor={editor}
        isLoading={false}
        reviewRound={2}
      />,
    );

    expect(screen.getByText("Đoạn đã được chỉnh sửa")).toBeInTheDocument();
    expect(screen.getByText("Nguyễn Văn A").closest("article")).not.toHaveClass(
      "opacity-60",
    );
  });

  it("does not show the text-modified badge when the marked text still matches the highlight", () => {
    const comment = makeComment({
      CommentMarkId: "mark-xyz",
      HighlightedText: "chuẩn đầu ra",
    });

    const editor = createEditor(
      [
        {
          isText: true,
          text: "chuẩn đầu ra",
          pos: 0,
          marks: [
            {
              type: { name: "comment" },
              attrs: { commentId: "mark-xyz" },
            },
          ],
        },
      ],
      false,
      () => "chuẩn đầu ra",
    );

    render(
      <SarReviewCommentsPanel
        comments={[comment]}
        editor={editor}
        isLoading={false}
        reviewRound={2}
      />,
    );

    expect(screen.queryByText("Đoạn đã được chỉnh sửa")).not.toBeInTheDocument();
  });

  it("marks orphaned comments when the highlighted text is missing from the editor", () => {
    const editor = createEditor([{ isText: true, text: "Không khớp", pos: 0 }]);

    render(
      <SarReviewCommentsPanel
        comments={[makeComment()]}
        editor={editor}
        isLoading={false}
        reviewRound={2}
      />,
    );

    expect(screen.getByText("Đoạn đã được chỉnh sửa")).toBeInTheDocument();
    expect(screen.getByText("Nguyễn Văn A").closest("article")).toHaveClass("opacity-60");
  });

  it("omits navigation UI when the editor is null", () => {
    render(
      <SarReviewCommentsPanel
        comments={[makeComment()]}
        editor={null}
        isLoading={false}
        reviewRound={2}
      />,
    );

    expect(screen.queryByText("Đoạn đã được chỉnh sửa")).not.toBeInTheDocument();
    const card = screen.getByText("Nguyễn Văn A").closest("article");
    expect(card).not.toHaveClass("cursor-pointer");
  });

  it("shows the review round subtitle", () => {
    render(
      <SarReviewCommentsPanel
        comments={[makeComment()]}
        editor={null}
        isLoading={false}
        reviewRound={2}
      />,
    );

    expect(screen.getByText("Vòng 2 · 1 nhận xét")).toBeInTheDocument();
  });

  it("applies active highlight when activeCommentId matches the comment mark id", () => {
    if (!HTMLElement.prototype.scrollIntoView) {
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
        value: () => undefined,
        writable: true,
      });
    }

    render(
      <SarReviewCommentsPanel
        comments={[makeComment({ Id: "comment-1", CommentMarkId: "mark-abc" })]}
        activeCommentId="mark-abc"
        editor={null}
        isLoading={false}
        reviewRound={2}
      />,
    );

    const card = screen.getByText("Nguyễn Văn A").closest("article");
    expect(card).toHaveClass("bg-amber-50");
    expect(card).toHaveClass("border-l-4");
    expect(card).toHaveClass("border-amber-400");
  });

  it("does not apply active highlight when activeCommentId does not match", () => {
    render(
      <SarReviewCommentsPanel
        comments={[makeComment({ Id: "comment-1", CommentMarkId: "mark-abc" })]}
        activeCommentId="mark-other"
        editor={null}
        isLoading={false}
        reviewRound={2}
      />,
    );

    const card = screen.getByText("Nguyễn Văn A").closest("article");
    expect(card).not.toHaveClass("bg-amber-50");
  });

  it("scrolls the matching comment card into view when activeCommentId changes", async () => {
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
      makeComment({ Id: "comment-1", CommentMarkId: "mark-1" }),
      makeComment({
        Id: "comment-2",
        CommentMarkId: "mark-2",
        CommentText: "Bình luận thứ hai",
      }),
    ];

    const { rerender } = render(
      <SarReviewCommentsPanel
        comments={comments}
        editor={null}
        isLoading={false}
        reviewRound={2}
      />,
    );

    rerender(
      <SarReviewCommentsPanel
        comments={comments}
        activeCommentId="mark-2"
        editor={null}
        isLoading={false}
        reviewRound={2}
      />,
    );

    await waitFor(() => {
      expect(scrollSpy).toHaveBeenCalledWith({ behavior: "smooth", block: "nearest" });
    });

    scrollSpy.mockRestore();
  });
});
