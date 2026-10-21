import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SpiderChartWidget from "./SpiderChartWidget";
import {
  DashboardChartType,
  DashboardEvaluationMode,
  type CycleSummary,
} from "@/features/business/types/dashboard.types";

const baseCycle: CycleSummary = {
  CycleId: "cycle-spider-1",
  CycleName: "Chu kỳ Spider",
  CycleStatus: 1,
  Deadline: "2026-06-01T00:00:00Z",
  StandardSetName: "AUN-QA",
  ChartType: DashboardChartType.SpiderChart,
  EvaluationMode: DashboardEvaluationMode.Scoring7,
  Stats: {
    AvgScore: 5.0,
    EvidenceCount: 8,
    CriteriaEvaluated: 6,
    CriteriaTotal: 6,
    ProgressPercent: 100,
    PassedCount: 0,
  },
  ChartSeries: [
    { Name: "Tiêu chí A", Score: 5 },
    { Name: "Tiêu chí B", Score: 6 },
    { Name: "Tiêu chí C", Score: 4 },
  ],
  TopCriteria: [],
  BottomCriteria: [],
};

describe("SpiderChartWidget", () => {
  it("hiển thị empty state khi không có chart series", () => {
    render(<SpiderChartWidget cycle={{ ...baseCycle, ChartSeries: [] }} />);
    expect(
      screen.getByText("Chưa có dữ liệu tiêu chí để hiển thị"),
    ).toBeInTheDocument();
  });

  it("render chart và ẩn empty state khi có chart series", () => {
    render(<SpiderChartWidget cycle={baseCycle} />);
    expect(
      screen.queryByText("Chưa có dữ liệu tiêu chí để hiển thị"),
    ).not.toBeInTheDocument();
  });

  it("hiển thị index label 01, 02, 03 cho từng tiêu chuẩn", () => {
    render(<SpiderChartWidget cycle={baseCycle} />);
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("02")).toBeInTheDocument();
    expect(screen.getByText("03")).toBeInTheDocument();
  });

  it("hiển thị empty state cho PASS_FAIL khi không có chart series", () => {
    render(
      <SpiderChartWidget
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

  it("render dynamic label for scoring vs pass/fail without crashing", () => {
    const { rerender } = render(<SpiderChartWidget cycle={baseCycle} />);
    expect(
      screen.queryByText("Chưa có dữ liệu tiêu chí để hiển thị"),
    ).not.toBeInTheDocument();

    rerender(
      <SpiderChartWidget
        cycle={{ ...baseCycle, EvaluationMode: DashboardEvaluationMode.PassFail }}
      />
    );
    expect(
      screen.queryByText("Chưa có dữ liệu tiêu chí để hiển thị"),
    ).not.toBeInTheDocument();
  });
});
