import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Loader2, X } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type UploadFileRef } from "@/components/ui/upload-file";
import type { Attachment } from "@/features/file/types/uploadfile.types";
import { actionPlanService } from "@/features/business/api/actionPlan.api";
import { useActionPlan } from "./hooks/useActionPlan";
import { useAssignableUsersOptions } from "./hooks/useAssignableUsersOptions";
import { useCycleOptions } from "@/features/business/hooks/useCycleOptions";
import { useStandardsByCycle } from "@/features/business/hooks/useStandardsByCycle";
import { useCriteriaByStandard } from "@/features/business/hooks/useCriteriaByStandard";
import type {
  ActionPlanDetail,
  ActionPlanStatus,
  ActionPriority,
  ExternalFindingOption,
} from "@/features/business/types/actionPlan.types";
import type { ActionPlanFormState, ActionPlanPopupTab } from "./actionPlanPopup.types";
import { canChangeStatus, canEditActionPlan, normalizeActionPlanStatusForSave, shouldShowAssigneeSection } from "./actionPlan.utils";
import { getActionPlanStatusComboboxOptions } from "./popupActionPlan.helpers";
import ActionPlanGeneralTab from "./ActionPlanGeneralTab";
import ActionPlanTasksTab from "./ActionPlanTasksTab";

interface PopupActionPlanProps {
  open: boolean;
  item: ActionPlanDetail | null;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}

const EMPTY_GUID = "00000000-0000-0000-0000-000000000000";

function parseDateInput(value: string | undefined | null): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

export function isAssigneeSectionVisible(isNew: boolean): boolean {
  return shouldShowAssigneeSection(isNew);
}

export function getPopupSaveStatus(status: number, isNew: boolean): number {
  return normalizeActionPlanStatusForSave(status, isNew);
}

export function getPopupPanelInitialOpenState(
  item?: Pick<ActionPlanDetail, "IsEdit"> | null,
): boolean {
  return !item?.IsEdit;
}

export function isActionPlanTasksTabEnabled(isNew: boolean): boolean {
  return !isNew;
}

export function shouldShowActionPlanSidePanel(
  activeTab: ActionPlanPopupTab,
  isPanelOpen: boolean,
): boolean {
  return activeTab === "general" && isPanelOpen;
}

export default function PopupActionPlan({
  open,
  item,
  onOpenChange,
  onChanged,
}: PopupActionPlanProps) {
  const { savePlan, isMutating } = useActionPlan();
  const cycleOptions = useCycleOptions(open);
  const uploadRef = useRef<UploadFileRef>(null);
  const [formScrollContainer, setFormScrollContainer] =
    useState<HTMLDivElement | null>(null);
  const [activeTab, setActiveTab] = useState<ActionPlanPopupTab>("general");

  const [form, setForm] = useState<ActionPlanFormState>({
    Id: item?.Id ?? EMPTY_GUID,
    CycleId: item?.CycleId ?? "",
    Title: item?.Title ?? "",
    Description: item?.Description ?? "",
    StandardId: item?.StandardId ?? "",
    CriterionId: item?.CriterionId ?? "",
    Priority: String(item?.Priority ?? 2),
    Deadline: parseDateInput(item?.Deadline),
    SourceFindingId: item?.SourceFindingId ?? "",
    Status: Number(item?.Status ?? 1),
  });
  const [assignedTo, setAssignedTo] = useState<string[]>(
    item?.Assignees?.map((a) => a.UserId) ?? [],
  );
  const [folderUpload, setFolderUpload] = useState<string>(uuidv4());
  const [listAttachment, setListAttachment] = useState<Attachment[]>([]);
  const [pendingFindingCriterionId, setPendingFindingCriterionId] = useState<
    string | null
  >(null);
  const [isPanelOpen, setIsPanelOpen] = useState(true);

  useEffect(() => {
    if (!open) {
      return;
    }

    setForm({
      Id: item?.Id ?? EMPTY_GUID,
      CycleId: item?.CycleId ?? "",
      Title: item?.Title ?? "",
      Description: item?.Description ?? "",
      StandardId: item?.StandardId ?? "",
      CriterionId: item?.CriterionId ?? "",
      Priority: String(item?.Priority ?? 2),
      Deadline: parseDateInput(item?.Deadline),
      SourceFindingId: item?.SourceFindingId ?? "",
      Status: Number(item?.Status ?? 1),
    });
    setAssignedTo(item?.Assignees?.map((a) => a.UserId) ?? []);
    setFolderUpload(uuidv4());
    setListAttachment((item?.Attachments ?? []) as Attachment[]);
    setPendingFindingCriterionId(null);
    setActiveTab("general");
    setIsPanelOpen(getPopupPanelInitialOpenState(item));
  }, [item, open]);

  const councilRoleQuery = useQuery({
    queryKey: ["action-plan", "my-council-role", form.CycleId],
    queryFn: async (): Promise<number> => {
      if (!form.CycleId) {
        return 0;
      }

      const response = await actionPlanService.getMyCouncilRole(form.CycleId);
      if (!response.Success || response.Data == null) {
        return 0;
      }

      return response.Data;
    },
    enabled: open && Boolean(form.CycleId),
  });

  const standards = useStandardsByCycle(form.CycleId || undefined);
  const criteria = useCriteriaByStandard(form.StandardId || undefined);
  const { members: assignableMembers } = useAssignableUsersOptions(open);
  const currentActionPlanId =
    !form.Id || form.Id === EMPTY_GUID ? null : form.Id;

  const findingsQuery = useQuery({
    queryKey: ["action-plan", "findings", form.CycleId, currentActionPlanId],
    queryFn: async (): Promise<ExternalFindingOption[]> => {
      const response = await actionPlanService.getExternalReviewFindings({
        CycleId: form.CycleId || null,
        CurrentActionPlanId: currentActionPlanId,
      });
      if (!response.Success || !response.Data) {
        return [];
      }
      return response.Data;
    },
    enabled: open && Boolean(form.CycleId),
  });

  const findings = useMemo(
    () => findingsQuery.data ?? [],
    [findingsQuery.data],
  );
  const statusOptions = useMemo(() => getActionPlanStatusComboboxOptions(), []);
  const currentStatus = Number(form.Status) as ActionPlanStatus;
  const isNew = !item?.Id || item.Id === EMPTY_GUID;
  const isStatusChangeable = canChangeStatus(councilRoleQuery.data ?? 0);
  const canEditFields = canEditActionPlan(currentStatus);
  const isCompleted = currentStatus === 4;
  const isCouncilEdit = canChangeStatus(councilRoleQuery.data ?? 0);

  const handleChangeFinding = (finding: ExternalFindingOption) => {
    setForm((prev) => ({
      ...prev,
      SourceFindingId: finding.Id,
      StandardId: finding.StandardId ?? "",
      CriterionId: "",
      Title: prev.Title || "Cải tiến từ phát hiện",
      Description: finding.Content,
    }));

    setPendingFindingCriterionId(finding.CriterionId ?? null);
  };

  const handleSave = async () => {
    const saveStatus = getPopupSaveStatus(Number(form.Status), isNew);

    if (isStatusChangeable && saveStatus === 2 && assignedTo.length === 0) {
      toast.error(
        "Vui lòng chọn ít nhất một người thực hiện trước khi chuyển sang Đang thực hiện.",
      );
      return;
    }

    const uploadSuccess = await uploadRef.current?.upload();
    if (uploadSuccess === false) {
      return;
    }

    await savePlan({
      Id: form.Id,
      CycleId: form.CycleId,
      Title: form.Title,
      Description: form.Description || null,
      StandardId: form.StandardId || null,
      CriterionId: form.CriterionId || null,
      Priority: Number(form.Priority) as ActionPriority,
      Deadline: form.Deadline
        ? new Date(form.Deadline).toISOString()
        : new Date().toISOString(),
      SourceFindingId: form.SourceFindingId || null,
      AssignedTo: isNew ? [] : assignedTo,
      Status: saveStatus,
      AttachmentIds: listAttachment.map((attachment) => attachment.Id),
      FolderUpload: folderUpload,
      IsActived: true,
    });

    onChanged();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[94vh] w-[96vw] max-w-[96vw] overflow-hidden p-0 sm:max-w-[1420px]"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Kế hoạch cải tiến</DialogTitle>

        <div className="relative flex max-h-[94vh] overflow-hidden">
          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-r bg-white">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b p-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {isNew ? "Tạo kế hoạch cải tiến" : item?.Title}
                </h2>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => onOpenChange(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <Tabs
              value={activeTab}
              onValueChange={(value) => setActiveTab(value as ActionPlanPopupTab)}
              className="flex min-h-0 flex-1 flex-col overflow-hidden"
            >
              <div className="shrink-0 border-b px-4 pt-3">
                <TabsList className="grid w-full max-w-sm grid-cols-2">
                  <TabsTrigger value="general">Thông tin chung</TabsTrigger>
                  <TabsTrigger
                    value="tasks"
                    disabled={!isActionPlanTasksTabEnabled(isNew)}
                  >
                    Nội dung công việc
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent
                value="general"
                className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden"
              >
                <ActionPlanGeneralTab
                  form={form}
                  setForm={setForm}
                  isNew={isNew}
                  canEditFields={canEditFields}
                  isStatusChangeable={isStatusChangeable}
                  isCompleted={isCompleted}
                  item={item}
                  findings={findings}
                  assignableMembers={assignableMembers}
                  assignedTo={assignedTo}
                  setAssignedTo={setAssignedTo}
                  uploadRef={uploadRef}
                  folderUpload={folderUpload}
                  listAttachment={listAttachment}
                  setListAttachment={setListAttachment}
                  formScrollContainer={formScrollContainer}
                  setFormScrollContainer={setFormScrollContainer}
                  pendingFindingCriterionId={pendingFindingCriterionId}
                  standards={standards}
                  criteria={criteria}
                  cycleOptions={cycleOptions}
                  statusOptions={statusOptions}
                  setPendingFindingCriterionId={setPendingFindingCriterionId}
                />
              </TabsContent>

              <TabsContent
                value="tasks"
                className="mt-0 flex-1 overflow-y-auto px-5 py-5"
              >
                {!isNew && (
                  <ActionPlanTasksTab
                    planId={form.Id}
                    isCouncilEdit={isCouncilEdit}
                    open={open && activeTab === "tasks"}
                  />
                )}
              </TabsContent>
            </Tabs>

            {activeTab === "general" && (
              <div className="flex shrink-0 justify-end gap-2 border-t bg-white p-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                >
                  {isCompleted && !isStatusChangeable ? "Đóng" : "Hủy"}
                </Button>
                {(isStatusChangeable || canEditFields || isNew) && (
                  <Button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={
                      isMutating || !form.Title || !form.CycleId || !form.Deadline
                    }
                  >
                    {isMutating ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : null}
                    Lưu
                  </Button>
                )}
              </div>
            )}

            {activeTab === "general" && (
              <button
                type="button"
                onClick={() => setIsPanelOpen((value) => !value)}
                className="absolute right-0 top-1/2 z-10 flex h-10 w-3.5 -translate-y-1/2 items-center justify-center rounded-l bg-sky-500 text-white shadow-md hover:bg-sky-600"
                aria-label={isPanelOpen ? "Ẩn kiến nghị" : "Hiện kiến nghị"}
              >
                {isPanelOpen ? (
                  <ChevronRight className="h-3 w-3" />
                ) : (
                  <ChevronLeft className="h-3 w-3" />
                )}
              </button>
            )}
          </div>

          {shouldShowActionPlanSidePanel(activeTab, isPanelOpen) && (
            <div className="w-80 shrink-0 overflow-auto border-l bg-slate-50 p-5">
              <div className="mb-3">
                <h3 className="text-base font-semibold text-slate-900">
                  Kiến nghị từ CHECK
                </h3>
                <p className="text-xs text-slate-500">
                  Chọn để điền nhanh vào biểu mẫu.
                </p>
              </div>

              {!form.CycleId ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
                  Chọn chu kỳ để tải danh sách phát hiện.
                </div>
              ) : findingsQuery.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Đang tải...
                </div>
              ) : findings.length > 0 ? (
                <div className="space-y-3">
                  {findings.map((finding) => {
                    const isSelected = finding.Id === form.SourceFindingId;

                    return (
                      <button
                        key={finding.Id}
                        type="button"
                        onClick={() =>
                          (canEditFields || isNew) &&
                          handleChangeFinding(finding)
                        }
                        disabled={!canEditFields && !isNew}
                        className={[
                          "w-full rounded-xl border p-4 text-left shadow-sm transition",
                          isSelected
                            ? "border-sky-400 bg-sky-50 ring-2 ring-sky-400"
                            : "border-slate-200 bg-white hover:border-sky-300 hover:bg-sky-50/40",
                          !canEditFields && !isNew ? "cursor-default opacity-60" : "",
                        ].join(" ")}
                      >
                        <p className="text-sm font-medium text-slate-900">
                          {finding.Summary ?? finding.Content}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          Tiêu chuẩn:{" "}
                          {finding.StandardCode && finding.StandardName
                            ? `${finding.StandardCode} - ${finding.StandardName}`
                            : finding.StandardCode ||
                              finding.StandardName ||
                              "Không có tiêu chuẩn"}
                        </p>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">
                  Không có phát hiện nào cho chu kỳ này.
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
