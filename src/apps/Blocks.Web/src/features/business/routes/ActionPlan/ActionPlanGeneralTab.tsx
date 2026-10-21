import { useEffect, useMemo } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import { format } from "date-fns";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/datepicker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import MultipleSelector, { type Option } from "@/components/ui/multi-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import UploadFile, { type UploadFileRef } from "@/components/ui/upload-file";
import type { ActionPlanDetail, ActionPlanStatus, AssignableMember, ExternalFindingOption } from "@/features/business/types/actionPlan.types";
import type { Attachment } from "@/features/file/types/uploadfile.types";
import type { ModelCombobox } from "@/types/base/base.types";
import { useCycleOptions } from "@/features/business/hooks/useCycleOptions";
import { useStandardsByCycle } from "@/features/business/hooks/useStandardsByCycle";
import { useCriteriaByStandard } from "@/features/business/hooks/useCriteriaByStandard";
import { shouldShowAssigneeSection } from "./actionPlan.utils";
import { resolveCriterionSelection } from "./popupActionPlan.helpers";
import type { ActionPlanFormState } from "./actionPlanPopup.types";

function parseLocalDate(value: string | undefined | null): Date | undefined {
  if (!value) {
    return undefined;
  }

  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return undefined;
  }

  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

interface ActionPlanGeneralTabProps {
  form: ActionPlanFormState;
  setForm: Dispatch<SetStateAction<ActionPlanFormState>>;
  isNew: boolean;
  canEditFields: boolean;
  isStatusChangeable: boolean;
  isCompleted: boolean;
  item: ActionPlanDetail | null;
  findings: ExternalFindingOption[];
  assignableMembers: AssignableMember[];
  assignedTo: string[];
  setAssignedTo: Dispatch<SetStateAction<string[]>>;
  uploadRef: RefObject<UploadFileRef | null>;
  folderUpload: string;
  listAttachment: Attachment[];
  setListAttachment: Dispatch<SetStateAction<Attachment[]>>;
  formScrollContainer: HTMLDivElement | null;
  setFormScrollContainer: (el: HTMLDivElement | null) => void;
  pendingFindingCriterionId: string | null;
  standards: ReturnType<typeof useStandardsByCycle>;
  criteria: ReturnType<typeof useCriteriaByStandard>;
  cycleOptions: ReturnType<typeof useCycleOptions>;
  statusOptions: ModelCombobox[];
  setPendingFindingCriterionId: Dispatch<SetStateAction<string | null>>;
}

export default function ActionPlanGeneralTab({
  form,
  setForm,
  isNew,
  canEditFields,
  isStatusChangeable,
  isCompleted,
  item,
  findings,
  assignableMembers,
  assignedTo,
  setAssignedTo,
  uploadRef,
  folderUpload,
  listAttachment,
  setListAttachment,
  formScrollContainer,
  setFormScrollContainer,
  pendingFindingCriterionId,
  standards,
  criteria,
  cycleOptions,
  statusOptions,
  setPendingFindingCriterionId,
}: ActionPlanGeneralTabProps) {
  const currentStatus = Number(form.Status) as ActionPlanStatus;
  const canEditAssignees = isStatusChangeable;
  const selectedFinding = useMemo(
    () => findings.find((finding) => finding.Id === form.SourceFindingId) ?? null,
    [findings, form.SourceFindingId],
  );

  const assignableMemberLabel = (member: AssignableMember) =>
    member.Fullname || member.Username || member.UserId;

  const assigneeOptions = useMemo<Option[]>(
    () =>
      assignableMembers.map((member) => ({
        value: member.UserId,
        label: assignableMemberLabel(member),
      })),
    [assignableMembers],
  );

  const selectedAssigneeOptions = useMemo<Option[]>(
    () =>
      assignedTo.map((userId) => {
        const option = assigneeOptions.find((item) => item.value === userId);
        return option ?? { value: userId, label: userId };
      }),
    [assignedTo, assigneeOptions],
  );

  useEffect(() => {
    if (!pendingFindingCriterionId || criteria.isLoading) {
      return;
    }

    const resolvedCriterionId = resolveCriterionSelection(
      pendingFindingCriterionId,
      criteria.options ?? [],
    );

    setForm((prev) => ({ ...prev, CriterionId: resolvedCriterionId }));
    setPendingFindingCriterionId(null);
  }, [criteria.isLoading, criteria.options, pendingFindingCriterionId, setForm, setPendingFindingCriterionId]);

  return (
    <div
      ref={setFormScrollContainer}
      className="relative flex-1 overflow-y-auto p-5"
    >
      <div className="grid gap-4">
        {currentStatus === 3 && (
          <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
            Tất cả công việc đã hoàn thành. CTH/PCT có thể xác nhận hoặc yêu cầu
            thực hiện lại.
          </div>
        )}

        {isCompleted && item?.CompletedAt && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            <p className="font-medium">Đã hoàn thành</p>
            <p className="mt-1 text-xs text-green-600">
              Bởi {item.CompletedBy} -{" "}
              {new Date(item.CompletedAt).toLocaleDateString("vi-VN")}
            </p>
          </div>
        )}

        <div className="grid gap-2">
          <Label>
            Tên kế hoạch <span className="text-red-500">*</span>
          </Label>
          <Input
            value={form.Title}
            readOnly={!canEditFields && !isNew}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, Title: e.target.value }))
            }
            placeholder="Nhập tên kế hoạch cải tiến..."
          />
        </div>

        <div className="grid gap-2">
          <Label>
            Chu kỳ <span className="text-red-500">*</span>
          </Label>
          <Combobox
            options={cycleOptions.options ?? []}
            loading={cycleOptions.isLoading}
            value={form.CycleId || undefined}
            onValueChange={(value) => {
              setForm((prev) => ({
                ...prev,
                CycleId: value || "",
                StandardId: "",
                CriterionId: "",
              }));
              setPendingFindingCriterionId(null);
            }}
            placeholder="Chọn chu kỳ"
            searchPlaceholder="Tìm chu kỳ..."
            emptyText="Không tìm thấy chu kỳ."
            disabled={!isNew && !canEditFields}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label>Tiêu chuẩn</Label>
            <Combobox
              options={(standards.options ?? []).map((standard) => ({
                Value: standard.Value,
                Text: standard.Text,
              }))}
              loading={standards.isLoading}
              value={form.StandardId || undefined}
              onValueChange={(value) => {
                setForm((prev) => ({
                  ...prev,
                  StandardId: value || "",
                  CriterionId: "",
                }));
                setPendingFindingCriterionId(null);
              }}
              placeholder="Chọn tiêu chuẩn..."
              emptyText="Không có tiêu chuẩn."
              disabled={(!canEditFields && !isNew) || !form.CycleId}
            />
          </div>
          <div className="grid gap-2">
            <Label>Tiêu chí</Label>
            <Combobox
              options={(criteria.options ?? []).map((criterion) => ({
                Value: criterion.Value,
                Text: criterion.Text,
              }))}
              loading={criteria.isLoading}
              value={form.CriterionId || undefined}
              onValueChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  CriterionId: value || "",
                }))
              }
              placeholder="Chọn tiêu chí..."
              emptyText="Không có tiêu chí."
              disabled={(!canEditFields && !isNew) || !form.StandardId}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="grid gap-2">
            <Label>Trạng thái</Label>
            <Combobox
              options={statusOptions}
              value={String(form.Status)}
              onValueChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  Status: Number(value || prev.Status),
                }))
              }
              placeholder="Chọn trạng thái..."
              emptyText="Không có trạng thái."
              readonly={isNew || !isStatusChangeable}
            />
          </div>

          <div className="grid gap-2">
            <Label>Ưu tiên</Label>
            <Select
              value={form.Priority}
              onValueChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  Priority: value,
                }))
              }
            >
              <SelectTrigger
                className="w-full"
                disabled={!canEditFields && !isNew}
              >
                <SelectValue placeholder="Chọn ưu tiên..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Cao</SelectItem>
                <SelectItem value="2">Trung bình</SelectItem>
                <SelectItem value="3">Thấp</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label>
              Thời hạn <span className="text-red-500">*</span>
            </Label>
            <DatePicker
              className="w-full"
              optionLabel="Chọn thời hạn"
              value={parseLocalDate(form.Deadline)}
              onChange={(date) =>
                setForm((prev) => ({
                  ...prev,
                  Deadline: date ? format(date, "yyyy-MM-dd") : "",
                }))
              }
              disabled={!canEditFields && !isNew}
              required
            />
          </div>
        </div>

        <div className="grid gap-2">
          <Label>Mô tả</Label>
          <Textarea
            value={form.Description ?? ""}
            readOnly={!canEditFields && !isNew}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                Description: e.target.value,
              }))
            }
            rows={4}
            placeholder="Mô tả kế hoạch cải tiến..."
          />
        </div>

        <div className="grid gap-2">
          <Label>Kiến nghị từ CHECK</Label>
          {selectedFinding ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm text-amber-900">{selectedFinding.Content}</p>
              {(canEditFields || isNew) && (
                <button
                  type="button"
                  onClick={() => {
                    setForm((prev) => ({
                      ...prev,
                      SourceFindingId: "",
                    }));
                    setPendingFindingCriterionId(null);
                  }}
                  className="mt-2 text-xs text-amber-600 hover:text-amber-800"
                >
                  ✕ Bỏ chọn
                </button>
              )}
            </div>
          ) : (
            <p className="text-sm italic text-slate-400">
              Chọn kiến nghị từ phần bên phải để tự điền
            </p>
          )}
        </div>

        {shouldShowAssigneeSection(isNew) && (
          <div className="grid gap-2">
            <Label>Người thực hiện</Label>
            {canEditAssignees ? (
              <>
                <MultipleSelector
                  value={selectedAssigneeOptions}
                  options={assigneeOptions}
                  onChange={(options) =>
                    setAssignedTo(options.map((option) => option.value))
                  }
                  placeholder="Thêm người thực hiện..."
                  hidePlaceholderWhenSelected
                  portalContainer={formScrollContainer}
                />
                <div className="hidden">
                  <Combobox
                    options={assignableMembers.map((member) => ({
                      Value: member.UserId,
                      Text: assignableMemberLabel(member),
                    }))}
                    value={undefined}
                    onValueChange={(value) => {
                      if (value && !assignedTo.includes(value)) {
                        setAssignedTo((prev) => [...prev, value]);
                      }
                    }}
                    placeholder="Thêm người thực hiện..."
                    emptyText="Không có thành viên phù hợp."
                  />
                  {assignedTo.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {assignedTo.map((userId) => {
                        const member = assignableMembers.find(
                          (item) => item.UserId === userId,
                        );
                        return (
                          <span
                            key={userId}
                            className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-800"
                          >
                            {member ? assignableMemberLabel(member) : userId}
                            <button
                              type="button"
                              onClick={() =>
                                setAssignedTo((prev) =>
                                  prev.filter((id) => id !== userId),
                                )
                              }
                              className="ml-1 text-blue-500 hover:text-blue-800"
                            >
                              ×
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-wrap gap-2">
                {item?.Assignees?.length ? (
                  item.Assignees.map((assignee) => (
                    <span
                      key={assignee.UserId}
                      className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700"
                    >
                      {assignee.Fullname ?? assignee.Username ?? assignee.UserId}
                    </span>
                  ))
                ) : (
                  <p className="text-sm italic text-slate-400">
                    Chưa có người thực hiện
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <div className="grid gap-2">
          <Label>Tài liệu đính kèm</Label>
          <UploadFile
            ref={uploadRef}
            folderUpload={folderUpload}
            listAttachment={listAttachment}
            setListAttachment={setListAttachment}
            readonly={!canEditFields && !isNew}
            multiFile
            previewContext="ActionPlan"
          />
        </div>
      </div>

    </div>
  );
}
