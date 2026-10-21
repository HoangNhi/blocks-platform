import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { dashboardService } from "@/features/business/api/dashboard.api";

vi.mock("@/features/business/api/dashboard.api", async () => {
  const actual = await vi.importActual<
    typeof import("@/features/business/api/dashboard.api")
  >("@/features/business/api/dashboard.api");

  return {
    ...actual,
    dashboardService: {
      ...actual.dashboardService,
      getCyclesSummary: vi.fn(),
    },
  };
});

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);

  return { wrapper, queryClient };
}

describe("useDashboardCycles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("lấy overview dashboard và trả về cả summary lẫn danh sách chu kỳ", async () => {
    vi.mocked(dashboardService.getCyclesSummary).mockResolvedValue({
      Success: true,
      Data: {
        Summary: {
          ActiveCyclesCount: 2,
          EvidenceCount: 12,
          ActionPlansCount: 5,
          IncompleteActionPlansCount: 3,
          OverdueActionPlansCount: 1,
          NearDueActionPlansCount: 1,
        },
        Cycles: [
          {
            CycleId: "cycle-1",
            CycleName: "Chu kỳ 1",
            CycleStatus: 1,
            Deadline: "2026-05-01T00:00:00Z",
            StandardSetName: "Bộ tiêu chuẩn A",
            ChartType: 1,
            EvaluationMode: 1,
            Stats: {
              AvgScore: 4.25,
              EvidenceCount: 12,
              CriteriaEvaluated: 8,
              CriteriaTotal: 10,
              ProgressPercent: 80,
              PassedCount: 0,
            },
            ChartSeries: [
              {
                Name: "Tiêu chuẩn 1",
                Score: 4.25,
              },
            ],
            TopCriteria: [],
            BottomCriteria: [],
          },
        ],
      },
    } as never);

    const { useDashboardCycles } = await import("./useDashboardCycles");

    const { wrapper, queryClient } = createWrapper();
    const { result, unmount } = renderHook(() => useDashboardCycles(), { wrapper });

    await waitFor(() => {
      const overview = result.current.data as any;
      expect(overview?.Cycles).toHaveLength(1);
    });

    expect(dashboardService.getCyclesSummary).toHaveBeenCalledWith();
    expect(dashboardService.getCyclesSummary).toHaveBeenCalledTimes(1);

    const overview = result.current.data as any;
    expect(overview?.Summary).toMatchObject({
      ActiveCyclesCount: 2,
      ActionPlansCount: 5,
      IncompleteActionPlansCount: 3,
    });
    expect(overview?.Cycles?.[0]).toMatchObject({
      CycleId: "cycle-1",
      CycleName: "Chu kỳ 1",
      StandardSetName: "Bộ tiêu chuẩn A",
      ChartType: 1,
    });

    unmount();
    queryClient.clear();
  });

  it("báo lỗi khi dashboard API trả về thất bại", async () => {
    vi.mocked(dashboardService.getCyclesSummary).mockResolvedValue({
      Success: false,
      Message: "Không thể tải dữ liệu dashboard.",
    } as never);

    const { useDashboardCycles } = await import("./useDashboardCycles");

    const { wrapper, queryClient } = createWrapper();
    const { result } = renderHook(() => useDashboardCycles(), { wrapper });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error).toBeInstanceOf(Error);
    expect((result.current.error as Error).message).toBe(
      "Không thể tải dữ liệu dashboard.",
    );

    queryClient.clear();
  });
});
