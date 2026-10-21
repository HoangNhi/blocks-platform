import { useState } from "react";
import { ChevronDown, ChevronRight, Zap } from "lucide-react";
import type {
  CriterionEvaluationItem,
  EvaluationStatus,
  FrameworkType,
  StandardEvaluationGroup,
} from "../../../types/criterionEvaluation.types";
import {
  EVALUATION_STATUS_CONFIG,
  AUN_SCORE_CONFIG,
} from "../../../types/criterionEvaluation.types";

interface CriteriaGridProps {
  groups: StandardEvaluationGroup[];
  framework: FrameworkType;
  assignedStandardIds?: Set<string>;
  onRowClick: (item: CriterionEvaluationItem) => void;
}

function StatusBadge({ status }: { status: EvaluationStatus }) {
  const config = EVALUATION_STATUS_CONFIG[status];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${config.color}`}
    >
      {config.label}
    </span>
  );
}

function EvidenceCell({
  evidenceCount,
  missingCount,
}: {
  evidenceCount: number;
  missingCount: number;
}) {
  if (evidenceCount === 0) {
    return <span className="text-muted-foreground text-sm">—</span>;
  }
  if (missingCount === 0) {
    return <span className="text-emerald-600 text-sm font-medium">{evidenceCount} MC</span>;
  }
  return (
    <span className="text-red-600 text-sm font-medium">
      {evidenceCount} MC · thiếu {missingCount}
    </span>
  );
}

function SubmissionProgressCell({
  submissionCount,
  totalEvaluators,
}: {
  submissionCount: number | undefined;
  totalEvaluators: number;
}) {
  const count = submissionCount ?? 0;
  if (totalEvaluators === 0) {
    return <span className="text-muted-foreground text-sm">—</span>;
  }
  const isComplete = count >= totalEvaluators;
  return (
    <span className={`text-sm font-medium ${isComplete ? "text-emerald-600" : "text-slate-600"}`}>
      {count}/{totalEvaluators} TVH
    </span>
  );
}

function OfficialScoreCell({
  item,
  framework,
}: {
  item: CriterionEvaluationItem;
  framework: FrameworkType;
}) {
  if (item.Status !== 3) return <span className="text-muted-foreground">—</span>;

  if (framework === "AUN" && item.OfficialScore != null) {
    const config = AUN_SCORE_CONFIG[item.OfficialScore] || AUN_SCORE_CONFIG[4];
    return (
      <span
        className={`px-2 py-1 rounded text-xs font-semibold whitespace-nowrap ${config.bgClass} ${config.textClass}`}
      >
        {item.OfficialScore}/7
      </span>
    );
  }
  if (framework === "MOET") {
    if (item.OfficialResult === true) {
      return (
        <span className="text-green-600 font-medium">{"\u0110\u1ea0T"}</span>
      );
    }
    if (item.OfficialResult === false) {
      return (
        <span className="text-red-600 font-medium">{"KH\u00d4NG \u0110\u1ea0T"}</span>
      );
    }
  }
  return <span className="text-muted-foreground">—</span>;
}

function StandardGroupRow({
  group,
  framework,
  assignedStandardIds,
  onRowClick,
}: {
  group: StandardEvaluationGroup;
  framework: FrameworkType;
  assignedStandardIds?: Set<string>;
  onRowClick: (item: CriterionEvaluationItem) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const isAssigned = assignedStandardIds?.has(group.StandardId) ?? false;

  return (
    <>
      {/* Standard group header */}
      <tr
        className={`cursor-pointer hover:bg-muted select-none ${
          isAssigned ? "bg-muted/60 border-l-4 border-l-blue-500" : "bg-muted/40"
        }`}
        onClick={() => setCollapsed((c) => !c)}
      >
        <td colSpan={6} className="px-4 py-2">
          <div className="flex items-center gap-2">
            {collapsed ? (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="font-semibold text-sm">
              {group.StandardCode} — {group.StandardName}
            </span>
            {isAssigned && (
              <span className="text-xs font-medium bg-blue-100 text-blue-700 rounded px-2 py-0.5 ml-2">
                Phụ trách
              </span>
            )}
            <span className="text-xs text-muted-foreground ml-2">
              {group.ApprovedCount}/{group.TotalCount} duyệt
            </span>
            {framework === "AUN" && group.StandardScore != null && (
              <span
                className={`ml-auto text-xs font-medium rounded px-2 py-0.5 ${
                  (AUN_SCORE_CONFIG[group.StandardScore] ?? AUN_SCORE_CONFIG[4]).bgClass
                } ${
                  (AUN_SCORE_CONFIG[group.StandardScore] ?? AUN_SCORE_CONFIG[4]).textClass
                }`}
              >
                {group.StandardScore}/7
              </span>
            )}
            {framework === "MOET" && group.ApprovedCount > 0 && (
              <span
                className={`ml-auto text-xs font-medium rounded px-2 py-0.5 ${
                  group.IsPassed
                    ? "bg-green-100 text-green-700"
                    : "bg-red-100 text-red-700"
                }`}
              >
                {group.IsPassed ? "Đạt" : "Không đạt"}
              </span>
            )}
          </div>
        </td>
      </tr>

      {/* Criterion rows */}
      {!collapsed &&
        group.Items.map((item) => (
          <tr
            key={item.Id}
            className="hover:bg-muted/40 cursor-pointer border-b border-border/50"
            onClick={() => onRowClick(item)}
          >
            <td className="px-4 py-2.5 text-sm">
              <div className="flex items-center gap-1.5">
                {item.IsPrerequisite && (
                  <Zap className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />
                )}
                <span className="font-mono text-xs text-muted-foreground">
                  {item.CriterionCode}
                </span>
              </div>
            </td>
            <td className="px-4 py-2.5 text-sm max-w-[300px]">
              <span className="line-clamp-2">{item.CriterionName}</span>
            </td>
            <td className="px-4 py-2.5">
              <StatusBadge status={item.Status} />
            </td>
            <td className="px-4 py-2.5 text-sm">
              <EvidenceCell evidenceCount={item.EvidenceCount} missingCount={item.MissingEvidenceCount} />
            </td>
            <td className="px-4 py-2.5 text-sm">
              <SubmissionProgressCell submissionCount={item.SubmissionCount} totalEvaluators={item.TotalEvaluators} />
            </td>
            <td className="px-4 py-2.5 text-sm">
              <OfficialScoreCell item={item} framework={framework} />
            </td>
          </tr>
        ))}
    </>
  );
}

export function CriteriaGrid({ groups, framework, assignedStandardIds, onRowClick }: CriteriaGridProps) {
  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <p className="text-sm">Chưa có dữ liệu đánh giá.</p>
        <p className="text-xs mt-1">
          Vui lòng khởi tạo hoặc chọn chu kỳ đang thực hiện.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b bg-muted/30">
            <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground w-[100px]">
              Mã TC
            </th>
            <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground">
              Nội dung tiêu chí
            </th>
            <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground w-[140px]">
              Trạng thái
            </th>
            <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground w-[130px]">
              Minh chứng
            </th>
            <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground w-[110px]">
              Tiến độ phiếu
            </th>
            <th className="px-4 py-2.5 text-xs font-medium text-muted-foreground w-[100px]">
              {"K\u1ebft qu\u1ea3"}
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <StandardGroupRow
              key={group.StandardId}
              group={group}
              framework={framework}
              assignedStandardIds={assignedStandardIds}
              onRowClick={onRowClick}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
