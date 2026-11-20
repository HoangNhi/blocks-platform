import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RepositoryFrame } from "./RepositoryFrame";

describe("P02 repository truthfulness", () => {
  it("has an honest disabled upload placeholder and no fake files", () => {
    render(<RepositoryFrame state="ready" />);

    expect(
      screen.getByRole("button", {
        name: /Tải tài liệu.*chưa khả dụng/,
      }),
    ).toBeDisabled();
    expect(
      screen.getByText("Chưa có tài liệu trong bộ sưu tập này."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Clean Architecture/)).not.toBeInTheDocument();
  });

  it("renders the shared state copy when a collection is unavailable", () => {
    render(<RepositoryFrame state="unavailable" />);

    expect(screen.getByRole("alert")).toHaveAttribute(
      "data-state",
      "unavailable",
    );
    expect(
      screen.getByText(
        "Bộ sưu tập không tồn tại hoặc bạn không có quyền truy cập.",
      ),
    ).toBeInTheDocument();
  });
});
