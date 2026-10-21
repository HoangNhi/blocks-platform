import {
  AUN_SCORE_CONFIG,
  type CriterionEvaluationSummary,
  type FrameworkType,
} from "../../../types/criterionEvaluation.types";

interface SummaryBarProps {
  summary: CriterionEvaluationSummary | null;
  filterSlot?: React.ReactNode;
  framework?: FrameworkType;
}

export function SummaryBar({ summary, filterSlot, framework }: SummaryBarProps) {
  if (!summary) return null;

  const progressPercent =
    summary.TotalCriteria > 0
      ? Math.round((summary.ApprovedCriteria / summary.TotalCriteria) * 100)
      : 0;

  const prerequisiteFailed =
    summary.PrerequisiteTotal - summary.PrerequisitePassed;

  const getVerdictColor = (verdict: string | null | undefined) => {
    if (!verdict) return "bg-gray-100 text-gray-600";
    if (verdict === "Đạt") return "bg-emerald-100 text-emerald-700";
    if (verdict === "Đạt có điều kiện") return "bg-amber-100 text-amber-700";
    if (verdict === "Không đạt") return "bg-red-100 text-red-700";
    return "bg-gray-100 text-gray-600";
  };

  const getAunVerdictColor = (verdict: number | null | undefined) => {
    if (verdict == null) return "bg-gray-100 text-gray-600";
    const config = AUN_SCORE_CONFIG[verdict] ?? AUN_SCORE_CONFIG[4];
    return `${config.bgClass} ${config.textClass}`;
  };

  return (
    <div className="sticky top-0 z-10 bg-background border-b px-6 py-3 shadow-sm">
      <div className="flex flex-wrap items-center gap-4">
        {/* AUN Program Verdict */}
        {framework === "AUN" && (
          <div
            className={`text-sm font-medium px-2.5 py-1 rounded-full ${getAunVerdictColor(summary.AunProgramVerdict)}`}
          >
            {summary.AunProgramVerdict == null
              ? "Chưa có kết quả"
              : `${summary.AunProgramVerdict}/7`}
          </div>
        )}

        {/* MOET Program Verdict */}
        {framework === "MOET" && (
          <div className={`text-sm font-medium px-2.5 py-1 rounded-full ${getVerdictColor(summary.MoetProgramVerdict)}`}>
            {summary.MoetProgramVerdict || "Chưa có kết quả"}
          </div>
        )}

        {/* Progress */}
        <div className="flex items-center gap-2 min-w-[200px]">
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            Tiến độ
          </span>
          <div className="flex-1 bg-muted rounded-full h-2 min-w-[100px]">
            <div
              className="bg-green-500 h-2 rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="text-xs font-medium whitespace-nowrap">
            {summary.ApprovedCriteria}/{summary.TotalCriteria}
          </span>
        </div>

        {/* Prerequisite */}
        <div
          className={`flex items-center gap-1.5 text-sm ${
            prerequisiteFailed > 0 ? "text-red-600" : "text-muted-foreground"
          }`}
        >
          <span className="text-base">⚡</span>
          <span>
            Tiêu chí điều kiện:{" "}
            <span
              className={`font-medium ${prerequisiteFailed > 0 ? "text-red-600" : "text-green-600"}`}
            >
              {summary.PrerequisitePassed}/{summary.PrerequisiteTotal}
            </span>
          </span>
          {prerequisiteFailed > 0 && (
            <span className="text-xs bg-red-100 text-red-700 rounded px-1.5 py-0.5">
              {prerequisiteFailed} chưa đạt
            </span>
          )}
        </div>

        {/* Failed counts */}
        {(summary.FailedCriteria > 0 || summary.FailedStandards > 0) && (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>
              Tiêu chí không đạt:{" "}
              <span className="font-medium text-red-600">
                {summary.FailedCriteria}
              </span>
            </span>
            <span>
              Tiêu chuẩn không đạt:{" "}
              <span className="font-medium text-red-600">
                {summary.FailedStandards}
              </span>
            </span>
          </div>
        )}

        {/* Spacer + filter slot */}
        {filterSlot && (
          <>
            <div className="flex-1" />
            {filterSlot}
          </>
        )}
      </div>

      {/* Previous Cycle Comparison */}
      {summary.PreviousCycleId && (
        <div className="flex flex-wrap items-center gap-3 px-6 py-2 border-t border-muted text-xs text-muted-foreground">
          <span className="font-medium">vs {summary.PreviousCycleName}:</span>

          {/* Previous verdict (MOET only) */}
          {framework === "MOET" && summary.PreviousMoetProgramVerdict && (
            <span className={`px-2 py-0.5 rounded-full font-medium ${getVerdictColor(summary.PreviousMoetProgramVerdict)}`}>
              {summary.PreviousMoetProgramVerdict}
            </span>
          )}

          {/* Improvement count */}
          {(summary.ImprovedCriteria ?? 0) > 0 && (
            <span className="text-emerald-600 font-medium">
              ↑ {summary.ImprovedCriteria} cải thiện
            </span>
          )}

          {/* Regression count */}
          {(summary.RegressedCriteria ?? 0) > 0 && (
            <span className="text-red-600 font-medium">
              ↓ {summary.RegressedCriteria} giảm
            </span>
          )}

          {/* No change */}
          {(summary.ImprovedCriteria ?? 0) === 0 && (summary.RegressedCriteria ?? 0) === 0 && (
            <span className="text-muted-foreground">→ Không thay đổi</span>
          )}
        </div>
      )}
    </div>
  );
}
