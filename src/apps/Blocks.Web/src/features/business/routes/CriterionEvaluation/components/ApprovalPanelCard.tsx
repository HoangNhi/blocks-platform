import {
  Check,
  CheckCircle,
  Loader2,
  Target,
  ThumbsUp,
  AlertCircle,
  Lightbulb,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FrameworkType } from "../../../types/criterionEvaluation.types";
import { AUN_SCORE_CONFIG } from "../../../types/criterionEvaluation.types";
import { getApprovalPanelMode, getOfficialResultDisplay } from "../utils/resultDisplay";

const SCORE_OPTIONS = [1, 2, 3, 4, 5, 6, 7];
const PASS_TEXT = "ĐẠT";
const FAIL_TEXT = "KHÔNG ĐẠT";

interface ApprovalPanelCardProps {
  framework: FrameworkType;
  isApproved: boolean;
  canApprove: boolean;
  officialScore: number | null;
  officialResult: boolean | null;
  isApproving: boolean;
  officialCurrentState: string;
  officialStrengths: string;
  officialWeaknesses: string;
  officialActionPlan: string;
  onOfficialCurrentStateChange: (v: string) => void;
  onOfficialStrengthsChange: (v: string) => void;
  onOfficialWeaknessesChange: (v: string) => void;
  onOfficialActionPlanChange: (v: string) => void;
  onOfficialScoreChange: (score: number | null) => void;
  onOfficialResultChange: (result: boolean | null) => void;
  onApprove: () => void;
}

function getResultToneClass(text: string): string {
  if (text === PASS_TEXT) return "bg-emerald-500/20 text-emerald-300 border-emerald-400/30";
  if (text === FAIL_TEXT) return "bg-red-500/20 text-red-300 border-red-400/30";
  return "bg-slate-500/20 text-slate-200 border-slate-400/30";
}

const textareaClass =
  "w-full text-sm p-3 rounded-xl bg-slate-700 border border-slate-600 text-white placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-500 outline-none resize-y leading-relaxed";

export function ApprovalPanelCard({
  framework,
  isApproved,
  canApprove,
  officialScore,
  officialResult,
  isApproving,
  officialCurrentState,
  officialStrengths,
  officialWeaknesses,
  officialActionPlan,
  onOfficialCurrentStateChange,
  onOfficialStrengthsChange,
  onOfficialWeaknessesChange,
  onOfficialActionPlanChange,
  onOfficialScoreChange,
  onOfficialResultChange,
  onApprove,
}: ApprovalPanelCardProps) {
  const mode = getApprovalPanelMode({ isApproved, canApprove });
  const resultDisplay = getOfficialResultDisplay({
    framework,
    status: isApproved ? 3 : 0,
    officialScore,
    officialResult,
  });
  const aunLabel =
    framework === "AUN" && officialScore != null
      ? (AUN_SCORE_CONFIG[officialScore] ?? AUN_SCORE_CONFIG[4]).label
      : null;

  const allTextFilled =
    officialCurrentState.trim().length > 0 &&
    officialStrengths.trim().length > 0 &&
    officialWeaknesses.trim().length > 0 &&
    officialActionPlan.trim().length > 0;

  const scoreSelected =
    framework === "AUN" ? officialScore != null : officialResult != null;

  return (
    <div className="bg-slate-800 p-6 rounded-[20px] shadow-xl border border-slate-700/80 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-bl-full pointer-events-none" />
      <div className="relative z-10 flex flex-col gap-4">
        <div>
          <h3 className="font-bold text-white mb-1 flex items-center gap-2 text-base">
            <CheckCircle className="w-5 h-5 text-emerald-400" />
            {"Chốt & Phê duyệt"}
          </h3>
          <p className="text-sm text-slate-300 leading-relaxed">
            {canApprove
              ? "Dành cho Chủ tịch HĐ. Xem xét ý kiến và chốt nội dung chính thức."
              : "Kết quả chốt cuối hiển thị cho tất cả thành viên hội đồng."}
          </p>
        </div>

        {mode === "approved-readonly" && (
          <div className="space-y-2">
            <p className="text-sm text-emerald-400 font-semibold text-center py-1">
              ✓ Đã duyệt
            </p>
            <div className="flex items-center justify-center">
              <span
                className={`text-sm font-bold px-3 py-1.5 rounded-lg border ${getResultToneClass(resultDisplay.text)}`}
              >
                {resultDisplay.text}
              </span>
            </div>
            {aunLabel && (
              <p className="text-xs text-slate-300 text-center">{aunLabel}</p>
            )}
          </div>
        )}

        {mode === "pending-readonly" && (
          <p className="text-sm text-slate-200 font-medium text-center py-2">
            Đang chờ Chủ tịch/PCT chốt kết quả.
          </p>
        )}

        {mode === "approver-edit" && (
          <div className="flex flex-col gap-4">
            {framework === "AUN" ? (
              <select
                value={officialScore ?? ""}
                onChange={(e) =>
                  onOfficialScoreChange(
                    e.target.value ? Number(e.target.value) : null,
                  )
                }
                disabled={isApproving}
                className="w-full text-sm p-3 border border-slate-600 bg-slate-700 text-white rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold shadow-inner cursor-pointer disabled:opacity-50"
              >
                <option value="">{"-- Chọn điểm chốt --"}</option>
                {SCORE_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s} — {AUN_SCORE_CONFIG[s].label}
                  </option>
                ))}
              </select>
            ) : (
              <select
                value={
                  officialResult === true
                    ? "PASS"
                    : officialResult === false
                      ? "FAIL"
                      : ""
                }
                onChange={(e) =>
                  onOfficialResultChange(
                    e.target.value === "PASS"
                      ? true
                      : e.target.value === "FAIL"
                        ? false
                        : null,
                  )
                }
                disabled={isApproving}
                className="w-full text-sm p-3 border border-slate-600 bg-slate-700 text-white rounded-xl focus:ring-2 focus:ring-emerald-500 outline-none font-bold shadow-inner cursor-pointer disabled:opacity-50"
              >
                <option value="">{"-- Chọn kết quả --"}</option>
                <option value="PASS">ĐẠT YÊU CẦU</option>
                <option value="FAIL">KHÔNG ĐẠT</option>
              </select>
            )}

            <div>
              <label className="flex items-center gap-1.5 mb-1.5 text-xs font-bold text-slate-300 uppercase tracking-wider">
                <Target className="w-3.5 h-3.5 text-blue-400" />
                Mô tả thực trạng *
              </label>
              <textarea
                rows={3}
                value={officialCurrentState}
                onChange={(e) => onOfficialCurrentStateChange(e.target.value)}
                disabled={isApproving}
                placeholder="Nhập mô tả thực trạng chính thức..."
                className={textareaClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="flex items-center gap-1.5 mb-1.5 text-xs font-bold text-slate-300 uppercase tracking-wider">
                  <ThumbsUp className="w-3.5 h-3.5 text-emerald-400" />
                  Điểm mạnh *
                </label>
                <textarea
                  rows={4}
                  value={officialStrengths}
                  onChange={(e) => onOfficialStrengthsChange(e.target.value)}
                  disabled={isApproving}
                  placeholder="Nhập điểm mạnh..."
                  className={textareaClass}
                />
              </div>
              <div>
                <label className="flex items-center gap-1.5 mb-1.5 text-xs font-bold text-slate-300 uppercase tracking-wider">
                  <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                  Điểm tồn tại *
                </label>
                <textarea
                  rows={4}
                  value={officialWeaknesses}
                  onChange={(e) => onOfficialWeaknessesChange(e.target.value)}
                  disabled={isApproving}
                  placeholder="Nhập điểm tồn tại..."
                  className={textareaClass}
                />
              </div>
            </div>

            <div>
              <label className="flex items-center gap-1.5 mb-1.5 text-xs font-bold text-slate-300 uppercase tracking-wider">
                <Lightbulb className="w-3.5 h-3.5 text-purple-400" />
                Kế hoạch cải tiến *
              </label>
              <textarea
                rows={3}
                value={officialActionPlan}
                onChange={(e) => onOfficialActionPlanChange(e.target.value)}
                disabled={isApproving}
                placeholder="Nhập kế hoạch cải tiến..."
                className={textareaClass}
              />
            </div>

            <Button
              onClick={onApprove}
              disabled={isApproving || !allTextFilled || !scoreSelected}
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-3 rounded-xl text-sm font-bold transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2"
            >
              {isApproving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              Duyệt
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
