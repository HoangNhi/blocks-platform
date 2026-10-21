import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  XAxis,
  YAxis,
} from "recharts";
import {
  DashboardEvaluationMode,
  type CycleSummary,
} from "@/features/business/types/dashboard.types";

interface Props {
  cycle: CycleSummary;
}

interface CustomYTickProps {
  x?: number;
  y?: number;
  payload?: { value: string; payload?: { index?: number } };
  index?: number;
}

const CustomYTick = ({ x = 0, y = 0, payload, index }: CustomYTickProps) => {
  const resolvedIndex = index ?? payload?.payload?.index ?? 0;
  const num = String(resolvedIndex + 1).padStart(2, "0");
  const raw = payload?.value ?? "";
  const name = raw.length > 12 ? `${raw.slice(0, 12)}…` : raw;

  return (
    <text x={x} y={y} textAnchor="end" dominantBaseline="middle" fontSize={10}>
      <tspan fill="#6366f1" fontWeight="700">
        {num}{" "}
      </tspan>
      <tspan fill="#334155" fontWeight="500">
        {name}
      </tspan>
    </text>
  );
};

const BarChartWidget = ({ cycle }: Props) => {
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
      <BarChart
        layout="vertical"
        data={chartData}
        margin={{ top: 4, right: 28, left: 0, bottom: 4 }}
      >
        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
        <XAxis
          type="number"
          domain={isPassFail ? [0, "auto"] : [0, 7]}
          tick={{ fontSize: 9 }}
        />
        <YAxis
          type="category"
          dataKey="criterion"
          width={115}
          tick={<CustomYTick />}
        />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="score" radius={[0, 4, 4, 0]}>
          {chartData.map((entry, idx) => (
            <Cell
              key={`${entry.criterion}-${idx}`}
              fill={isPassFail || entry.score >= 4 ? "#6366f1" : "#f43f5e"}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
};

export default BarChartWidget;
