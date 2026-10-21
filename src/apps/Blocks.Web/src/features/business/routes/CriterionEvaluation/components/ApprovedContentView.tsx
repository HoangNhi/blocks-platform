import {
  CheckCircle,
  Target,
  ThumbsUp,
  AlertCircle,
  Lightbulb,
} from "lucide-react";
import type { ReactNode } from "react";
import type {
  FrameworkType,
  OfficialDescriptiveFields,
} from "../../../types/criterionEvaluation.types";
import { AUN_SCORE_CONFIG } from "../../../types/criterionEvaluation.types";

interface ApprovedContentViewProps {
  officialFields: OfficialDescriptiveFields;
  framework: FrameworkType;
  officialScore: number | null;
  officialResult: boolean | null;
}

export function ApprovedContentView({
  officialFields,
  framework,
  officialScore,
  officialResult,
}: ApprovedContentViewProps) {
  const scoreConfig =
    framework === "AUN" && officialScore != null
      ? (AUN_SCORE_CONFIG[officialScore] ?? AUN_SCORE_CONFIG[4])
      : null;

  const resultText =
    framework === "MOET"
      ? officialResult === true
        ? "ĐẠT YÊU CẦU"
        : officialResult === false
          ? "KHÔNG ĐẠT"
          : null
      : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 p-4 rounded-[20px]">
        <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
          <CheckCircle className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <p className="font-bold text-emerald-800 text-base">
            Kết quả chính thức đã được phê duyệt
          </p>
        </div>
        {scoreConfig && (
          <span
            className={`text-sm font-bold px-3 py-1.5 rounded-lg ${scoreConfig.bgClass} ${scoreConfig.textClass}`}
          >
            {scoreConfig.label} ({officialScore})
          </span>
        )}
        {resultText && (
          <span
            className={`text-sm font-bold px-3 py-1.5 rounded-lg ${
              officialResult
                ? "bg-emerald-100 text-emerald-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            {resultText}
          </span>
        )}
      </div>

      <div className="bg-white border border-slate-200/60 rounded-[20px] shadow-sm p-5 flex flex-col gap-5">
        {officialFields.CurrentState && (
          <FieldBlock
            icon={<Target className="w-4 h-4 text-blue-500" />}
            label="Mô tả thực trạng"
            value={officialFields.CurrentState}
          />
        )}
        <div className="grid grid-cols-2 gap-5">
          {officialFields.Strengths && (
            <FieldBlock
              icon={<ThumbsUp className="w-4 h-4 text-emerald-500" />}
              label="Điểm mạnh"
              value={officialFields.Strengths}
            />
          )}
          {officialFields.Weaknesses && (
            <FieldBlock
              icon={<AlertCircle className="w-4 h-4 text-red-400" />}
              label="Điểm tồn tại"
              value={officialFields.Weaknesses}
            />
          )}
        </div>
        {officialFields.ActionPlan && (
          <FieldBlock
            icon={<Lightbulb className="w-4 h-4 text-purple-500" />}
            label="Kế hoạch cải tiến"
            value={officialFields.ActionPlan}
          />
        )}
      </div>
    </div>
  );
}

function FieldBlock({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        {icon}
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          {label}
        </span>
      </div>
      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap bg-slate-50 rounded-xl p-3 border border-slate-100">
        {value}
      </p>
    </div>
  );
}
