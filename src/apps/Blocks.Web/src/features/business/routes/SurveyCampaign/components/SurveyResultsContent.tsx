import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { ChartConfig } from "@/components/ui/chart";
import { Loader2, AlertCircle } from "lucide-react";
import { surveyCampaignService } from "@/features/business/api/survey-campaign.api";
import type {
  AggregatedRatingQuestion,
  AggregatedTextQuestion,
} from "@/features/business/types/survey-campaign.types";

interface SurveyResultsContentProps {
  campaignId: string;
  enabled: boolean;
}

// ============================================================================
// RatingTable Component
// ============================================================================

interface RatingTableProps {
  questions: AggregatedRatingQuestion[];
}

// Column width constants for RatingTable
const COL_WIDTHS = {
  ROW_NUM: 36,
  QUESTION: 140,
  SCORE_VALUE: 32,
  PERCENTAGE: 42,
  TOTAL: 60,
} as const;

const RatingTable: React.FC<RatingTableProps> = React.memo(({ questions }) => {
  const RATING_LABELS = [
    "1. Hoàn toàn không đồng ý",
    "2. Không đồng ý",
    "3. Bình thường",
    "4. Đồng ý",
    "5. Hoàn toàn đồng ý",
  ];
  const SCORE_STYLES = [
    "bg-red-100 text-red-700",
    "bg-orange-100 text-orange-700",
    "bg-yellow-100 text-yellow-800",
    "bg-green-100 text-green-700",
    "bg-emerald-100 text-emerald-700",
  ];

  const getScoreCount = (question: AggregatedRatingQuestion, scoreIndex: number): number => {
    switch (scoreIndex) {
      case 0:
        return question.Score1Count;
      case 1:
        return question.Score2Count;
      case 2:
        return question.Score3Count;
      case 3:
        return question.Score4Count;
      case 4:
        return question.Score5Count;
      default:
        return 0;
    }
  };

  const calculatePercentage = (value: number, total: number): string => {
    if (total === 0) return "0";
    return ((value / total) * 100).toFixed(1);
  };

  return (
    <div className="overflow-x-auto">
      <table
        className="w-full text-sm border-collapse"
        style={{ tableLayout: "fixed" }}
      >
        <colgroup>
          <col style={{ width: `${COL_WIDTHS.ROW_NUM}px` }} />
          <col style={{ width: `${COL_WIDTHS.QUESTION}px` }} />
          {[1, 2, 3, 4, 5].map((s) => (
            <React.Fragment key={s}>
              <col style={{ width: `${COL_WIDTHS.SCORE_VALUE}px` }} />
              <col style={{ width: `${COL_WIDTHS.PERCENTAGE}px` }} />
            </React.Fragment>
          ))}
          <col style={{ width: `${COL_WIDTHS.TOTAL}px` }} />
        </colgroup>

        {/* Row 1: "Ý kiến phản hồi" header */}
        <thead>
          <tr className="border-b">
            <th rowSpan={3} className="border border-slate-200 px-2 py-2 text-center font-semibold bg-slate-50">STT</th>
            <th rowSpan={3} className="border border-slate-200 px-2 py-2 text-center font-semibold bg-slate-50">
              Câu hỏi
            </th>
            <th
              colSpan={10}
              className="border border-slate-200 bg-blue-700 px-2 py-1.5 text-center text-[11px] font-bold text-white"
            >
              Ý kiến phản hồi
            </th>
            <th rowSpan={3} className="border border-slate-200 px-2 py-2 text-center font-semibold bg-slate-50">
              Tổng
            </th>
          </tr>

          {/* Row 2: Score labels (1-5) with colored backgrounds */}
          <tr className="border-b">
            {RATING_LABELS.map((label, idx) => (
              <th
                key={`label-${idx}`}
                colSpan={2}
                className={`border border-slate-200 ${SCORE_STYLES[idx]} px-1 py-1 text-xs font-semibold`}
              >
                {label}
              </th>
            ))}
          </tr>

          {/* Row 3: SL / % columns */}
          <tr>
            {[1, 2, 3, 4, 5].map((s) => (
              <React.Fragment key={`header-${s}`}>
                <th className="border border-slate-200 bg-slate-100 px-0.5 py-1 text-center text-[9px] font-bold text-slate-600">
                  SL
                </th>
                <th className="border border-slate-200 bg-slate-100 px-0.5 py-1 text-center text-[9px] font-bold text-slate-600">
                  %
                </th>
              </React.Fragment>
            ))}
          </tr>
        </thead>

        {/* Data rows */}
        <tbody>
          {questions.map((question, idx) => {
            const total = question.Total;
            return (
              <tr key={question.QuestionId} className="even:bg-slate-50/60 hover:bg-blue-50 transition-colors duration-100">
                <td className="border border-slate-200 px-2 py-2 text-xs font-medium text-slate-700 text-center">
                  {idx + 1}
                </td>
                <td className="border border-slate-200 px-2 py-2 text-xs text-slate-700">
                  {question.Content}
                </td>

                {/* Score columns: SL / % interleaved */}
                {[0, 1, 2, 3, 4].map((scoreIdx) => {
                  const score = getScoreCount(question, scoreIdx);
                  const percentage = calculatePercentage(score, total);
                  const isZero = score === 0;

                  return (
                    <React.Fragment key={`score-${scoreIdx}`}>
                      <td
                        className={`border border-slate-200 px-1 py-2 text-center text-xs font-semibold ${
                          isZero ? "text-slate-300" : "text-slate-800"
                        }`}
                      >
                        {score}
                      </td>
                      <td
                        className={`border border-slate-200 px-1 py-2 text-center text-[10px] ${
                          isZero ? "text-slate-300" : "text-slate-500"
                        }`}
                      >
                        {percentage}%
                      </td>
                    </React.Fragment>
                  );
                })}

                {/* Total column */}
                <td className="border border-slate-200 bg-slate-50 px-2 py-2 text-center text-xs font-bold text-blue-700">
                  {total}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
});

// ============================================================================
// OpenQuestionChart Component
// ============================================================================

// Chart rendering constants
const CHART_ROW_HEIGHT = 40;
const CHART_BASE_HEIGHT = 60;

const OPEN_QUESTION_CHART_CONFIG: ChartConfig = {
  count: {
    label: "Số phản hồi",
    color: "#1d4ed8",
  },
} satisfies ChartConfig;

interface OpenQuestionChartProps {
  question: AggregatedTextQuestion;
}

const OpenQuestionChart: React.FC<OpenQuestionChartProps> = ({ question }) => {
  const chartData = useMemo(() => {
    if (!question.Answers || question.Answers.length === 0) return [];
    return question.Answers.map((answer) => ({
      text: answer.Content,
      count: answer.Frequency,
    }));
  }, [question]);

  return (
    <div className="space-y-2">
      <p className="text-base font-medium text-gray-800 mb-4">{question.Content}</p>

      <div className="w-full">
        {chartData.length === 0 ? (
          <div className="flex h-16 items-center justify-center text-xs text-slate-400">
            Không có phản hồi
          </div>
        ) : (
          <ChartContainer
            config={OPEN_QUESTION_CHART_CONFIG}
            className="w-full"
            style={{ height: chartData.length * CHART_ROW_HEIGHT + CHART_BASE_HEIGHT }}
          >
            <BarChart
              data={chartData}
              layout="vertical"
              margin={{ top: 5, right: 16, left: 0, bottom: 5 }}
            >
              <CartesianGrid horizontal={true} vertical={false} stroke="#f3f4f6" strokeDasharray="0" />
              <XAxis
                type="number"
                tick={{ fontSize: 11 }}
                allowDecimals={false}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                dataKey="text"
                type="category"
                width={130}
                tick={{ fontSize: 11 }}
                interval={0}
                axisLine={false}
                tickLine={false}
              />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]} maxBarSize={28} />
            </BarChart>
          </ChartContainer>
        )}
      </div>
    </div>
  );
};

// ============================================================================
// SurveyResultsContent Component
// ============================================================================

export const SurveyResultsContent: React.FC<SurveyResultsContentProps> = ({
  campaignId,
  enabled,
}) => {
  const { data: response, isLoading, error } = useQuery({
    queryKey: ["surveyCampaign", "aggregatedResults", campaignId],
    queryFn: () => surveyCampaignService.getAggregatedResults(campaignId),
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const aggregated = response?.Data;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
          <p className="text-sm text-slate-500">Đang tải kết quả khảo sát...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-slate-500">
        <AlertCircle className="w-8 h-8" />
        <p>Không thể tải kết quả khảo sát</p>
      </div>
    );
  }

  if (!aggregated || !aggregated.Topics || aggregated.Topics.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-slate-500">
        <AlertCircle className="w-8 h-8" />
        <p>Không có dữ liệu</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {aggregated.Topics.map((topic) => (
        <div key={topic.TopicId} className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-200 bg-blue-700 px-4 py-2.5">
            <span className="text-sm font-bold text-white/80">{topic.Sort}.</span>
            <span className="text-sm font-semibold text-white">{topic.Title}</span>
          </div>
          <div className="space-y-4 p-4">
            {/* Rating Questions grouped by Category */}
            {topic.Categories && topic.Categories.length > 0 && (
              <div className="space-y-4">
                {topic.Categories.map((category) => (
                  <div key={category.CategoryId} className="space-y-2">
                    <div className="mb-2 flex items-center gap-2">
                      <div className="h-3.5 w-0.5 shrink-0 rounded-full bg-blue-500" />
                      <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
                        {category.Name}
                      </p>
                    </div>
                    <RatingTable questions={category.Questions} />
                  </div>
                ))}
              </div>
            )}

            {/* Open-Ended Questions */}
            {topic.TextQuestions && topic.TextQuestions.length > 0 && (
              <div className="space-y-3 border-t border-slate-100 pt-4">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-5 bg-blue-600 rounded shrink-0" />
                  <p className="text-sm font-bold text-blue-600 uppercase tracking-wider">
                    Câu hỏi mở
                  </p>
                </div>
                {topic.TextQuestions.map((question) => (
                  <OpenQuestionChart key={question.TextQuestionId} question={question} />
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default SurveyResultsContent;
