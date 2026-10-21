import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import HomePage from "./HomePage.tsx";
import { useDashboardCycles } from "@/features/business/routes/Dashboard/hooks/useDashboardCycles";

vi.mock("@/features/business/routes/Dashboard/hooks/useDashboardCycles", () => ({
  useDashboardCycles: vi.fn(),
}));

vi.mock("@/features/business/routes/Dashboard/components/CycleChartSlide", () => ({
  default: ({ cycle }: { cycle: { CycleName: string } }) => <div>{cycle.CycleName}</div>,
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("HomePage", () => {
  it("renders overview cards and multiple cycles without crashing", async () => {
    vi.mocked(useDashboardCycles).mockReturnValue({
      data: {
        Summary: {
          ActiveCyclesCount: 2,
          EvidenceCount: 12,
          ActionPlansCount: 5,
          IncompleteActionPlansCount: 3,
          OverdueActionPlansCount: 1,
          NearDueActionPlansCount: 2,
        },
        Cycles: [
          {
            CycleId: "cycle-1",
            CycleName: "Chu kỳ 1",
            CycleStatus: 1,
            Deadline: "2026-05-01T00:00:00Z",
            StandardSetName: "Bộ tiêu chuẩn A",
            ChartType: 0,
            Stats: {
              AvgScore: 4.5,
              EvidenceCount: 6,
              CriteriaEvaluated: 10,
              CriteriaTotal: 12,
              ProgressPercent: 83,
            },
            ChartSeries: [],
            TopCriteria: [],
            BottomCriteria: [],
          },
          {
            CycleId: "cycle-2",
            CycleName: "Chu kỳ 2",
            CycleStatus: 2,
            Deadline: "2026-06-01T00:00:00Z",
            StandardSetName: "Bộ tiêu chuẩn B",
            ChartType: 1,
            Stats: {
              AvgScore: 3.5,
              EvidenceCount: 6,
              CriteriaEvaluated: 9,
              CriteriaTotal: 11,
              ProgressPercent: 82,
            },
            ChartSeries: [],
            TopCriteria: [],
            BottomCriteria: [],
          },
        ],
      },
      isLoading: false,
      isError: false,
    } as never);

    const { container } = render(<HomePage />);

    expect(screen.getByText("Chu kỳ hoạt động")).toBeInTheDocument();
    expect(screen.getByText("Kế hoạch hành động")).toBeInTheDocument();
    expect(screen.getByText("Cảnh báo kế hoạch")).toBeInTheDocument();
    expect(screen.getByText(/1 quá hạn · 2 trong 30 ngày/)).toBeInTheDocument();
    expect(screen.getByText("Chu kỳ 1")).toBeInTheDocument();
    expect(screen.getByText("Chu kỳ 2")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByRole("button")).toHaveLength(4);
    });

    const carouselViewport = container.querySelector(".snap-x");
    expect(carouselViewport?.className).toContain("[scrollbar-width:none]");
    expect(carouselViewport?.className).toContain("[&::-webkit-scrollbar]:hidden");
  });

  it("hiển thị trạng thái loading", () => {
    vi.mocked(useDashboardCycles).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as never);

    render(<HomePage />);
    expect(screen.getAllByText("—")).toHaveLength(4);
  });

  it("hiển thị thông báo lỗi khi isError", () => {
    vi.mocked(useDashboardCycles).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as never);

    render(<HomePage />);
    expect(screen.getByText("Không thể tải dữ liệu. Vui lòng thử lại.")).toBeInTheDocument();
  });

  it("hiển thị thông báo chưa tham gia chu kỳ khi cycles rỗng", () => {
    vi.mocked(useDashboardCycles).mockReturnValue({
      data: {
        Summary: {
          ActiveCyclesCount: 0,
          EvidenceCount: 0,
          ActionPlansCount: 0,
          IncompleteActionPlansCount: 0,
          OverdueActionPlansCount: 0,
          NearDueActionPlansCount: 0,
        },
        Cycles: [],
      },
      isLoading: false,
      isError: false,
    } as never);

    render(<HomePage />);
    expect(
      screen.getByText("Bạn chưa tham gia chu kỳ đánh giá nào đang hoạt động."),
    ).toBeInTheDocument();
  });
});
