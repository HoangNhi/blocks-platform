import { CalendarDays, BarChart3, Radar } from "lucide-react";
import { cn } from "@/lib/utils";
import { CYCLE_STATUS_LABEL } from "@/constants/catalog.constants";
import {
  DashboardChartType,
  DashboardEvaluationMode,
  type CycleSummary,
} from "@/features/business/types/dashboard.types";
import SpiderChartWidget from "./SpiderChartWidget";
import BarChartWidget from "./BarChartWidget";

interface Props {
  cycle: CycleSummary;
}

const CycleChartSlide = ({ cycle }: Props) => {
  const statusMeta = CYCLE_STATUS_LABEL[cycle.CycleStatus] ?? {
    label: "N/A",
    className: "bg-gray-100 text-gray-500",
  };

  const deadline = cycle.Deadline ? new Date(cycle.Deadline) : null;
  const deadlineLabel = deadline ? deadline.toLocaleDateString("vi-VN") : null;
  const now = new Date();
  const isDeadlineSoon = deadline
    ? deadline.getTime() >= now.getTime()
      && deadline.getTime() <= now.getTime() + 30 * 24 * 60 * 60 * 1000
    : false;

  const chartLabel =
    cycle.ChartType === DashboardChartType.BarChart ? "Biểu đồ thanh" : "Biểu đồ radar";
  const showInsights = cycle.ChartType === DashboardChartType.SpiderChart;
  const isPassFail = cycle.EvaluationMode === DashboardEvaluationMode.PassFail;

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-5 py-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold text-slate-800">
            {cycle.CycleName}
          </span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
              statusMeta.className,
            )}
          >
            {statusMeta.label}
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
            {cycle.StandardSetName}
          </span>
          <span className="rounded-full bg-cyan-50 px-2 py-0.5 text-[10px] font-medium text-cyan-700">
            {chartLabel}
          </span>
        </div>
        {deadlineLabel && (
          <div
            className={cn(
              "flex shrink-0 items-center gap-1 text-xs font-semibold",
              isDeadlineSoon ? "text-amber-500" : "text-slate-400",
            )}
          >
            <CalendarDays size={12} />
            {deadlineLabel}
          </div>
        )}
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="border-b border-slate-100 p-5 lg:border-b-0 lg:border-r lg:border-slate-100">
          {cycle.ChartType === DashboardChartType.BarChart ? (
            <BarChartWidget cycle={cycle} />
          ) : (
            <SpiderChartWidget cycle={cycle} />
          )}
        </div>

        <div className="flex flex-col gap-4 p-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">
                {isPassFail ? "Kết quả" : "Điểm trung bình"}
              </p>
              <p className="mt-1 text-lg font-bold text-indigo-600">
                {isPassFail ? (
                  <>
                    {cycle.Stats.PassedCount} đạt
                    <span className="ml-1 text-sm font-normal text-slate-400">
                      / {cycle.Stats.CriteriaTotal}
                    </span>
                  </>
                ) : cycle.Stats.AvgScore > 0 ? (
                  <>
                    {cycle.Stats.AvgScore}
                    <span className="ml-1 text-sm font-normal text-slate-400">/ 7</span>
                  </>
                ) : (
                  <span className="text-sm font-normal text-slate-400">Chưa có</span>
                )}
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">
                Minh chứng
              </p>
              <p className="mt-1 text-lg font-bold text-slate-800">
                {cycle.Stats.EvidenceCount}
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">
                Tiêu chí đã đánh giá
              </p>
              <p className="mt-1 text-lg font-bold text-slate-800">
                {cycle.Stats.CriteriaEvaluated}
                <span className="ml-1 text-sm font-normal text-slate-400">
                  / {cycle.Stats.CriteriaTotal}
                </span>
              </p>
            </div>

            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-400">
                Tiến độ
              </p>
              <div className="mt-2 flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                  <div
                    className="h-full rounded-full bg-indigo-500 transition-all duration-300"
                    style={{ width: `${cycle.Stats.ProgressPercent}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-indigo-600">
                  {cycle.Stats.ProgressPercent}%
                </span>
              </div>
            </div>
          </div>

          {showInsights && (cycle.TopCriteria.length > 0 || cycle.BottomCriteria.length > 0) && (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl bg-emerald-50 p-3">
                <p className="mb-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                  <Radar size={12} />
                  Điểm mạnh
                </p>
                <div className="space-y-1">
                  {cycle.TopCriteria.map((item) => (
                    <div
                      key={`${cycle.CycleId}-top-${item.Name}`}
                      className="flex justify-between gap-2 text-xs"
                    >
                      <span className="truncate text-slate-600">{item.Name}</span>
                      <span className="font-bold text-emerald-600">{item.Score}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl bg-orange-50 p-3">
                <p className="mb-2 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-orange-700">
                  <BarChart3 size={12} />
                  Cần cải thiện
                </p>
                <div className="space-y-1">
                  {cycle.BottomCriteria.map((item) => (
                    <div
                      key={`${cycle.CycleId}-bottom-${item.Name}`}
                      className="flex justify-between gap-2 text-xs"
                    >
                      <span className="truncate text-slate-600">{item.Name}</span>
                      <span className="font-bold text-orange-600">{item.Score}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CycleChartSlide;
