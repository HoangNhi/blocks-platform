import { describe, expect, it } from "vitest";
import { getTaskStatusLabel } from "./taskExecution.utils";

describe("taskExecution utils", () => {
  it("maps in-progress status to Vietnamese label", () => {
    expect(getTaskStatusLabel(2)).toBe("Đang thực hiện");
  });

  it("maps has-error status to Vietnamese label", () => {
    expect(getTaskStatusLabel(4)).toBe("Có lỗi/cần kiểm tra lại");
  });
});
