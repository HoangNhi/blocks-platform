import { describe, expect, it, vi } from "vitest";
import api from "@/lib/api";
import { API_ENDPOINTS } from "@/config/constants";
import { dashboardService } from "./dashboard.api";

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(),
  },
}));

describe("dashboardService", () => {
  it("gọi đúng endpoint tổng hợp dashboard", async () => {
    const getMock = vi.mocked(api.get);
    getMock.mockResolvedValue({
      Success: true,
      Data: [],
    } as never);

    await dashboardService.getCyclesSummary();

    expect(getMock).toHaveBeenCalledWith(
      API_ENDPOINTS.Business.Dashboard.GET_CYCLES_SUMMARY,
    );
  });
});
