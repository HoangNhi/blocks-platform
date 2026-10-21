export enum DashboardChartType {
  SpiderChart = 0,
  BarChart = 1,
}

export enum DashboardEvaluationMode {
  Scoring7 = 1,
  PassFail = 2,
}

export interface CriteriaSummary {
  Name: string;
  Score: number;
}

export interface CycleStats {
  AvgScore: number;
  EvidenceCount: number;
  CriteriaEvaluated: number;
  CriteriaTotal: number;
  ProgressPercent: number;
  PassedCount: number;
}

export interface DashboardSummary {
  ActiveCyclesCount: number;
  EvidenceCount: number;
  ActionPlansCount: number;
  IncompleteActionPlansCount: number;
  OverdueActionPlansCount: number;
  NearDueActionPlansCount: number;
}

export interface CycleSummary {
  CycleId: string;
  CycleName: string;
  CycleStatus: number;
  Deadline?: string | null;
  StandardSetName: string;
  ChartType: DashboardChartType | number;
  EvaluationMode: DashboardEvaluationMode;
  Stats: CycleStats;
  ChartSeries: CriteriaSummary[];
  TopCriteria: CriteriaSummary[];
  BottomCriteria: CriteriaSummary[];
}

export interface DashboardOverview {
  Summary: DashboardSummary;
  Cycles: CycleSummary[];
}

export const EMPTY_DASHBOARD_OVERVIEW: DashboardOverview = {
  Summary: {
    ActiveCyclesCount: 0,
    EvidenceCount: 0,
    ActionPlansCount: 0,
    IncompleteActionPlansCount: 0,
    OverdueActionPlansCount: 0,
    NearDueActionPlansCount: 0,
  },
  Cycles: [],
};
