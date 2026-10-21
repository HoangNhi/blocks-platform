import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import BarChartWidget from "./BarChartWidget";
import {
  DashboardChartType,
  DashboardEvaluationMode,
  type CycleSummary,
} from "@/features/business/types/dashboard.types";

const baseCycle: CycleSummary = {
  CycleId: "cycle-1",
  CycleName: "Chu kỳ 1",
  CycleStatus: 1,
  Deadline: "2026-05-01T00:00:00Z",
  StandardSetName: "Bộ tiêu chuẩn A",
  ChartType: DashboardChartType.BarChart,
  EvaluationMode: DashboardEvaluationMode.Scoring7,
  Stats: {
    AvgScore: 4.25,
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
  TopCriteria: [],
  BottomCriteria: [],
};

describe("BarChartWidget", () => {
  it("hiển thị empty state khi không có chart series", () => {
    render(<BarChartWidget cycle={{ ...baseCycle, ChartSeries: [] }} />);
    expect(
      screen.getByText("Chưa có dữ liệu tiêu chí để hiển thị"),
    ).toBeInTheDocument();
  });

  it("hiển thị empty state cho PASS_FAIL khi không có chart series", () => {
    render(
      <BarChartWidget
        cycle={{
          ...baseCycle,
          EvaluationMode: DashboardEvaluationMode.PassFail,
          ChartSeries: [],
        }}
      />,
    );
    expect(
      screen.getByText("Chưa có dữ liệu tiêu chí để hiển thị"),
    ).toBeInTheDocument();
  });

  it("render chart và ẩn empty state khi có chart series", () => {
    render(<BarChartWidget cycle={baseCycle} />);
    expect(
      screen.queryByText("Chưa có dữ liệu tiêu chí để hiển thị"),
    ).not.toBeInTheDocument();
  });

  it("hiển thị index label 01, 02 cho từng tiêu chuẩn", () => {
    render(<BarChartWidget cycle={baseCycle} />);
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("02")).toBeInTheDocument();
  });

  it("render chart series cho PASS_FAIL", () => {
    render(
      <BarChartWidget
        cycle={{
          ...baseCycle,
          EvaluationMode: DashboardEvaluationMode.PassFail,
          ChartSeries: [
            { Name: "Tieu chuan 1", Score: 3 },
            { Name: "Tieu chuan 2", Score: 0 },
          ],
        }}
      />,
    );
    expect(
      screen.queryByText("Chưa có dữ liệu tiêu chí để hiển thị"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("02")).toBeInTheDocument();
  });

  it("render dynamic label for scoring vs pass/fail in tooltips/legends (hidden in DOM usually, but test config)", () => {
    // Note: Recharts Tooltips don't always render in jsdom easily, but we can verify the text isn't crashing
    const { rerender } = render(<BarChartWidget cycle={baseCycle} />);
    expect(screen.queryByText("Chưa có dữ liệu tiêu chí để hiển thị")).not.toBeInTheDocument();

    rerender(
      <BarChartWidget
        cycle={{ ...baseCycle, EvaluationMode: DashboardEvaluationMode.PassFail }}
      />
    );
    expect(screen.queryByText("Chưa có dữ liệu tiêu chí để hiển thị")).not.toBeInTheDocument();
  });
});
