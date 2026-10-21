import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ResultsTab } from "./ResultsTab";

function createProps() {
  const onUpsertResult = vi.fn().mockResolvedValue({
    Id: "result-1",
    ExternalReviewId: "review-1",
    StandardId: "std-1",
    Strengths: null,
    Findings: [],
  });

  return {
    standards: [{ Value: "std-1", Text: "Tiêu chuẩn 1" }],
    results: [],
    isSubmitting: false,
    isReadOnly: false,
    onUpsertResult: onUpsertResult as never,
    onAddFinding: vi.fn().mockResolvedValue(undefined),
    onUpdateFinding: vi.fn().mockResolvedValue(undefined),
    onDeleteFinding: vi.fn().mockResolvedValue(undefined),
  };
}

describe("ResultsTab auto create result", () => {
  it("hiển thị ngay nút thêm phát hiện khi chưa có result", () => {
    const props = createProps();
    render(<ResultsTab {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Tiêu chuẩn 1" }));

    expect(
      screen.queryByText("Cần lưu kết quả trước khi thêm phát hiện."),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "+ Thêm Cần cải tiến" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "+ Thêm Kiến nghị" }),
    ).toBeInTheDocument();
  });

  it("tự upsert result khi bấm thêm phát hiện và mở modal", async () => {
    const props = createProps();
    render(<ResultsTab {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Tiêu chuẩn 1" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Thêm Cần cải tiến" }));

    await waitFor(() => {
      expect(props.onUpsertResult).toHaveBeenCalledWith({
        standardId: "std-1",
        strengths: null,
      });
    });

    expect(screen.getByText("Thêm phát hiện")).toBeInTheDocument();
  });
});
