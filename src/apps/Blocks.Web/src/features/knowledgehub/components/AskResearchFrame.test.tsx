import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AskResearchFrame } from "./AskResearchFrame";

describe("P02 research truthfulness", () => {
  it("keeps research actions visibly unavailable", () => {
    render(<AskResearchFrame state="ready" />);

    expect(screen.getByText("Hỏi đáp & Nghiên cứu")).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /Bắt đầu hỏi đáp.*chưa khả dụng/,
      }),
    ).toBeDisabled();
    expect(
      screen.getByText(
        "Hỏi đáp theo tài liệu, tìm kiếm và trích dẫn sẽ khả dụng trong các giai đoạn KnowledgeHub tiếp theo.",
      ),
    ).toBeInTheDocument();
  });

  it("renders the shared outage state instead of research controls", () => {
    render(<AskResearchFrame state="outage" />);

    expect(screen.getByRole("alert")).toHaveAttribute("data-state", "outage");
    expect(screen.queryByText("Hỏi đáp & Nghiên cứu")).not.toBeInTheDocument();
  });
});
