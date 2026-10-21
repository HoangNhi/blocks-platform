import { describe, expect, it, vi } from "vitest";
import api from "@/lib/api";
import { API_ENDPOINTS } from "@/config/constants";
import { taskExecutionService } from "./taskExecution.api";

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(),
  },
}));

describe("taskExecutionService", () => {
  it("truyền tham số status khi lấy danh sách kế hoạch của tôi", async () => {
    const getMock = vi.mocked(api.get);
    getMock.mockResolvedValue({
      Success: true,
      StatusCode: 200,
      Data: {
        Data: [],
        PageIndex: 1,
        PageSize: 10,
        TotalRow: 0,
      },
    });

    await taskExecutionService.getMyPlans({
      PageIndex: 1,
      PageSize: 10,
      TextSearch: "",
      CycleId: "cycle-1",
      Status: 4,
    } as never);

    expect(getMock).toHaveBeenCalledWith(API_ENDPOINTS.Business.TaskExecution.GET_MY_PLANS, {
      params: {
        pageIndex: 1,
        pageSize: 10,
        textSearch: "",
        cycleId: "cycle-1",
        status: 4,
      },
    });
  });
});
