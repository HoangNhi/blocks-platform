import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  evidenceCycleMapService,
  type VerifiedFileTypeCount,
} from "@/features/business/api/evidenceCycleMap.api";
import {
  ChevronRight,
  CheckCircle2,
  MinusCircle,
  XCircle,
  ShieldCheck,
  ShieldAlert,
  Clock,
  FileText,
  Check,
  X,
  Zap,
  Filter,
  Layers,
} from "lucide-react";
import {
  useStandardsWithCriteria,
  getCriterionStatus,
  getStandardStatus,
  type CriterionStatus,
  type FilterMode,
} from "@/features/catalog/hooks/useStandardsWithCriteria";
import type {
  Standard,
  Criterion,
} from "@/features/catalog/types/standard.types";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { fileTypeService } from "@/features/catalog/api/filetype.api";
import type { ModelCombobox } from "@/types/base/base.types";

// --- Props ---

interface StandardCriteriaTableProps {
  /** Existing: fetch by cycleId (used when standards is not provided) */
  cycleId?: string;
  /** Standard set id for criteria query */
  standardSetId?: string;
  fileTypeId?: string;
  selectedFileTypeId?: string;
  label?: string;
  emptyMessage?: string;
  /** New: pass standards directly (bypasses hook fetching) */
  standards?: Standard[];
  /** New: toggle summary cards visibility (default true) */
  showSummaryCards?: boolean;
  /** New: toggle progress bar visibility (default true) */
  showProgressBar?: boolean;
  /** Standard IDs assigned to the current user (Provider focus) */
  assignedStandardIds?: string[];
}

// --- Small Sub-components ---

const Badge = ({
  children,
  variant = "default",
}: {
  children: React.ReactNode;
  variant?: "default" | "green" | "red" | "amber" | "blue";
}) => {
  const styles: Record<string, string> = {
    default: "bg-slate-100 text-slate-600 border-slate-200",
    green: "bg-emerald-50 text-emerald-700 border-emerald-200",
    red: "bg-red-50 text-red-600 border-red-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md border ${styles[variant]}`}
    >
      {children}
    </span>
  );
};

const ProgressRing = ({
  current,
  total,
  size = 32,
}: {
  current: number;
  total: number;
  size?: number;
}) => {
  const pct = total === 0 ? 0 : Math.round((current / total) * 100);
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (pct / 100) * circ;
  const color = pct === 100 ? "#10b981" : pct > 0 ? "#f59e0b" : "#e2e8f0";
  const textColor = pct === 100 ? "#059669" : pct > 0 ? "#d97706" : "#94a3b8";
  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#f1f5f9"
          strokeWidth={3}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={3}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      <span
        className="absolute text-[9px] font-bold"
        style={{ color: textColor }}
      >
        {pct}%
      </span>
    </div>
  );
};

const StatusIcon = ({
  status,
  size = 16,
}: {
  status: CriterionStatus;
  size?: number;
}) => {
  if (status === "satisfied")
    return <CheckCircle2 size={size} className="text-emerald-500" />;
  if (status === "pending")
    return <Clock size={size} className="text-blue-400" />;
  if (status === "partial")
    return <MinusCircle size={size} className="text-amber-500" />;
  return <XCircle size={size} className="text-slate-300" />;
};

const MiniBar = ({
  current,
  total,
  projected,
}: {
  current: number;
  total: number;
  projected?: number;
}) => {
  const pct =
    total === 0 ? 0 : Math.min(100, Math.round((current / total) * 100));
  const projectedPct =
    projected !== undefined && total > 0
      ? Math.min(100, Math.round((projected / total) * 100))
      : pct;
  const ghostPct = Math.max(0, projectedPct - pct);

  const bg =
    pct === 100 ? "bg-emerald-500" : pct > 0 ? "bg-amber-400" : "bg-slate-200";

  return (
    <div className="flex items-center gap-2 flex-1">
      <div className="h-1.5 flex-1 bg-slate-100 rounded-full overflow-hidden flex">
        <div
          className={`h-full transition-all duration-500 ${bg} ${ghostPct > 0 ? "rounded-l-full" : "rounded-full"}`}
          style={{ width: `${pct}%` }}
        />
        {ghostPct > 0 && (
          <div
            className="h-full"
            style={{
              width: `${ghostPct}%`,
              background: "rgba(124, 58, 237, 0.45)",
              animation: "projected-pulse 2s ease-in-out infinite",
              borderRadius: projectedPct >= 100 ? "0 9999px 9999px 0" : "0",
            }}
          />
        )}
      </div>
      <span className="text-[10px] font-mono tabular-nums whitespace-nowrap">
        {ghostPct > 0 ? (
          <>
            <span className="text-violet-600 font-semibold">{projected}</span>
            <span className="text-slate-400">/{total}</span>
          </>
        ) : (
          <span className="text-slate-400">
            {current}/{total}
          </span>
        )}
      </span>
    </div>
  );
};

// --- CSS Animations (injected once) ---

const AnimationStyles = () => (
  <style>{`
    @keyframes highlight-pulse {
      0% { background-color: rgba(139, 92, 246, 0.25); }
      100% { background-color: rgba(139, 92, 246, 0.06); }
    }
    @keyframes req-glow {
      0% { box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.4); }
      100% { box-shadow: 0 0 0 0 rgba(139, 92, 246, 0); }
    }
    @keyframes fade-in-up {
      0% { opacity: 0; transform: translateY(4px); }
      100% { opacity: 1; transform: translateY(0); }
    }
    @keyframes projected-pulse {
      0%, 100% { opacity: 0.45; }
      50% { opacity: 0.8; }
    }
  `}</style>
);

// --- Main Component ---

const StandardCriteriaTable = ({
  cycleId,
  standardSetId,
  fileTypeId,
  selectedFileTypeId,
  emptyMessage = "Vui lòng chọn chu kỳ.",
  standards: externalStandards,
  showSummaryCards = true,
  showProgressBar = true,
  assignedStandardIds = [],
}: StandardCriteriaTableProps) => {
  const isExternalMode = !!externalStandards;
  const [filterAssigned, setFilterAssigned] = useState(false);
  const hasAssignment = assignedStandardIds.length > 0;

  // --- Hook-based mode (existing behavior) ---
  const hookResult = useStandardsWithCriteria(
    isExternalMode ? "" : standardSetId || "",
    isExternalMode ? undefined : fileTypeId,
  );

  // Fetch VERIFIED evidence counts per FileType for the current cycle
  const { data: verifiedCountsResponse } = useQuery({
    queryKey: ["verifiedFileTypeCounts", cycleId],
    queryFn: () => evidenceCycleMapService.getVerifiedFileTypeCounts(cycleId!),
    enabled: !isExternalMode && !!cycleId,
  });

  const countMap = useMemo<Map<string, number>>(() => {
    const map = new Map<string, number>();
    if (verifiedCountsResponse?.Success && verifiedCountsResponse.Data) {
      verifiedCountsResponse.Data.forEach((item: VerifiedFileTypeCount) => {
        map.set(item.FileTypeId, item.Count);
      });
    }
    return map;
  }, [verifiedCountsResponse]);

  const pendingCountMap = useMemo<Map<string, number>>(() => {
    const map = new Map<string, number>();
    if (verifiedCountsResponse?.Success && verifiedCountsResponse.Data) {
      verifiedCountsResponse.Data.forEach((item: VerifiedFileTypeCount) => {
        if (item.PendingCount > 0) map.set(item.FileTypeId, item.PendingCount);
      });
    }
    return map;
  }, [verifiedCountsResponse]);

  const evidenceMap = useMemo<Map<string, { name: string; code: string }[]>>(
    () => {
      const map = new Map<string, { name: string; code: string }[]>();
      if (verifiedCountsResponse?.Success && verifiedCountsResponse.Data) {
        verifiedCountsResponse.Data.forEach((item: VerifiedFileTypeCount) => {
          map.set(
            item.FileTypeId,
            (item.Evidences ?? []).map((e) => ({ name: e.Name, code: e.Code })),
          );
        });
      }
      return map;
    },
    [verifiedCountsResponse],
  );

  // --- File Types Fetching ---
  const { data: fileTypesResponse } = useQuery({
    queryKey: ["fileTypesCombobox"],
    queryFn: () => fileTypeService.getAllCombobox(),
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  const fileTypeMap = useMemo(() => {
    const map: Record<string, string> = {};
    if (fileTypesResponse?.Success && fileTypesResponse.Data) {
      fileTypesResponse.Data.forEach((ft: ModelCombobox) => {
        if (ft.Value && ft.Text) {
          map[ft.Value] = ft.Text;
        }
      });
    }
    return map;
  }, [fileTypesResponse]);

  // --- Local state for external standards mode ---
  const [localExpandedIds, setLocalExpandedIds] = useState<
    Record<string, boolean>
  >({});
  const [localAutoExpandEnabled, setLocalAutoExpandEnabled] = useState(true);

  // Initialize expansion when external standards change
  useEffect(() => {
    if (externalStandards) {
      const expanded: Record<string, boolean> = {};
      externalStandards.forEach((s) => {
        expanded[s.Id] = true;
      });
      setLocalExpandedIds(expanded);
      setLocalAutoExpandEnabled(true);
    }
  }, [externalStandards]);

  const localToggle = useCallback((id: string) => {
    setLocalExpandedIds((prev) => ({
      ...prev,
      [id]: !(prev[id] ?? true),
    }));
  }, []);

  const localExpandAll = useCallback(() => {
    if (!externalStandards) return;
    const all: Record<string, boolean> = {};
    externalStandards.forEach((s) => {
      all[s.Id] = true;
    });
    setLocalExpandedIds(all);
    setLocalAutoExpandEnabled(true);
  }, [externalStandards]);

  const localCollapseAll = useCallback(() => {
    if (!externalStandards) return;
    const allCollapsed: Record<string, boolean> = {};
    externalStandards.forEach((s) => {
      allCollapsed[s.Id] = false;
    });
    setLocalExpandedIds(allCollapsed);
    setLocalAutoExpandEnabled(false);
  }, [externalStandards]);

  // --- Filter mode and filtered standards (must be declared before "const standards") ---
  const { filterMode, setFilterMode } = hookResult;

  // Compute filtered standards locally so filter buttons use correct evidence-aware status
  const filteredStandardsLocal = useMemo(() => {
    const src = hookResult.standardsWithCriteria;
    if (filterMode === "all") return src;
    return src
      .map((std) => ({
        ...std,
        Criterions: (std.Criterions || []).filter(
          (c) => getCriterionStatus(c, countMap, pendingCountMap) === filterMode,
        ),
      }))
      .filter((std) => (std.Criterions || []).length > 0);
  }, [hookResult.standardsWithCriteria, filterMode, countMap, pendingCountMap]);

  // --- Unified state resolution ---
  const standards = externalStandards || filteredStandardsLocal;

  // --- Provider focus: filter to assigned standards ---
  const displayedStandards = useMemo(() => {
    if (filterAssigned && hasAssignment) {
      return standards.filter((s) => assignedStandardIds.includes(s.Id));
    }
    return standards;
  }, [standards, filterAssigned, hasAssignment, assignedStandardIds]);
  const expandedIds = isExternalMode
    ? localExpandedIds
    : hookResult.expandedStandardIds;
  const toggle = isExternalMode ? localToggle : hookResult.toggleStandard;
  const expandAllFn = isExternalMode ? localExpandAll : hookResult.expandAll;
  const collapseAllFn = isExternalMode
    ? localCollapseAll
    : hookResult.collapseAll;

  // Compute matching IDs
  const matchingCriterionIds = useMemo(() => {
    if (!selectedFileTypeId) return new Set<string>();
    const ids = new Set<string>();
    standards.forEach((std) => {
      (std.Criterions || []).forEach((crit) => {
        if (
          crit.CriterionRequirements?.some(
            (req) => req.FileTypeId === selectedFileTypeId,
          )
        ) {
          ids.add(crit.Id);
        }
      });
    });
    return ids;
  }, [standards, selectedFileTypeId]);

  const matchCount = matchingCriterionIds.size;

  // Auto-expand matching (external mode)
  useEffect(() => {
    if (
      isExternalMode &&
      localAutoExpandEnabled &&
      selectedFileTypeId &&
      externalStandards
    ) {
      setLocalExpandedIds((prev) => {
        const next = { ...prev };
        externalStandards.forEach((std) => {
          if (
            (std.Criterions || []).some((crit) =>
              crit.CriterionRequirements?.some(
                (req) => req.FileTypeId === selectedFileTypeId,
              ),
            )
          ) {
            next[std.Id] = true;
          }
        });
        return next;
      });
    } else if (!isExternalMode) {
      hookResult.autoExpandMatching(selectedFileTypeId);
    }
  }, [
    selectedFileTypeId,
    isExternalMode,
    localAutoExpandEnabled,
    externalStandards,
    hookResult.autoExpandMatching,
  ]);

  // Recompute stats using actual verified + pending evidence counts (fixes bug where stats ignored countMap)
  const stats = useMemo(() => {
    const allCriteria = hookResult.standardsWithCriteria.flatMap(
      (s) => s.Criterions || [],
    );
    return {
      totalCriteria: allCriteria.length,
      satisfiedCriteria: allCriteria.filter(
        (c) => getCriterionStatus(c, countMap, pendingCountMap) === "satisfied",
      ).length,
      pendingCriteria: allCriteria.filter(
        (c) => getCriterionStatus(c, countMap, pendingCountMap) === "pending",
      ).length,
      partialCriteria: allCriteria.filter(
        (c) => getCriterionStatus(c, countMap, pendingCountMap) === "partial",
      ).length,
      emptyCriteria: allCriteria.filter(
        (c) => getCriterionStatus(c, countMap, pendingCountMap) === "empty",
      ).length,
    };
  }, [hookResult.standardsWithCriteria, countMap, pendingCountMap]);

  // --- Loading / Error / Empty states (hook mode only) ---
  if (!isExternalMode) {
    if (hookResult.criteriaLoading) {
      return (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
          Đang tải danh sách tiêu chuẩn...
        </div>
      );
    }

    if (hookResult.criteriaError) {
      return (
        <div className="px-4 py-8 text-center text-sm text-red-500">
          {hookResult.criteriaError}
        </div>
      );
    }

    if (!standardSetId) {
      return (
        <div className="border border-dashed border-slate-200 rounded-xl p-12 flex flex-col items-center justify-center gap-2">
          <Layers size={28} className="text-slate-300" />
          <p className="text-sm text-slate-400">{emptyMessage}</p>
        </div>
      );
    }
  }

  return (
    <div className="flex flex-col">
      <AnimationStyles />

      {/* Summary Cards (hook mode + showSummaryCards) */}
      {showSummaryCards && !isExternalMode && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          {(
            [
              {
                key: "satisfied" as FilterMode,
                icon: ShieldCheck,
                count: stats.satisfiedCriteria,
                label: "Đạt",
                bg: "#d1fae5",
                activeBg: "#ecfdf5",
                activeBorder: "#6ee7b7",
                iconColor: "#059669",
                textColor: "#047857",
              },
              {
                key: "partial" as FilterMode,
                icon: ShieldAlert,
                count: stats.partialCriteria,
                label: "Thiếu",
                bg: "#fef3c7",
                activeBg: "#fffbeb",
                activeBorder: "#fcd34d",
                iconColor: "#d97706",
                textColor: "#b45309",
              },
              {
                key: "pending" as FilterMode,
                icon: Clock,
                count: stats.pendingCriteria,
                label: "Chờ duyệt",
                bg: "#dbeafe",
                activeBg: "#eff6ff",
                activeBorder: "#93c5fd",
                iconColor: "#2563eb",
                textColor: "#1d4ed8",
              },
            ] as const
          ).map(({ key, icon: Icon, count, label, bg, activeBg, activeBorder, iconColor, textColor }) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilterMode(filterMode === key ? "all" : key)}
              className={`flex items-center gap-2 p-2.5 rounded-lg border transition-all cursor-pointer ${filterMode === key
                ? ""
                : "bg-white border-slate-150 hover:bg-opacity-30"
                }`}
              style={
                filterMode === key
                  ? { backgroundColor: activeBg, borderColor: activeBorder }
                  : {}
              }
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ backgroundColor: bg }}
              >
                <Icon size={16} style={{ color: iconColor }} />
              </div>
              <div className="text-left">
                <div
                  className="text-lg font-bold leading-none"
                  style={{ color: textColor }}
                >
                  {count}
                </div>
                <div
                  className="text-[10px] font-medium opacity-70"
                  style={{ color: iconColor }}
                >
                  {label}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Overall Progress (hook mode + showProgressBar) */}
      {showProgressBar && !isExternalMode && (
        <div className="flex items-center gap-3 mb-3 px-1">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-medium text-slate-500">
                Tiến độ chung
              </span>
              <span className="text-[11px] font-bold text-slate-700">
                {stats.satisfiedCriteria}/{stats.totalCriteria} tiêu chí
                {stats.pendingCriteria > 0 && (
                  <span className="text-blue-500 font-normal ml-1">
                    ({stats.pendingCriteria} chờ duyệt)
                  </span>
                )}
              </span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden flex">
              <div
                className="h-full transition-all duration-700 ease-out"
                style={{
                  width: `${stats.totalCriteria ? Math.round((stats.satisfiedCriteria / stats.totalCriteria) * 100) : 0}%`,
                  background: "linear-gradient(90deg, #10b981, #34d399)",
                  borderRadius: stats.pendingCriteria > 0 ? "9999px 0 0 9999px" : "9999px",
                }}
              />
              {stats.pendingCriteria > 0 && (
                <div
                  className="h-full transition-all duration-700 ease-out"
                  style={{
                    width: `${stats.totalCriteria ? Math.round((stats.pendingCriteria / stats.totalCriteria) * 100) : 0}%`,
                    background: "#93c5fd",
                    borderRadius: stats.satisfiedCriteria > 0 ? "0 9999px 9999px 0" : "9999px",
                  }}
                />
              )}
            </div>
          </div>
          <ProgressRing
            current={stats.satisfiedCriteria}
            total={stats.totalCriteria}
            size={38}
          />
        </div>
      )}

      {/* Assignment Banner
      {hasAssignment && (
        <div className="rounded-xl border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 mb-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500 flex items-center justify-center text-white shrink-0 mt-0.5">
              <User size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-blue-800 mb-0.5">
                Phân công của bạn
              </p>
              <p className="text-xs text-blue-600">
                Bạn được phân công cung cấp minh chứng cho{" "}
                <strong>{assignedStandardIds.length} tiêu chuẩn</strong> (
                {
                  standards
                    .filter((s) => assignedStandardIds.includes(s.Id))
                    .flatMap((s) => s.Criterions || []).length
                }{" "}
                tiêu chí). Bạn vẫn có thể upload cho các tiêu chuẩn khác nếu
                cần.
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {standards
                  .filter((s) => assignedStandardIds.includes(s.Id))
                  .map((s) => (
                    <span
                      key={s.Id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-200/60 text-blue-800 text-xs font-medium border border-blue-300"
                    >
                      ★ {s.Code}
                    </span>
                  ))}
              </div>
            </div>
          </div>
        </div>
      )} */}

      {/* Toolbar */}
      <div className="flex items-center justify-between mb-2 px-1">
        <div className="flex items-center gap-2">
          {!isExternalMode && filterMode !== "all" && (
            <button
              type="button"
              onClick={() => setFilterMode("all")}
              className="text-[11px] text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1 px-2 py-0.5 bg-blue-50 rounded-md transition-colors"
            >
              <X size={10} /> Xóa bộ lọc
            </button>
          )}
          {selectedFileTypeId && matchCount > 0 && (
            <span className="text-[11px] font-medium text-violet-600 bg-violet-50 border border-violet-200 px-2 py-0.5 rounded-md flex items-center gap-1">
              <Zap size={10} />
              Phù hợp {matchCount}/
              {standards.flatMap((s) => s.Criterions || []).length} tiêu chí
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasAssignment && (
            <button
              type="button"
              onClick={() => setFilterAssigned((f) => !f)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${filterAssigned
                ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                : "bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600"
                }`}
            >
              <span>{filterAssigned ? "★" : "☆"}</span>
              {filterAssigned ? "Đang lọc phân công" : "Chỉ xem TC của tôi"}
            </button>
          )}
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={expandAllFn}
              className="text-[10px] text-slate-500 hover:text-slate-700 px-1.5 py-0.5 rounded hover:bg-slate-100 transition-colors"
            >
              Mở tất cả
            </button>
            <span className="text-slate-300">|</span>
            <button
              type="button"
              onClick={collapseAllFn}
              className="text-[10px] text-slate-500 hover:text-slate-700 px-1.5 py-0.5 rounded hover:bg-slate-100 transition-colors"
            >
              Thu gọn
            </button>
          </div>
        </div>
      </div>

      {/* Standards Tree */}
      <div className="border border-slate-200 rounded-xl bg-white overflow-hidden">
        {displayedStandards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Filter size={24} className="text-slate-300 mb-2" />
            <p className="text-sm text-slate-400">
              Không có tiêu chí nào phù hợp bộ lọc
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {displayedStandards.map((std) => (
              <StandardRow
                key={std.Id}
                standard={std}
                isExpanded={expandedIds[std.Id] === true}
                onToggle={() => toggle(std.Id)}
                matchingCriterionIds={matchingCriterionIds}
                selectedFileTypeId={selectedFileTypeId}
                isAssigned={
                  hasAssignment
                    ? assignedStandardIds.includes(std.Id)
                    : undefined
                }
                countMap={countMap}
                pendingCountMap={pendingCountMap}
                evidenceMap={evidenceMap}
                fileTypeMap={fileTypeMap}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// --- Standard Row ---

const StandardRow = ({
  standard,
  isExpanded,
  onToggle,
  matchingCriterionIds,
  selectedFileTypeId,
  isAssigned,
  countMap,
  pendingCountMap,
  evidenceMap,
  fileTypeMap,
}: {
  standard: Standard;
  isExpanded: boolean;
  onToggle: () => void;
  matchingCriterionIds: Set<string>;
  selectedFileTypeId?: string;
  isAssigned?: boolean;
  countMap: Map<string, number>;
  pendingCountMap: Map<string, number>;
  evidenceMap: Map<string, { name: string; code: string }[]>;
  fileTypeMap: Record<string, string>;
}) => {
  const criteria = standard.Criterions || [];
  const stdStatus = getStandardStatus(standard, countMap, pendingCountMap);
  const satisfiedInStd = criteria.filter(
    (c) => getCriterionStatus(c, countMap, pendingCountMap) === "satisfied",
  ).length;
  const projectedSatisfiedInStd = selectedFileTypeId
    ? criteria.filter((c) => {
      const cReqs = c.CriterionRequirements || [];
      const totalReq = cReqs.reduce(
        (sum, r) => sum + (r.MinQuantity || 0),
        0,
      );
      if (totalReq === 0) return false;
      const projected = cReqs.reduce((sum, r) => {
        const actual = countMap.get(r.FileTypeId) ?? 0;
        const simulated =
          r.FileTypeId === selectedFileTypeId ? actual + 1 : actual;
        return sum + Math.min(simulated, r.MinQuantity || 0);
      }, 0);
      return projected >= totalReq;
    }).length
    : satisfiedInStd;
  const matchInStd = criteria.filter((c) =>
    matchingCriterionIds.has(c.Id),
  ).length;

  return (
    <div>
      {/* Standard header */}
      <button
        type="button"
        onClick={onToggle}
        className={`w-full flex items-center gap-2 px-3 py-2.5 transition-colors ${isAssigned === true
          ? "bg-blue-50/60 hover:bg-blue-100/50 border-l-3 border-l-blue-500"
          : isAssigned === false
            ? "opacity-55 hover:opacity-75 hover:bg-slate-50/80"
            : matchInStd > 0
              ? "hover:bg-violet-50/50"
              : "hover:bg-slate-50/80"
          }`}
      >
        <div
          className={`transition-transform ${isExpanded ? "rotate-90" : ""}`}
        >
          <ChevronRight size={14} className="text-slate-400" />
        </div>
        <StatusIcon status={stdStatus} size={16} />
        <div className="flex-1 text-left min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded shrink-0">
              {standard.Code}
            </span>
            <span className="text-[13px] font-semibold text-slate-700 truncate">
              {standard.Name}
            </span>
            {isAssigned === true && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-100 text-blue-700 border border-blue-200 shrink-0">
                ★ Phân công
              </span>
            )}
            {matchInStd > 0 && (
              <span className="text-[10px] font-semibold text-violet-600 bg-violet-100 px-1.5 py-0.5 rounded shrink-0 flex items-center gap-0.5">
                <Zap size={8} />
                {matchInStd}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0 w-28">
          <MiniBar
            current={satisfiedInStd}
            total={criteria.length}
            projected={selectedFileTypeId ? projectedSatisfiedInStd : undefined}
          />
        </div>
      </button>

      {/* Criteria */}
      {isExpanded && (
        <div className="bg-slate-50/40">
          {criteria.map((crit) => (
            <CriterionRow
              key={crit.Id}
              criterion={crit}
              isMatching={matchingCriterionIds.has(crit.Id)}
              selectedFileTypeId={selectedFileTypeId}
              countMap={countMap}
              pendingCountMap={pendingCountMap}
              evidenceMap={evidenceMap}
              fileTypeMap={fileTypeMap}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// --- Criterion Row ---

const CriterionRow = ({
  criterion,
  isMatching,
  selectedFileTypeId,
  countMap,
  pendingCountMap,
  evidenceMap,
  fileTypeMap,
}: {
  criterion: Criterion;
  isMatching: boolean;
  selectedFileTypeId?: string;
  countMap: Map<string, number>;
  pendingCountMap: Map<string, number>;
  evidenceMap: Map<string, { name: string; code: string }[]>;
  fileTypeMap: Record<string, string>;
}) => {
  const status = getCriterionStatus(criterion, countMap, pendingCountMap);
  const reqs = criterion.CriterionRequirements || [];
  const totalRequired = reqs.reduce((sum, r) => sum + (r.MinQuantity || 0), 0);

  const currentCount = reqs.reduce((sum, r) => {
    const actual = countMap.get(r.FileTypeId) ?? 0;
    return sum + Math.min(actual, r.MinQuantity || 0);
  }, 0);

  // Projected count: simulate +1 evidence of selected file type
  const projectedCount =
    selectedFileTypeId !== undefined
      ? reqs.reduce((sum, r) => {
        const actual = countMap.get(r.FileTypeId) ?? 0;
        const simulated =
          r.FileTypeId === selectedFileTypeId ? actual + 1 : actual;
        return sum + Math.min(simulated, r.MinQuantity || 0);
      }, 0)
      : currentCount;

  const wouldComplete =
    selectedFileTypeId !== undefined &&
    projectedCount >= totalRequired &&
    totalRequired > 0 &&
    currentCount < totalRequired;

  return (
    <div
      className={`relative pl-10 pr-3 py-2.5 border-t border-slate-100/80 transition-all duration-500 ${isMatching
        ? "bg-violet-50/70 ring-1 ring-inset ring-violet-200"
        : status === "satisfied"
          ? "bg-emerald-50/20"
          : status === "pending"
            ? "bg-blue-50/20"
            : status === "partial"
              ? "bg-amber-50/20"
              : ""
        }`}
      style={
        isMatching ? { animation: "highlight-pulse 1.5s ease-out" } : undefined
      }
    >
      {/* Matching indicator bar */}
      {isMatching && (
        <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-violet-500 rounded-r" />
      )}

      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          {/* Code + badges */}
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[11px] font-mono font-bold text-slate-500">
              {criterion.Code}
            </span>
            {status === "satisfied" && <Badge variant="green">Đủ MC</Badge>}
            {status === "pending" && <Badge variant="blue">Chờ duyệt</Badge>}
            {status === "partial" && <Badge variant="amber">Thiếu MC</Badge>}
            {status === "empty" && <Badge variant="red">Chưa có MC</Badge>}
            {isMatching && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-violet-700 bg-violet-100 border border-violet-200 px-1.5 py-0.5 rounded-md"
                style={{ animation: "fade-in-up 0.3s ease-out" }}
              >
                <Zap size={9} /> Phù hợp
              </span>
            )}
            {wouldComplete && (
              <span
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-violet-800 bg-violet-200 border border-violet-300 px-1.5 py-0.5 rounded-md"
                style={{ animation: "fade-in-up 0.3s ease-out" }}
              >
                <Check size={9} className="text-violet-700" /> Sẽ đạt
              </span>
            )}
          </div>
          <p className="text-xs text-slate-600 leading-relaxed mb-1.5">
            {criterion.Name}
          </p>

          {/* Progress */}
          <div className="flex items-center gap-3 mb-1.5">
            <MiniBar
              current={currentCount}
              total={totalRequired}
              projected={selectedFileTypeId ? projectedCount : undefined}
            />
          </div>

          {/* File type requirements */}
          <div className="flex flex-wrap gap-1">
            <TooltipProvider>
              {reqs.map((req) => {
                const isReqMatch =
                  selectedFileTypeId && req.FileTypeId === selectedFileTypeId;
                const fileTypeName = fileTypeMap[req.FileTypeId] || "Tài liệu";

                return (
                  <Tooltip key={req.Id}>
                    <TooltipTrigger asChild>
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border transition-all duration-300 cursor-default ${isReqMatch
                          ? "bg-violet-100 border-violet-300 text-violet-700 shadow-sm font-semibold"
                          : req.IsMandatory
                            ? "bg-slate-50 border-slate-200 text-slate-500 hover:border-slate-300"
                            : "bg-white border-dashed border-slate-200 text-slate-400 hover:border-slate-300"
                          }`}
                        style={
                          isReqMatch
                            ? { animation: "req-glow 1.5s ease-out" }
                            : undefined
                        }
                      >
                        <FileText size={9} />
                        <span className="font-mono font-bold">
                          {countMap.get(req.FileTypeId) ?? 0}/{req.MinQuantity}
                        </span>
                        {req.IsMandatory && <span className="text-red-400">*</span>}
                        {isReqMatch && <Check size={9} className="text-violet-600" />}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="font-medium">{fileTypeName}</p>
                      {(evidenceMap.get(req.FileTypeId) ?? []).length > 0 ? (
                        <div className="mt-1 border-t border-white/20 pt-1 space-y-0.5">
                          {(evidenceMap.get(req.FileTypeId) ?? []).map(
                            (ev, idx) => (
                              <p key={idx} className="text-xs opacity-90">
                                ✓ {ev.code} — {ev.name}
                              </p>
                            ),
                          )}
                        </div>
                      ) : (
                        <p className="mt-0.5 text-xs opacity-70">
                          Chưa có minh chứng
                        </p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </TooltipProvider>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StandardCriteriaTable;
