import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { surveyCampaignService } from "../../../api/survey-campaign.api";
import type { SurveyCampaignGetListPaging } from "../../../types/survey-campaign.types";
import { SurveyResultsContent } from "@/features/business/routes/SurveyCampaign/components/SurveyResultsContent";

interface PopupSurveyCampaignCriterionProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaign: SurveyCampaignGetListPaging | null;
}

const CAMPAIGN_STATUS_META: Record<
  number,
  { label: string; className: string }
> = {
  0: { label: "Chưa bắt đầu", className: "bg-slate-100 text-slate-600" },
  1: { label: "Đang diễn ra", className: "bg-blue-100 text-blue-700" },
  2: { label: "Đã kết thúc", className: "bg-emerald-100 text-emerald-700" },
  3: { label: "Đã kết thúc", className: "bg-emerald-100 text-emerald-700" },
};


export function PopupSurveyCampaignCriterion({
  open,
  onOpenChange,
  campaign,
}: PopupSurveyCampaignCriterionProps) {
  const [activeTab, setActiveTab] = useState<"general" | "results">("general");

  const { data: sessions = [] } = useQuery({
    queryKey: ["criterionEvaluation", "surveyCampaign", "sessions", campaign?.Id],
    queryFn: async () => {
      const res = await surveyCampaignService.getListSession({
        PageIndex: 1,
        PageSize: 1000,
        TextSearch: null,
        CampaignId: campaign!.Id,
        Status: undefined,
      });
      return res.Data?.Data ?? [];
    },
    enabled: open && !!campaign?.Id,
  });

  const completedSessionCount = useMemo(
    () => sessions.filter((session) => session.Status === 3).length,
    [sessions],
  );

  const statusMeta = campaign
    ? CAMPAIGN_STATUS_META[campaign.Status] || {
        label: "Không xác định",
        className: "bg-slate-200 text-slate-700",
      }
    : null;

  const completionPercentage = useMemo(() => {
    return sessions.length > 0
      ? Math.round((completedSessionCount / sessions.length) * 100)
      : 0;
  }, [completedSessionCount, sessions.length]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-5xl h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-6 border-b shrink-0">
          <DialogTitle>{campaign?.Name ?? "Đợt khảo sát"}</DialogTitle>
          <DialogDescription>
            Xem thông tin và kết quả khảo sát (chỉ đọc)
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto bg-slate-50 p-6">
          {!campaign ? (
            <div className="h-full flex items-center justify-center text-sm text-slate-500">
              Không có dữ liệu khảo sát
            </div>
          ) : (
            <Tabs
              value={activeTab}
              onValueChange={(v) => setActiveTab(v as "general" | "results")}
            >
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="general">Thông tin chung</TabsTrigger>
                <TabsTrigger value="results">Kết quả khảo sát</TabsTrigger>
              </TabsList>

              {/* Tab 1: General Info */}
              <TabsContent value="general" className="mt-4">
                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                  {/* Section 1: Thông tin khảo sát */}
                  <div>
                    <div className="px-4 pt-3 pb-1">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Thông tin khảo sát
                      </p>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {/* Tên khảo sát */}
                      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-100">
                        <span className="w-44 shrink-0 text-slate-500 text-xs">
                          Tên khảo sát
                        </span>
                        <span className="flex-1 font-medium text-slate-800 text-sm">
                          {campaign.Name}
                        </span>
                      </div>

                      {/* Chu kỳ đánh giá */}
                      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-100">
                        <span className="w-44 shrink-0 text-slate-500 text-xs">
                          Chu kỳ đánh giá
                        </span>
                        <span className="flex-1 font-medium text-slate-800 text-sm">
                          {campaign.Cycle || "--"}
                        </span>
                      </div>

                      {/* Loại đối tượng */}
                      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-100">
                        <span className="w-44 shrink-0 text-slate-500 text-xs">
                          Loại đối tượng
                        </span>
                        <span className="flex-1 font-medium text-slate-800 text-sm">
                          {campaign.Stakeholder || "--"}
                        </span>
                      </div>

                      {/* Trạng thái */}
                      <div className="flex items-center gap-3 px-4 py-2.5">
                        <span className="w-44 shrink-0 text-slate-500 text-xs">
                          Trạng thái
                        </span>
                        {statusMeta && (
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${statusMeta.className}`}
                          >
                            {statusMeta.label}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Section 2: Thống kê tham gia */}
                  <div>
                    <div className="px-4 pt-3 pb-1">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Thống kê tham gia
                      </p>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {/* Tổng số người tham gia */}
                      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-100">
                        <span className="w-44 shrink-0 text-slate-500 text-xs">
                          Tổng số người tham gia
                        </span>
                        <div className="flex-1 flex items-center gap-2">
                          <span className="font-medium text-slate-800 text-sm">
                            {sessions.length}
                          </span>
                          <div className="flex-1 max-w-30 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 rounded-full" style={{ width: "100%" }} />
                          </div>
                        </div>
                      </div>

                      {/* Đã hoàn thành */}
                      <div className="flex items-center gap-3 px-4 py-2.5">
                        <span className="w-44 shrink-0 text-slate-500 text-xs">
                          Đã hoàn thành
                        </span>
                        <div className="flex-1 flex items-center gap-2">
                          <span className="font-medium text-slate-800 text-sm">
                            {completedSessionCount}
                          </span>
                          <div className="flex-1 max-w-30 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 rounded-full"
                              style={{ width: `${completionPercentage}%` }}
                            />
                          </div>
                          <span className="text-xs text-emerald-600 font-semibold">
                            {completionPercentage}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Tab 2: Results */}
              <TabsContent value="results" className="mt-4">
                <SurveyResultsContent
                  campaignId={campaign.Id}
                  enabled={activeTab === "results" && open}
                />
              </TabsContent>
            </Tabs>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
