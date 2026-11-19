import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  CollectionState,
  type CollectionContentState,
} from "./CollectionState";

describe("CollectionState", () => {
  const states: Exclude<CollectionContentState, "ready">[] = [
    "none",
    "invalid",
    "loading",
    "unavailable",
    "denied",
    "outage",
  ];

  it.each(states)("renders correct message and role for state '%s'", (state) => {
    const { unmount } = render(<CollectionState state={state} />);
    const expectedRole = state === "loading" ? "status" : "alert";
    const element = screen.getByRole(expectedRole);
    expect(element).toBeInTheDocument();

    if (state === "none") {
      expect(element).toHaveTextContent(
        "Hãy chọn hoặc tạo một bộ sưu tập để bắt đầu."
      );
    } else if (state === "invalid") {
      expect(element).toHaveTextContent(
        "Liên kết bộ sưu tập không hợp lệ. Hãy chọn lại từ danh sách."
      );
    } else if (state === "loading") {
      expect(element).toHaveTextContent("Đang tải bộ sưu tập...");
    } else if (state === "unavailable") {
      expect(element).toHaveTextContent(
        "Bộ sưu tập không tồn tại hoặc bạn không có quyền truy cập."
      );
    } else if (state === "denied") {
      expect(element).toHaveTextContent(
        "Bạn chưa được cấp quyền xem KnowledgeHub."
      );
    } else if (state === "outage") {
      expect(element).toHaveTextContent(
        "Dịch vụ KnowledgeHub đang tạm thời không khả dụng."
      );
    }
    unmount();
  });
});
