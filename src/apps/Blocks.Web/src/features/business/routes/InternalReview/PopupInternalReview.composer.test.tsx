import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PopupInternalReviewComposerSnippetPreview } from "./PopupInternalReview";

describe("PopupInternalReviewComposerSnippetPreview", () => {
  it("renders the selected text as an italic quote with an amber left border", () => {
    const { container } = render(
      <PopupInternalReviewComposerSnippetPreview highlightedText="Chuẩn đầu ra" />,
    );

    const quote = screen.getByText("Chuẩn đầu ra");
    expect(quote).toHaveClass("italic");
    expect(quote).toHaveClass("line-clamp-2");

    const wrapper = container.firstElementChild;
    expect(wrapper).toHaveClass("border-l-2", "border-amber-400", "overflow-hidden");
  });

  it("does not render the old selection label", () => {
    render(<PopupInternalReviewComposerSnippetPreview highlightedText="Đoạn test" />);

    expect(screen.queryByText(/đoạn đã chọn/i)).not.toBeInTheDocument();
  });

  it("does not render an ellipsis badge", () => {
    render(<PopupInternalReviewComposerSnippetPreview highlightedText="Đoạn test" />);

    expect(screen.queryByText("...")).not.toBeInTheDocument();
  });

  it("caps the preview height so long snippets do not expand the composer", () => {
    const { container } = render(
      <PopupInternalReviewComposerSnippetPreview
        highlightedText="Đây là một đoạn trích rất dài để xác nhận preview vẫn bị giới hạn chiều cao và không làm nở bubble composer quá mức."
      />,
    );

    expect(container.firstElementChild).toHaveClass("max-h-[3.5rem]");
  });
});
