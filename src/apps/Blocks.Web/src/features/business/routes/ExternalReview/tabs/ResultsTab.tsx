import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  FindingType,
  type AddExternalReviewFindingRequest,
  type ExternalReviewFinding,
  type ExternalReviewResult,
  type UpdateExternalReviewFindingRequest,
} from "@/features/business/types/externalReview.types";
import type { ModelCombobox } from "@/types/base/base.types";

interface ResultsTabProps {
  standards: ModelCombobox[];
  results: ExternalReviewResult[];
  isSubmitting: boolean;
  isReadOnly: boolean;
  onUpsertResult: (payload: {
    standardId: string;
    strengths?: string | null;
  }) => Promise<ExternalReviewResult>;
  onAddFinding: (payload: AddExternalReviewFindingRequest) => Promise<void>;
  onUpdateFinding: (payload: UpdateExternalReviewFindingRequest) => Promise<void>;
  onDeleteFinding: (findingId: string) => Promise<void>;
}

const FINDING_TYPE_OPTIONS = [
  { Value: "0", Text: "Cần cải tiến" },
  { Value: "1", Text: "Kiến nghị" },
];

interface FindingModal {
  open: boolean;
  mode: "add" | "edit";
  resultId: string;
  findingId?: string;
  findingType: string;
  content: string;
}

const CLOSED_MODAL: FindingModal = {
  open: false,
  mode: "add",
  resultId: "",
  findingType: "0",
  content: "",
};

export function ResultsTab({
  standards,
  results,
  isSubmitting,
  isReadOnly,
  onUpsertResult,
  onAddFinding,
  onUpdateFinding,
  onDeleteFinding,
}: ResultsTabProps) {
  const [openStandardId, setOpenStandardId] = useState<string | null>(null);
  const [strengthsMap, setStrengthsMap] = useState<Record<string, string>>({});
  const [modal, setModal] = useState<FindingModal>(CLOSED_MODAL);

  const totalImprove = results
    .flatMap((r) => r.Findings)
    .filter((f) => f.FindingType === FindingType.Improve).length;
  const totalRec = results
    .flatMap((r) => r.Findings)
    .filter((f) => f.FindingType === FindingType.Recommendation).length;

  const getResult = (standardId: string): ExternalReviewResult | null =>
    results.find((r) => r.StandardId === standardId) ?? null;

  const getStrengths = (standardId: string): string => {
    if (strengthsMap[standardId] !== undefined) {
      return strengthsMap[standardId];
    }

    return getResult(standardId)?.Strengths ?? "";
  };

  const handleUpsertResult = async (standardId: string) => {
    await onUpsertResult({
      standardId,
      strengths: getStrengths(standardId).trim() || null,
    });

    setStrengthsMap((prev) => {
      const next = { ...prev };
      delete next[standardId];
      return next;
    });
  };

  const handleStartAddFinding = async (
    standardId: string,
    resultId: string | undefined,
    findingType: "0" | "1",
  ) => {
    if (resultId) {
      openAddModal(resultId, findingType);
      return;
    }

    const upserted = await onUpsertResult({
      standardId,
      strengths: null,
    });

    if (!upserted?.Id) {
      return;
    }

    openAddModal(upserted.Id, findingType);
  };

  const openAddModal = (resultId: string, findingType: "0" | "1") => {
    setModal({ open: true, mode: "add", resultId, findingType, content: "" });
  };

  const openEditModal = (resultId: string, finding: ExternalReviewFinding) => {
    setModal({
      open: true,
      mode: "edit",
      resultId,
      findingId: finding.Id,
      findingType: String(finding.FindingType),
      content: finding.Content,
    });
  };

  const handleSaveModal = async () => {
    if (!modal.content.trim() || !modal.resultId) {
      return;
    }

    if (modal.mode === "add") {
      await onAddFinding({
        ExternalReviewResultId: modal.resultId,
        FindingType: Number(modal.findingType),
        Content: modal.content.trim(),
        CriterionId: null,
      });
    } else if (modal.findingId) {
      await onUpdateFinding({
        FindingId: modal.findingId,
        FindingType: Number(modal.findingType),
        Content: modal.content.trim(),
        CriterionId: null,
      });
    }

    setModal(CLOSED_MODAL);
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            label: "TC đã nhập",
            value: results.length,
            color: "bg-blue-50 border-blue-200 text-blue-700",
          },
          {
            label: "Cần cải tiến",
            value: totalImprove,
            color: "bg-red-50 border-red-200 text-red-700",
          },
          {
            label: "Kiến nghị",
            value: totalRec,
            color: "bg-yellow-50 border-yellow-200 text-yellow-700",
          },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className={`rounded-lg border p-3 text-center ${color}`}
          >
            <div className="text-2xl font-bold">{value}</div>
            <div className="mt-0.5 text-xs">{label}</div>
          </div>
        ))}
      </div>

      <div className="divide-y overflow-hidden rounded-lg border border-gray-200 bg-white">
        {standards.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-400">
            Không có tiêu chuẩn nào trong chu kỳ này.
          </div>
        ) : (
          standards.map((std) => {
            const stdId = std.Value ?? "";
            const result = getResult(stdId);
            const isOpen = openStandardId === stdId;
            const findings = result?.Findings ?? [];
            const improveCount = findings.filter(
              (f) => f.FindingType === FindingType.Improve,
            ).length;
            const recCount = findings.filter(
              (f) => f.FindingType === FindingType.Recommendation,
            ).length;

            return (
              <div key={stdId}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-gray-50"
                  onClick={() => setOpenStandardId(isOpen ? null : stdId)}
                >
                  <div className="flex items-center gap-3">
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />
                    )}
                    <span className="text-sm font-medium text-gray-800">
                      {std.Text}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    {improveCount > 0 ? (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-600">
                        {improveCount} cần cải tiến
                      </span>
                    ) : null}
                    {recCount > 0 ? (
                      <span className="rounded-full bg-yellow-50 px-2 py-0.5 text-yellow-600">
                        {recCount} kiến nghị
                      </span>
                    ) : null}
                  </div>
                </button>

                {isOpen ? (
                  <div className="space-y-4 border-t border-gray-100 bg-slate-50 px-4 py-4">
                    <div className="space-y-1.5">
                      <p className="text-xs font-semibold text-gray-600">
                        Điểm mạnh
                      </p>
                      <Textarea
                        rows={3}
                        value={getStrengths(stdId)}
                        onChange={(e) =>
                          setStrengthsMap((prev) => ({
                            ...prev,
                            [stdId]: e.target.value,
                          }))
                        }
                        placeholder="Nhập điểm mạnh cho tiêu chuẩn này..."
                        disabled={isSubmitting || isReadOnly}
                      />
                      {!isReadOnly ? (
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => void handleUpsertResult(stdId)}
                          disabled={isSubmitting}
                        >
                          Lưu kết quả
                        </Button>
                      ) : null}
                    </div>

                    {findings.length > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-gray-600">
                          Phát hiện
                        </p>
                        <div className="divide-y overflow-hidden rounded border border-gray-200 bg-white">
                          {findings.map((f) => (
                            <div
                              key={f.Id}
                              className="flex items-start justify-between gap-3 p-3"
                            >
                              <div className="min-w-0 space-y-1">
                                <span
                                  className={[
                                    "inline-block rounded-full px-2 py-0.5 text-xs font-semibold",
                                    f.FindingType === FindingType.Improve
                                      ? "bg-red-50 text-red-700"
                                      : "bg-yellow-50 text-yellow-700",
                                  ].join(" ")}
                                >
                                  {f.FindingType === FindingType.Improve
                                    ? "Cần cải tiến"
                                    : "Kiến nghị"}
                                </span>
                                <p className="text-sm text-gray-800">
                                  {f.Content}
                                </p>
                              </div>
                              {!isReadOnly ? (
                                <div className="flex shrink-0 gap-1">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() =>
                                      openEditModal(result?.Id ?? "", f)
                                    }
                                    disabled={isSubmitting}
                                  >
                                    Sửa
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => void onDeleteFinding(f.Id)}
                                    disabled={isSubmitting}
                                  >
                                    Xóa
                                  </Button>
                                </div>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {!isReadOnly ? (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            void handleStartAddFinding(stdId, result?.Id, "0")
                          }
                          disabled={isSubmitting}
                          className="border-red-200 text-red-700 hover:bg-red-50"
                        >
                          + Thêm Cần cải tiến
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            void handleStartAddFinding(stdId, result?.Id, "1")
                          }
                          disabled={isSubmitting}
                          className="border-yellow-200 text-yellow-700 hover:bg-yellow-50"
                        >
                          + Thêm Kiến nghị
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <Dialog
        open={modal.open}
        onOpenChange={(open) => { if (!open) setModal(CLOSED_MODAL); }}
      >
        <DialogContent className="max-w-md">
          <DialogTitle>
            {modal.mode === "add" ? "Thêm phát hiện" : "Chỉnh sửa phát hiện"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Biểu mẫu nhập nội dung và loại phát hiện cho kết quả đánh giá ngoài.
          </DialogDescription>

          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-600">
                Loại phát hiện
              </label>
              <Combobox
                options={FINDING_TYPE_OPTIONS}
                value={modal.findingType}
                onValueChange={(v) => setModal((m) => ({ ...m, findingType: v }))}
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-slate-600">
                Nội dung
              </label>
              <Textarea
                rows={4}
                value={modal.content}
                onChange={(e) => setModal((m) => ({ ...m, content: e.target.value }))}
                placeholder="Nhập nội dung phát hiện..."
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => setModal(CLOSED_MODAL)}
                disabled={isSubmitting}
              >
                Hủy
              </Button>
              <Button
                onClick={() => void handleSaveModal()}
                disabled={!modal.content.trim() || isSubmitting}
              >
                {isSubmitting ? "Đang lưu..." : "Lưu"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
