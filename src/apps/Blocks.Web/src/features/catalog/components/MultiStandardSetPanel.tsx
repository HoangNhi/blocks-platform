import { Zap, BookOpen, Tag, Layers, AlertCircle } from "lucide-react";
import { useMultiStandardSets } from "@/features/catalog/hooks/useMultiStandardSets";
import StandardCriteriaTable from "@/features/catalog/components/StandardCriteriaTable";

const TAB_COLORS = ["#3b82f6", "#e11d48", "#0891b2", "#7c3aed", "#ea580c"];

interface MultiStandardSetPanelProps {
  selectedFileTypeId?: string;
  selectedFileTypeName?: string;
}

const MultiStandardSetPanel = ({
  selectedFileTypeId,
  selectedFileTypeName,
}: MultiStandardSetPanelProps) => {
  const {
    standardSets,
    activeTabId,
    setActiveTabId,
    initialLoading,
    tabDataMap,
    tabStats,
    globalStats,
  } = useMultiStandardSets(selectedFileTypeId);

  const activeTab = tabDataMap[activeTabId];

  if (initialLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-sm text-slate-400">
          Đang tải bộ tiêu chuẩn...
        </div>
      </div>
    );
  }

  if (standardSets.length === 0) {
    return (
      <div className="border border-dashed border-slate-200 rounded-xl p-12 flex flex-col items-center justify-center gap-2">
        <Layers size={28} className="text-slate-300" />
        <p className="text-sm text-slate-400">Không có bộ tiêu chuẩn nào.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-4">
      {/* Section Header */}
      <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
        <div className="h-5 w-1 bg-violet-500 rounded-full" />
        <h3 className="text-sm font-semibold text-slate-700">
          Khả năng thỏa mãn tiêu chí
        </h3>
        {!selectedFileTypeId && (
          <span className="text-[11px] text-slate-400 ml-auto flex items-center gap-1">
            <Tag size={10} /> Chọn loại tài liệu để xem
          </span>
        )}
      </div>

      {/* Global Summary Banner */}
      {selectedFileTypeId && globalStats.totalMatching > 0 && (
        <div
          className="p-3 rounded-lg border border-violet-200 bg-gradient-to-r from-violet-50 to-fuchsia-50"
          style={{ animation: "fade-in-up 0.3s ease-out" }}
        >
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
              <Zap size={16} className="text-violet-600" />
            </div>
            <div>
              <span className="text-sm font-semibold text-violet-800">
                {selectedFileTypeName
                  ? `"${selectedFileTypeName}" phù hợp ${globalStats.totalMatching} tiêu chí`
                  : `Phù hợp ${globalStats.totalMatching} tiêu chí`}
              </span>
              <p className="text-[11px] text-violet-600/70">
                Trên {globalStats.setsWithMatches} bộ tiêu chuẩn
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div
        className="flex gap-2 overflow-x-auto pb-1"
        style={{ scrollbarWidth: "thin" }}
      >
        {standardSets.map((ss, index) => {
          const isActive = activeTabId === ss.Id;
          const stat = tabStats[ss.Id];
          const color = TAB_COLORS[index % TAB_COLORS.length];

          return (
            <button
              key={ss.Id}
              type="button"
              onClick={() => setActiveTabId(ss.Id)}
              className={`shrink-0 flex items-center gap-2.5 px-3 py-2 rounded-lg border-2 transition-all ${
                isActive
                  ? "bg-white shadow-sm"
                  : "border-transparent bg-slate-50/80 hover:bg-white hover:border-slate-200"
              }`}
              style={isActive ? { borderColor: color } : {}}
            >
              <BookOpen
                size={14}
                style={{ color: isActive ? color : "#94a3b8" }}
                className="shrink-0"
              />
              <div className="text-left">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-xs font-bold whitespace-nowrap ${
                      isActive ? "" : "text-slate-600"
                    }`}
                    style={isActive ? { color } : {}}
                  >
                    {ss.Name}
                  </span>
                  {stat && stat.matching > 0 && selectedFileTypeId && (
                    <span className="text-[10px] font-bold text-violet-600 bg-violet-100 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                      <Zap size={8} />
                      {stat.matching}
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-slate-400 whitespace-nowrap">
                  {ss.EvaluationMode_Name || ss.Code} ·{" "}
                  {stat?.total || 0} tiêu chí
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Active Tab Content */}
      {activeTab && (
        <div>
          {activeTab.loading && (
            <div className="flex items-center justify-center py-8">
              <div className="text-sm text-slate-400">Đang tải tiêu chí...</div>
            </div>
          )}
          {activeTab.error && (
            <div className="flex items-center justify-center py-8 text-red-500 text-sm">
              {activeTab.error}
            </div>
          )}
          {activeTab.standards && (
            <StandardCriteriaTable
              standards={activeTab.standards}
              selectedFileTypeId={selectedFileTypeId}
              showSummaryCards={false}
              showProgressBar={false}
            />
          )}
        </div>
      )}

      {/* Info Box */}
      <div className="flex items-start gap-2 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
        <AlertCircle size={14} className="text-indigo-500 mt-0.5 shrink-0" />
        <p className="text-xs text-indigo-700 leading-relaxed">
          Chọn <strong>Loại tài liệu</strong> bên trái để xem minh chứng này
          có thể thỏa mãn tiêu chí nào trên{" "}
          <strong>tất cả bộ tiêu chuẩn</strong>.
        </p>
      </div>
    </div>
  );
};

export default MultiStandardSetPanel;
