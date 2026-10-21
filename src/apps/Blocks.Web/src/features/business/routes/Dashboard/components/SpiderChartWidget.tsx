import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
} from "recharts";
import {
  DashboardEvaluationMode,
  type CycleSummary,
} from "@/features/business/types/dashboard.types";

interface Props {
  cycle: CycleSummary;
}

interface CustomPolarTickProps {
  payload?: { value: string; payload?: { index?: number } };
  x?: number;
  y?: number;
  textAnchor?: "start" | "middle" | "end" | "inherit";
  index?: number;
}

const CustomPolarTick = ({
  payload,
  x = 0,
  y = 0,
  textAnchor = "middle",
  index = 0,
}: CustomPolarTickProps) => {
  const resolvedIndex = index ?? payload?.payload?.index ?? 0;
  const num = String(resolvedIndex + 1).padStart(2, "0");
  const raw = payload?.value ?? "";
  const name = raw.length > 10 ? `${raw.slice(0, 10)}…` : raw;

  return (
    <text x={x} y={y} textAnchor={textAnchor} fontSize={10}>
      <tspan fill="#6366f1" fontWeight="700">
        {num}{" "}
      </tspan>
      <tspan fill="#334155" fontWeight="500">
        {name}
      </tspan>
    </text>
  );
};

const SpiderChartWidget = ({ cycle }: Props) => {
  const series = cycle.ChartSeries ?? [];
  const isPassFail = cycle.EvaluationMode === DashboardEvaluationMode.PassFail;

  if (series.length === 0) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 text-sm text-slate-400">
        Chưa có dữ liệu tiêu chí để hiển thị
      </div>
    );
  }

  const chartData = series.map((item, index) => ({
    criterion: item.Name,
    score: item.Score,
    index,
  }));

  const chartLabel = isPassFail ? "Số tiêu chí đạt" : "Điểm trung bình";

  const chartConfig = {
    score: {
      label: chartLabel,
      color: "#6366f1",
    },
  } as const;

  return (
    <ChartContainer config={chartConfig} className="h-[300px] w-full">
      <RadarChart data={chartData}>
        <PolarGrid />
        <PolarAngleAxis dataKey="criterion" tick={<CustomPolarTick />} />
        <PolarRadiusAxis
          angle={30}
          domain={isPassFail ? [0, "auto"] : [0, 7]}
          tick={{ fontSize: 9 }}
        />
        <Radar
          name={chartLabel}
          dataKey="score"
          stroke="#6366f1"
          fill="#6366f1"
          fillOpacity={0.18}
          strokeWidth={2}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
      </RadarChart>
    </ChartContainer>
  );
};

export default SpiderChartWidget;
