import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Loader2, RefreshCw } from "lucide-react";
import { useCriterionEvaluation } from "../../hooks/useCriterionEvaluation";
import { useCycleOptions } from "@/features/business/hooks/useCycleOptions";
import { standardSetService } from "@/features/catalog/api/standardset.api";
import { useAuth } from "@/hooks/useAuth";
import { SummaryBar } from "./components/SummaryBar";
import { CriteriaGrid } from "./components/CriteriaGrid";
import { CriterionPopup } from "./components/CriterionPopup";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import type {
  EvaluationStatus,
  FrameworkType,
  StandardEvaluationGroup,
} from "../../types/criterionEvaluation.types";
import { EVALUATION_STATUS_CONFIG } from "../../types/criterionEvaluation.types";
import type { ModelCombobox } from "@/types/base/base.types";
import { canEvaluatorSubmit } from "./utils/permissions";

const STATUS_FILTER_OPTIONS: ModelCombobox[] = [
  { Value: "", Text: "Tất cả trạng thái" },
  { Value: "0", Text: EVALUATION_STATUS_CONFIG[0].label },
  { Value: "2", Text: EVALUATION_STATUS_CONFIG[2].label },
  { Value: "3", Text: EVALUATION_STATUS_CONFIG[3].label },
];

function modeToFramework(mode?: number | null): FrameworkType | null {
  if (mode === 1) return "AUN";
  if (mode === 2) return "MOET";
  return null;
}

function inferFrameworkFromGroups(
  groups: StandardEvaluationGroup[],
): FrameworkType | null {
  const items = groups.flatMap((group) => group.Items);

  if (items.some((item) => item.OfficialResult != null)) return "MOET";
  if (items.some((item) => item.OfficialScore != null)) return "AUN";

  return null;
}
export function CriterionEvaluationPage() {
  const { user, isExternalReviewer } = useAuth();
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const {
    selectedCycleId,
    setSelectedCycleId,
    activeItemId,
    setActiveItemId,
    filters,
    setFilters,
    cycleData,
    standardSetId,
    summary,
    groups,
    submissions,
    evidences,
    mySubmission,
    evaluationMode,
    officialFields,
    isRevisionAllowed,
    isSummaryLoading,
    isListLoading,
    isPopupDataLoading,
    isPopupDataFetching,
    isSubmitting,
    isApproving,
    handleSubmit,
    handleApprove,
  } = useCriterionEvaluation();

  const { options: cycleOptions, isLoading: isCycleLoading } =
    useCycleOptions();

  useEffect(() => {
    if (
      isExternalReviewer &&
      !selectedCycleId &&
      !isCycleLoading &&
      cycleOptions.length > 0
    ) {
      const firstCycleId = cycleOptions[0].Value;
      if (firstCycleId) {
        setSelectedCycleId(firstCycleId);
      }
    }
  }, [
    isExternalReviewer,
    selectedCycleId,
    isCycleLoading,
    cycleOptions,
    setSelectedCycleId,
  ]);

  const handleRefresh = async () => {
    if (!selectedCycleId || isRefreshing) {
      return;
    }

    setIsRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["criterionEvaluation", "summary", selectedCycleId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["criterionEvaluation", "list", selectedCycleId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["criterionEvaluation", "popupData"],
        }),
        queryClient.invalidateQueries({
          queryKey: [
            "criterionEvaluation",
            "surveyCampaigns",
            "popup",
            selectedCycleId,
          ],
        }),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

  const { data: standardSetData } = useQuery({
    queryKey: ["standardSet-detail", standardSetId],
    queryFn: async () => {
      const res = await standardSetService.getById(standardSetId);
      return res.Data ?? null;
    },
    enabled: !!standardSetId,
  });

  const popupFramework = modeToFramework(evaluationMode);
  const standardSetFramework = modeToFramework(standardSetData?.EvaluationMode);
  const inferredFramework = inferFrameworkFromGroups(groups);

  // Prefer popup mode while popup is open, then standard set mode, then infer from list data.
  const framework: FrameworkType = activeItemId
    ? (popupFramework ?? standardSetFramework ?? inferredFramework ?? "AUN")
    : (standardSetFramework ?? inferredFramework ?? popupFramework ?? "AUN");

  const userCouncil = cycleData?.ListCouncil?.find(
    (c) => c.UserId === user?.Id,
  );
  const userRole = userCouncil?.RoleId ?? 0;
  const userAssignedStandardIds = new Set(
    userCouncil?.AssignedStandardIds ?? [],
  );
  const activeItem =
    activeItemId != null
      ? (groups
          .flatMap((g) => g.Items)
          .find((item) => item.Id === activeItemId) ?? null)
      : null;
  const activeStandardId =
    activeItemId != null
      ? (groups.find((group) =>
          group.Items.some((item) => item.Id === activeItemId),
        )?.StandardId ?? null)
      : null;
  const cycleStatus = Number(cycleData?.Status ?? 0);
  const sarRevisionMode = cycleStatus === 3 && isRevisionAllowed;
  const canSubmit =
    !isExternalReviewer &&
    (cycleStatus === 2 || sarRevisionMode) &&
    canEvaluatorSubmit(
      userRole,
      userCouncil?.AssignedStandardIds,
      activeStandardId,
    ); // TVH
  const canApprove = !isExternalReviewer && (userRole === 1 || userRole === 2); // CTH or PCT

  const submitButtonText = sarRevisionMode
    ? "Cập nhật phiếu đánh giá"
    : mySubmission
      ? "Cập nhật phiếu đánh giá"
      : "Gửi phiếu đánh giá";
  const submitButtonTooltip = !canSubmit
    ? sarRevisionMode
      ? "Bạn không có quyền cập nhật tiêu chí này"
      : "Chỉ cập nhật khi ở pha DO hoặc SAR yêu cầu chỉnh sửa"
    : undefined;

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
        <div>
          <h1 className="text-lg font-semibold">Đánh giá tiêu chí (Biểu 04)</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Chu kỳ kiểm định — đánh giá theo chuẩn {framework}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Combobox
            options={cycleOptions}
            value={selectedCycleId}
            onValueChange={(val) => setSelectedCycleId(val ?? "")}
            placeholder={isCycleLoading ? "Đang tải..." : "Chọn chu kỳ..."}
            className="w-[260px]"
          />
          {selectedCycleId && (
            <button
              type="button"
              onClick={() => {
                void handleRefresh();
              }}
              disabled={isRefreshing || isSummaryLoading || isListLoading}
              className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
              title="Tải lại dữ liệu"
            >
              <RefreshCw
                className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
              />
            </button>
          )}
        </div>
      </div>

      {/* Summary bar */}
      {isSummaryLoading && selectedCycleId ? (
        <div className="flex items-center gap-2 px-6 py-3 border-b text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Đang tải dữ liệu tổng hợp...
        </div>
      ) : (
        <SummaryBar
          summary={summary}
          framework={framework}
          filterSlot={
            selectedCycleId ? (
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Tìm kiếm tiêu chí..."
                    value={filters.TextSearch ?? ""}
                    onChange={(e) =>
                      setFilters((f) => ({ ...f, TextSearch: e.target.value }))
                    }
                    className="pl-8 h-8 text-sm w-[280px]"
                  />
                </div>
                <Combobox
                  options={STATUS_FILTER_OPTIONS}
                  value={filters.Status?.toString() ?? ""}
                  onValueChange={(val) =>
                    setFilters((f) => ({
                      ...f,
                      Status: val
                        ? (Number(val) as EvaluationStatus)
                        : undefined,
                    }))
                  }
                  placeholder="Trạng thái"
                  className="w-[180px]"
                />
              </div>
            ) : undefined
          }
        />
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {!selectedCycleId ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <p className="text-sm">
              Vui lòng chọn chu kỳ để xem đánh giá tiêu chí.
            </p>
          </div>
        ) : isListLoading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <CriteriaGrid
            groups={groups}
            framework={framework}
            assignedStandardIds={userAssignedStandardIds}
            onRowClick={(item) => setActiveItemId(item.Id)}
          />
        )}
      </div>

      {/* Criterion popup */}
      {activeItem && (
        <CriterionPopup
          item={activeItem}
          submissions={submissions}
          evidences={evidences}
          cycleId={selectedCycleId}
          mySubmission={mySubmission}
          isMySubmissionLoading={isPopupDataLoading}
          isSubmissionsFetching={isPopupDataFetching}
          officialFields={officialFields}
          framework={framework}
          canSubmit={canSubmit}
          canApprove={canApprove}
          isSubmitting={isSubmitting}
          isApproving={isApproving}
          submitButtonText={submitButtonText}
          submitButtonTooltip={submitButtonTooltip}
          sarRevisionMode={sarRevisionMode}
          isExternalReviewer={isExternalReviewer}
          onClose={() => setActiveItemId(null)}
          onSubmit={async (req) => {
            await handleSubmit(req);
          }}
          onApprove={async (req) => {
            await handleApprove(req);
          }}
        />
      )}
    </div>
  );
}
