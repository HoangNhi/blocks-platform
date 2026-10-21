import { Button } from "@/components/ui/button";
import { Loader2, Edit3, Eye, ArrowLeft, BarChart3, Info } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/ui/combobox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useState, useEffect } from "react";
import { SurveyForm } from "./components/SurveyForm";
import { SurveyResultsContent } from "./components/SurveyResultsContent";
import { v4 as uuidv4 } from "uuid";
import type {
  SurveyCampaign,
  SurveyView,
} from "../../types/survey-campaign.types";
import { cycleService } from "@/features/business/api/cycle.api";
import { surveyTemplateService } from "../../api/survey-template.api";
import { TopicListEditor } from "../../components/TopicListEditor";
import { useSurveyTopics } from "../../hooks/useSurveyTopics";
import { toast } from "sonner";
import { STAKEHOLDER_TYPES } from "@/constants/catalog.constants";
import { CAMPAIGN_STATUS_OPTIONS } from "@/constants/business.constants";
import { cn } from "@/lib/utils";
import { remapTemplateTopicIdsForCampaign } from "../../utils/surveyCampaignTemplate";

const formSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Vui lòng nhập tên khảo sát"),
  stakeholderType: z.string().min(1, "Vui lòng chọn loại đối tượng"),
  status: z.string(),
  cycleId: z.string().min(1, "Vui lòng chọn chu kỳ đánh giá"),
  templateId: z.string().min(1, "Vui lòng chọn mẫu khảo sát"),
});

const PopupSurveyCampaign = ({
  surveyCampaign,
  isOpen,
  onOpenChange,
  saveChange,
  isLoading,
  readOnly,
}: {
  surveyCampaign: SurveyCampaign | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  saveChange: (
    data: SurveyCampaign & { IsEdit: boolean },
    isAddMore: boolean,
  ) => void;
  isLoading?: boolean;
  readOnly?: boolean;
}) => {
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      id: surveyCampaign?.Id || uuidv4(),
      name: surveyCampaign?.Name || "",
      stakeholderType: surveyCampaign?.StakeholderType?.toString() || "1",
      status: surveyCampaign?.Status?.toString() || "1",
      cycleId: surveyCampaign?.CycleId || "",
      templateId: surveyCampaign?.TemplateId || "",
    },
  });

  const stakeholderType = form.watch("stakeholderType");
  const templateIdForm = form.watch("templateId");

  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false);

  const { listTopic, setListTopic, collapsedTopics, handlers } =
    useSurveyTopics(surveyCampaign?.ListTopic || []);

  const [mode, setMode] = useState<"edit" | "info" | "preview" | "results">(
    readOnly ? "info" : "edit",
  );

  const onSubmit = (values: z.infer<typeof formSchema>, isAddMore: boolean) => {
    if (readOnly) {
      return;
    }

    const payload = {
      Id: values.id,
      Name: values.name,
      StakeholderType: parseInt(values.stakeholderType),
      Status: parseInt(values.status),
      CycleId: values.cycleId,
      TemplateId: values.templateId,
      ListTopic: listTopic,
      IsEdit: surveyCampaign?.IsEdit || false,
    };
    saveChange(payload as SurveyCampaign & { IsEdit: boolean }, isAddMore);
  };

  useEffect(() => {
    if (surveyCampaign) {
      form.reset({
        id: surveyCampaign.Id || uuidv4(),
        name: surveyCampaign.Name || "",
        stakeholderType: surveyCampaign.StakeholderType?.toString() || "1",
        status: surveyCampaign.Status?.toString() || "1",
        cycleId: surveyCampaign.CycleId || "",
        templateId: surveyCampaign.TemplateId || "",
      });
      setListTopic(surveyCampaign?.ListTopic || []);
    } else {
      form.reset({
        id: uuidv4(),
        name: "",
        stakeholderType: "1",
        status: "1",
        cycleId: "",
        templateId: "",
      });
      setListTopic([]);
    }
  }, [surveyCampaign, form, setListTopic]);

  useEffect(() => {
    if (isOpen) {
      setMode(readOnly ? "info" : "edit");
    }
  }, [isOpen, readOnly, surveyCampaign?.Id]);

  // Transform data for preview
  const getPreviewData = (): SurveyView => {
    const values = form.getValues();
    return {
      Id: values.id,
      Name: values.name || "Tên khảo sát (Xem trước)",
      StakeholderType: parseInt(values.stakeholderType || "1"),
      IsSessionCompleted: false,
      ListTopic:
        listTopic as unknown as import("../../types/survey-campaign.types").SurveyViewTopic[], // Casting for preview compatibility
    };
  };

  const showResultsTab =
    surveyCampaign?.Status === 2 || surveyCampaign?.Status === 3;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "p-0 gap-0 w-full flex flex-col focus:outline-none overflow-hidden duration-300 transition-all",
          mode === "preview" && !readOnly
            ? "max-w-none w-screen h-screen rounded-none border-0 data-[state=open]:slide-in-from-bottom-0"
            : "sm:max-w-4xl max-h-[90vh]",
        )}
        onPointerDownOutside={(e) => e.preventDefault()}
        style={
          mode === "preview" && !readOnly
            ? {
                maxWidth: "100vw",
                width: "100vw",
                height: "100vh",
              }
            : undefined
        }
      >
        <Form {...form}>
          <form
            className="flex flex-col w-full min-h-0 h-full"
            onSubmit={(e) => {
              e.preventDefault();
            }}
          >
            <DialogHeader
              className={cn(
                "p-6 pb-4 border-b shrink-0 bg-white z-10 transition-all",
                mode === "preview" && !readOnly ? "py-4 shadow-sm" : "",
              )}
            >
              <DialogTitle className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {mode === "preview" && !readOnly && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setMode("edit")}
                      className="mr-2"
                    >
                      <ArrowLeft className="h-5 w-5" />
                    </Button>
                  )}
                  <span>
                    {readOnly
                      ? "Xem chi tiết khảo sát"
                      : surveyCampaign?.IsEdit
                        ? "Cập nhật khảo sát"
                        : "Thêm mới khảo sát"}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <Tabs
                    value={mode}
                    onValueChange={(v) =>
                      setMode(v as "edit" | "info" | "preview" | "results")
                    }
                  >
                    <TabsList
                      className={`grid w-full ${
                        readOnly
                          ? showResultsTab
                            ? "grid-cols-2"
                            : "grid-cols-1"
                          : showResultsTab
                            ? "grid-cols-3"
                            : "grid-cols-2"
                      }`}
                    >
                      {readOnly && (
                        <TabsTrigger value="info">
                          <Info size={16} className="mr-2" /> Thông tin chung
                        </TabsTrigger>
                      )}
                      {!readOnly && (
                        <TabsTrigger value="edit">
                          <Edit3 size={16} className="mr-2" /> Soạn thảo
                        </TabsTrigger>
                      )}
                      {!readOnly && (
                        <TabsTrigger value="preview">
                          <Eye size={16} className="mr-2" /> Xem trước
                        </TabsTrigger>
                      )}
                      {showResultsTab && (
                        <TabsTrigger value="results">
                          <BarChart3 size={16} className="mr-2" /> Kết quả
                        </TabsTrigger>
                      )}
                    </TabsList>
                  </Tabs>
                </div>
              </DialogTitle>
            </DialogHeader>

            {/* Info Mode Content - read-only display for external reviewers */}
            {mode === "info" && readOnly && (
              <div className="flex-1 overflow-y-auto bg-gray-50/50 p-6 min-h-0">
                <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
                  <div className="px-4 pt-3 pb-1">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Thông tin khảo sát
                    </p>
                  </div>
                  <div className="divide-y divide-slate-100">
                    <div className="flex items-center gap-3 px-4 py-2.5">
                      <span className="w-44 shrink-0 text-slate-500 text-xs">
                        Tên khảo sát
                      </span>
                      <span className="flex-1 font-medium text-slate-800 text-sm">
                        {surveyCampaign?.Name || "--"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 px-4 py-2.5">
                      <span className="w-44 shrink-0 text-slate-500 text-xs">
                        Chu kỳ đánh giá
                      </span>
                      <span className="flex-1 font-medium text-slate-800 text-sm">
                        {surveyCampaign?.CycleName || "--"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 px-4 py-2.5">
                      <span className="w-44 shrink-0 text-slate-500 text-xs">
                        Loại đối tượng
                      </span>
                      <span className="flex-1 font-medium text-slate-800 text-sm">
                        {STAKEHOLDER_TYPES.find(
                          (s) =>
                            s.Value ===
                            surveyCampaign?.StakeholderType?.toString(),
                        )?.Text || "--"}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 px-4 py-2.5">
                      <span className="w-44 shrink-0 text-slate-500 text-xs">
                        Trạng thái
                      </span>
                      <span className="flex-1">
                        {(() => {
                          const statusConfig: Record<
                            number,
                            { text: string; className: string }
                          > = {
                            1: {
                              text: "Chưa bắt đầu",
                              className: "bg-gray-100 text-gray-800",
                            },
                            2: {
                              text: "Đang diễn ra",
                              className: "bg-blue-100 text-blue-800",
                            },
                            3: {
                              text: "Đã kết thúc",
                              className: "bg-green-100 text-green-800",
                            },
                          };

                          const cfg = surveyCampaign?.Status
                            ? (statusConfig[surveyCampaign.Status] ?? {
                                text: "--",
                                className: "bg-gray-100 text-gray-500",
                              })
                            : {
                                text: "--",
                                className: "bg-gray-100 text-gray-500",
                              };

                          return (
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${cfg.className}`}
                            >
                              {cfg.text}
                            </span>
                          );
                        })()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Edit Mode Content - Keep mounted but hide when in preview */}
            <div
              className={cn(
                "flex-1 overflow-y-auto bg-gray-50/50 p-6 min-h-0",
                (mode !== "edit" || readOnly) && "hidden",
              )}
            >
              {/* General Info Section */}
              <div className="bg-white rounded-lg border shadow-sm p-4 mb-6 space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b">
                  <div className="h-6 w-1 bg-blue-600 rounded-full"></div>
                  <h3 className="font-semibold text-gray-700">
                    Thông tin chung
                  </h3>
                </div>

                <div className="grid gap-4">
                  {/* Name */}
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem className="grid gap-2">
                        <FormLabel className="after:content-['*'] after:ml-0.5 after:text-red-500">
                          Tên khảo sát
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Nhập tên khảo sát"
                            className="bg-white"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Cycle & Stakeholder */}
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="cycleId"
                      render={({ field }) => (
                        <FormItem className="grid gap-2">
                          <FormLabel className="after:content-['*'] after:ml-0.5 after:text-red-500">
                            Chu kỳ đánh giá
                          </FormLabel>
                          <FormControl>
                            <Combobox
                              fetchOptions={async () => {
                                const res =
                                  await cycleService.getComboboxByUser();
                                return (res.Data || []).map((t) => ({
                                  Value: t.Value ?? "",
                                  Text: t.Text ?? "",
                                }));
                              }}
                              value={field.value}
                              onValueChange={field.onChange}
                              placeholder="Chọn chu kỳ"
                              searchPlaceholder="Tìm kiếm chu kỳ..."
                              emptyText="Không tìm thấy chu kỳ."
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="stakeholderType"
                      render={({ field }) => (
                        <FormItem className="grid gap-2">
                          <FormLabel className="after:content-['*'] after:ml-0.5 after:text-red-500">
                            Loại đối tượng
                          </FormLabel>
                          <FormControl>
                            <Combobox
                              options={STAKEHOLDER_TYPES}
                              value={field.value}
                              onValueChange={(val) => {
                                field.onChange(val);
                                form.setValue("templateId", "");
                                setListTopic([]);
                              }}
                              placeholder="Chọn đối tượng"
                              searchPlaceholder="Tìm kiếm đối tượng..."
                              emptyText="Không tìm thấy đối tượng."
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Template & Status */}
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="templateId"
                      render={({ field }) => (
                        <FormItem className="grid gap-2">
                          <FormLabel className="after:content-['*'] after:ml-0.5 after:text-red-500">
                            Mẫu khảo sát
                          </FormLabel>
                          <FormControl>
                            <Combobox
                              key={stakeholderType} // Force re-mount when stakeholder changes
                              fetchOptions={async () => {
                                const res =
                                  await surveyTemplateService.getAllCombobox({
                                    StakeholderType: parseInt(stakeholderType),
                                  });
                                return (res.Data || []).map((t) => ({
                                  Value: t.Value ?? "",
                                  Text: t.Text ?? "",
                                }));
                              }}
                              value={field.value}
                              onValueChange={async (val) => {
                                field.onChange(val);

                                if (!val) {
                                  setListTopic([]);
                                  return;
                                }

                                setIsLoadingTemplate(true);

                                try {
                                  const res =
                                    await surveyTemplateService.getById(val);

                                  if (!res.Success) {
                                    setListTopic([]);
                                    toast.error(res.Message);
                                    return;
                                  }

                                  // Template topics must be re-keyed before saving to a campaign update,
                                  // otherwise backend ownership validation treats them as foreign records.
                                  const clonedTopics =
                                    remapTemplateTopicIdsForCampaign(
                                      res.Data?.ListTopic || [],
                                    );

                                  setListTopic(clonedTopics);
                                } finally {
                                  setIsLoadingTemplate(false);
                                }
                              }}
                              placeholder="Chọn mẫu khảo sát"
                              searchPlaceholder="Tìm kiếm mẫu khảo sát..."
                              emptyText="Không tìm thấy mẫu khảo sát."
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="status"
                      render={({ field }) => {
                        return (
                          <FormItem className="grid gap-2">
                            <FormLabel>Trạng thái</FormLabel>
                            <FormControl>
                              <Combobox
                                options={CAMPAIGN_STATUS_OPTIONS}
                                value={field.value}
                                onValueChange={field.onChange}
                                placeholder="Chọn trạng thái"
                                searchPlaceholder="Tìm kiếm trạng thái..."
                                readonly={true}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        );
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="min-h-50">
                {templateIdForm ? (
                  isLoadingTemplate ? (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                      <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-3" />
                      <p>Đang tải dữ liệu mẫu khảo sát...</p>
                    </div>
                  ) : (
                    <TopicListEditor
                      listTopic={listTopic}
                      collapsedTopics={collapsedTopics}
                      handlers={handlers}
                    />
                  )
                ) : (
                  <div className="flex items-center justify-center h-48 border rounded-lg bg-gray-50 text-gray-500">
                    Vui lòng chọn Mẫu khảo sát trước.
                  </div>
                )}
              </div>
            </div>

            {/* Preview Mode Content - Render conditionally but only when needed (heavy component) or keep if we want state preservation there too?
              SurveyForm is read-only in preview, so remounting is fine/safer to ensure it gets fresh data.
              But let's keep logic simple: Conditionally render Preview is fine, as long as Edit stays mounted.
           */}
            {mode === "preview" && (
              <div className="flex-1 overflow-y-auto bg-gray-50/50 min-h-0">
                <SurveyForm
                  campaign={getPreviewData()}
                  isPreview={true}
                  onSubmit={() => {
                    toast.success("Đây chỉ là bản xem trước!");
                  }}
                />
              </div>
            )}

            {mode === "results" && (
              <>
                <div className="px-6 py-2.5 bg-blue-50 border-b border-blue-100 flex items-center gap-3 flex-wrap shrink-0">
                  <span className="font-semibold text-blue-900 text-sm">
                    {surveyCampaign?.Name}
                  </span>
                  <span className="text-slate-300">|</span>
                  <span className="text-slate-500 text-sm">
                    {
                      STAKEHOLDER_TYPES.find(
                        (s) =>
                          s.Value ===
                          surveyCampaign?.StakeholderType?.toString(),
                      )?.Text
                    }
                  </span>
                  <span className="text-slate-300">|</span>
                  <span
                    className={cn(
                      "px-2 py-0.5 rounded-full text-xs font-medium",
                      surveyCampaign?.Status === 3
                        ? "bg-slate-100 text-slate-600"
                        : "bg-green-100 text-green-700",
                    )}
                  >
                    {
                      CAMPAIGN_STATUS_OPTIONS.find(
                        (s) => s.Value === surveyCampaign?.Status?.toString(),
                      )?.Text
                    }
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto bg-slate-50 p-6 min-h-0">
                  <SurveyResultsContent
                    campaignId={surveyCampaign!.Id}
                    enabled={mode === "results" && isOpen}
                  />
                </div>
              </>
            )}

            {mode === "edit" && !readOnly && (
              <DialogFooter className="p-6 pt-4 border-t shrink-0 bg-white z-10">
                <DialogClose asChild>
                  <Button variant="outline">Hủy</Button>
                </DialogClose>
                <Button
                  type="button"
                  onClick={form.handleSubmit((values) =>
                    onSubmit(values, false),
                  )}
                  disabled={isLoading}
                >
                  {isLoading && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Lưu
                </Button>
                {!surveyCampaign?.IsEdit && (
                  <Button
                    type="button"
                    onClick={form.handleSubmit((values) =>
                      onSubmit(values, true),
                    )}
                    disabled={isLoading}
                  >
                    {isLoading && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    Lưu và thêm tiếp
                  </Button>
                )}
              </DialogFooter>
            )}
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
};

export default PopupSurveyCampaign;
