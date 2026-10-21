import { Users, Target, ThumbsUp, AlertCircle, Lightbulb, ClipboardCopy } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getFileUrl } from "@/lib/utils";
import type { ReactNode } from "react";
import type {
  EvaluationSubmission,
  FrameworkType,
} from "../../../types/criterionEvaluation.types";
import { AUN_SCORE_CONFIG } from "../../../types/criterionEvaluation.types";

interface SubmissionsComparisonViewProps {
  submissions: EvaluationSubmission[];
  framework: FrameworkType;
  canApprove: boolean;
  isApproved: boolean;
  onUseDraft: (submission: EvaluationSubmission) => void;
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} phút trước`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} giờ trước`;
  return `${Math.floor(hrs / 24)} ngày trước`;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(-2)
    .join("")
    .toUpperCase();
}

export function SubmissionsComparisonView({
  submissions,
  framework,
  canApprove,
  isApproved,
  onUseDraft,
}: SubmissionsComparisonViewProps) {
  if (submissions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <Users className="w-10 h-10 mb-3 opacity-40" />
        <p className="text-sm font-medium">
          Chưa có thành viên nào gửi phiếu đánh giá.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <Users className="w-5 h-5 text-blue-600" />
        <h3 className="font-bold text-slate-800 text-base">
          Tổng hợp phiếu đánh giá ({submissions.length} phiếu)
        </h3>
      </div>

      {submissions.map((sub) => {
        const scoreConfig =
          framework === "AUN" && sub.ProposedScore != null
            ? (AUN_SCORE_CONFIG[sub.ProposedScore] ?? AUN_SCORE_CONFIG[4])
            : null;

        return (
          <div
            key={sub.Id}
            className="bg-white border border-slate-200/60 rounded-[20px] shadow-sm p-5 flex flex-col gap-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar className="w-9 h-9 rounded-full shrink-0">
                  <AvatarImage
                    src={getFileUrl(sub.EvaluatorAvatar)}
                    alt={sub.EvaluatorName}
                  />
                  <AvatarFallback className="rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
                    {getInitials(sub.EvaluatorName)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-bold text-slate-800">
                    {sub.EvaluatorName}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    {formatTimeAgo(sub.UpdatedAt ?? sub.CreatedAt)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {scoreConfig && (
                  <span
                    className={`text-xs font-bold px-2.5 py-1 rounded-lg ${scoreConfig.bgClass} ${scoreConfig.textClass}`}
                  >
                    {scoreConfig.label} ({sub.ProposedScore})
                  </span>
                )}
                {framework === "MOET" && sub.ProposedResult != null && (
                  <span
                    className={`text-xs font-bold px-2.5 py-1 rounded-lg ${
                      sub.ProposedResult
                        ? "bg-emerald-100/80 text-emerald-700"
                        : "bg-red-100 text-red-700"
                    }`}
                  >
                    {sub.ProposedResult ? "ĐẠT" : "KHÔNG ĐẠT"}
                  </span>
                )}
              </div>
            </div>

            <div className="h-px bg-slate-100" />

            <div className="grid grid-cols-1 gap-4">
              {sub.CurrentState && (
                <FieldBlock
                  icon={<Target className="w-4 h-4 text-blue-500" />}
                  label="Mô tả thực trạng"
                  value={sub.CurrentState}
                />
              )}
              <div className="grid grid-cols-2 gap-4">
                {sub.Strengths && (
                  <FieldBlock
                    icon={<ThumbsUp className="w-4 h-4 text-emerald-500" />}
                    label="Điểm mạnh"
                    value={sub.Strengths}
                  />
                )}
                {sub.Weaknesses && (
                  <FieldBlock
                    icon={<AlertCircle className="w-4 h-4 text-red-400" />}
                    label="Điểm tồn tại"
                    value={sub.Weaknesses}
                  />
                )}
              </div>
              {sub.ActionPlan && (
                <FieldBlock
                  icon={<Lightbulb className="w-4 h-4 text-purple-500" />}
                  label="Kế hoạch cải tiến"
                  value={sub.ActionPlan}
                />
              )}
            </div>

            {canApprove && !isApproved && (
              <div className="flex justify-end pt-1">
                <button
                  onClick={() => onUseDraft(sub)}
                  className="flex items-center gap-2 text-xs font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-2 rounded-lg transition-colors"
                  title="Điền nội dung phiếu này vào ô soạn thảo bên phải"
                >
                  <ClipboardCopy className="w-3.5 h-3.5" />
                  Dùng phiếu này làm bản nháp
                </button>
              </div>
            )}
          </div>
        );
      })}
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
      <div className="flex items-center gap-1.5 mb-1.5">
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
