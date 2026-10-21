import { format } from "date-fns";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import CommentItem, { getInitials, stringToHslColor } from "./CommentItem";
import type { InternalComment } from "@/features/business/types/internalreview.types";

const baseComment = (overrides: Partial<InternalComment> = {}): InternalComment =>
  ({
    Id: "comment-1",
    SarReportId: "sar-1",
    CommentText: "This is a sample comment.\nWith a new line.",
    HighlightedText: "quoted text",
    ReviewRound: 1,
    CreatedAt: "2026-04-08T01:30:00.000Z",
    CreatedBy: "author-1",
    CreatedByName: "Alice Brown",
    ...overrides,
  }) as InternalComment;

describe("CommentItem helpers", () => {
  it("derives initials from the display name", () => {
    expect(getInitials("Alice Brown")).toBe("AB");
    expect(getInitials("alice")).toBe("A");
    expect(getInitials("")).toBe("?");
  });

  it("produces a deterministic HSL color for a given name", () => {
    expect(stringToHslColor("Alice Brown")).toBe(stringToHslColor("Alice Brown"));
    expect(stringToHslColor("Alice Brown")).not.toBe(stringToHslColor("Bob Smith"));
  });
});

describe("CommentItem", () => {
  it("renders a Word-style card with avatar, header, quote and text", () => {
    const comment = baseComment();
    const expectedCreatedAtLabel = format(new Date(comment.CreatedAt), "dd/MM/yyyy HH:mm");

    render(<CommentItem comment={comment} />);

    expect(screen.getByText("Alice Brown")).toBeInTheDocument();
    expect(screen.getByText(expectedCreatedAtLabel)).toBeInTheDocument();
    expect(screen.getByText("AB")).toBeInTheDocument();

    const card = screen.getByText("Alice Brown").closest("article");
    expect(card).toHaveClass("rounded-lg", "border", "bg-white", "shadow-sm");
    expect(card).not.toHaveClass("border-l-4");

    const quote = screen.getByText("quoted text").closest("blockquote");
    expect(quote).toHaveClass(
      "mt-2",
      "border-l-2",
      "border-slate-300",
      "bg-slate-50",
      "pl-2",
      "py-1",
      "text-xs",
      "italic",
      "text-slate-600",
      "rounded-r-sm",
    );

    expect(screen.getByText(/This is a sample comment\./)).toHaveClass(
      "mt-2",
      "text-sm",
      "text-slate-800",
      "whitespace-pre-wrap",
    );
  });

  it("shows the delete button only when deletion is allowed", () => {
    const onDelete = vi.fn();

    const { rerender } = render(
      <CommentItem comment={baseComment()} canDelete onDelete={onDelete} />,
    );

    expect(screen.getByRole("button", { name: "Xóa nhận xét" })).toBeInTheDocument();

    rerender(<CommentItem comment={baseComment()} canDelete={false} onDelete={onDelete} />);

    expect(screen.queryByRole("button", { name: "Xóa nhận xét" })).not.toBeInTheDocument();
  });

  it("applies the active highlight treatment", () => {
    render(<CommentItem comment={baseComment()} active />);

    const card = screen.getByText("Alice Brown").closest("article");
    expect(card).toHaveClass("border-l-4", "border-amber-400", "bg-amber-50");
  });

  it("wires optional click handler to the card", () => {
    const onClick = vi.fn();
    render(<CommentItem comment={baseComment()} onClick={onClick} />);

    const card = screen.getByText("Alice Brown").closest("article");
    expect(card).toHaveClass("cursor-pointer");

    fireEvent.click(card as HTMLElement);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
