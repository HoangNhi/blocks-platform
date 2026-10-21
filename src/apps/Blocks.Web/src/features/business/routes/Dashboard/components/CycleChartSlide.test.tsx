import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CycleChartSlide from "./CycleChartSlide";
import {
  DashboardChartType,
  DashboardEvaluationMode,
  type CycleSummary,
} from "@/features/business/types/dashboard.types";

vi.mock("./SpiderChartWidget", () => ({
  default: () => <div>Spider Chart</div>,
}));

vi.mock("./BarChartWidget", () => ({
  default: () => <div>Bar Chart</div>,
}));

const baseCycle: CycleSummary = {
  CycleId: "cycle-1",
  CycleName: "Chu kỳ 1",
  CycleStatus: 4,
  Deadline: "2026-05-01T00:00:00+07:00",
  StandardSetName: "Bộ tiêu chuẩn A",
  ChartType: DashboardChartType.BarChart,
  EvaluationMode: DashboardEvaluationMode.Scoring7,
  Stats: {
    AvgScore: 4.5,
    EvidenceCount: 12,
    CriteriaEvaluated: 8,
    CriteriaTotal: 10,
    ProgressPercent: 80,
    PassedCount: 0,
  },
  ChartSeries: [
    { Name: "TC1", Score: 5.5 },
    { Name: "TC2", Score: 4.2 },
  ],
  TopCriteria: [{ Name: "TC1", Score: 5.5 }],
  BottomCriteria: [{ Name: "TC2", Score: 4.2 }],
};

describe("CycleChartSlide", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("hiển thị ngày deadline cụ thể và ẩn panel insight khi là Bar Chart", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-20T09:00:00+07:00"));

    render(<CycleChartSlide cycle={baseCycle} />);

    const expectedDeadline = new Date("2026-05-01T00:00:00+07:00").toLocaleDateString("vi-VN");
    expect(screen.getByText(expectedDeadline)).toBeInTheDocument();
    expect(screen.queryByText("Điểm mạnh")).not.toBeInTheDocument();
    expect(screen.queryByText("Cần cải thiện")).not.toBeInTheDocument();
    expect(screen.getAllByText("Biểu đồ thanh")).not.toHaveLength(0);
  });

  it("giữ panel insight khi là Spider Chart với SCORING_7", () => {
    render(
      <CycleChartSlide
        cycle={{
          ...baseCycle,
          ChartType: DashboardChartType.SpiderChart,
          TopCriteria: [{ Name: "TC1", Score: 5.5 }],
          BottomCriteria: [{ Name: "TC2", Score: 4.2 }],
        }}
      />,
    );

    expect(screen.getByText("Điểm mạnh")).toBeInTheDocument();
    expect(screen.getByText("Cần cải thiện")).toBeInTheDocument();
    expect(screen.getAllByText("Biểu đồ radar")).not.toHaveLength(0);
  });

  it("hiển thị PassedCount / CriteriaTotal thay vì AvgScore cho PASS_FAIL", () => {
    render(
      <CycleChartSlide
        cycle={{
          ...baseCycle,
          EvaluationMode: DashboardEvaluationMode.PassFail,
          Stats: {
            AvgScore: 0,
            EvidenceCount: 5,
            CriteriaEvaluated: 52,
            CriteriaTotal: 52,
            ProgressPercent: 100,
            PassedCount: 40,
          },
        }}
      />,
    );

    expect(screen.getByText(/40 đạt/)).toBeInTheDocument();
    expect(screen.queryByText("/ 7")).not.toBeInTheDocument();
  });
});
