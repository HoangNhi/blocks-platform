import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { v4 as uuidv4 } from "uuid";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import type { UploadFileRef } from "@/components/ui/upload-file";
import type { Attachment } from "@/features/file/types/uploadfile.types";
import { cycleService } from "@/features/business/api/cycle.api";
import { CriteriaMappingPanel } from "./components/CriteriaMappingPanel";
import { ApprovalActions } from "./components/ApprovalActions";
import { EvidenceFormFields } from "@/features/business/components/EvidenceFormFields";
import type {
  EvidenceCycleMap,
  ModelVerifiedEvidenceForReuse,
} from "../../types/evidence-cycle-map.types";
import { evidenceCycleMapService } from "../../api/evidenceCycleMap.api";
import PopupReuseEvidence from "./PopupReuseEvidence";

interface PopupEvidenceCycleMapProps {
  evidenceCycleMap: EvidenceCycleMap | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  saveChange: (data: EvidenceCycleMap, isAddMore: boolean) => void;
  isLoading?: boolean;
  onApprove: (id: string, status: number, reason?: string) => void;
  isApproving?: boolean;
  readOnly?: boolean;
  isExternalViewer?: boolean;
}

const formSchema = z
  .object({
    id: z.string(),
    evidenceId: z.string(),
    name: z.string().min(1, "Tên minh chứng không được để trống"),
    code: z.string().min(1, "Mã minh chứng không được để trống"),
    status: z.string(),
    issueDate: z.string().optional(),
    issuingAuthority: z.string().optional(),
    expiryDate: z.string().optional(),
    fileTypeId: z.string().min(1, "Vui lòng chọn loại tài liệu"),
    description: z.string().optional(),
    rejectionReason: z.string().optional(),
    cycleId: z.string().min(1, "Vui lòng chọn chu kỳ"),
  })
  .refine(
    (data) => {
      if (data.issueDate && data.expiryDate) {
        return new Date(data.issueDate) <= new Date(data.expiryDate);
      }
      return true;
    },
    {
      message: "Ngày hết hạn phải sau ngày ban hành",
      path: ["expiryDate"],
    },
  );

const PopupEvidenceCycleMap = ({
  evidenceCycleMap,
  isOpen,
  onOpenChange,
  saveChange,
  isLoading,
  onApprove,
  isApproving,
  readOnly,
  isExternalViewer,
}: PopupEvidenceCycleMapProps) => {
  const { user } = useAuth();
  const [assignedStandardIds, setAssignedStandardIds] = useState<string[]>([]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      id: evidenceCycleMap?.Id || uuidv4(),
      evidenceId: evidenceCycleMap?.EvidenceId || "",
      name: evidenceCycleMap?.Evidence?.Name || "",
      code: evidenceCycleMap?.Evidence?.Code || "",
      status: evidenceCycleMap?.Evidence?.Status?.toString() || "1",
      issueDate: evidenceCycleMap?.Evidence?.IssueDate
        ? format(new Date(evidenceCycleMap.Evidence.IssueDate), "yyyy-MM-dd")
        : "",
      issuingAuthority: evidenceCycleMap?.Evidence?.IssuingAuthority || "",
      expiryDate: evidenceCycleMap?.Evidence?.ExpiryDate
        ? format(new Date(evidenceCycleMap.Evidence.ExpiryDate), "yyyy-MM-dd")
        : "",
      fileTypeId: evidenceCycleMap?.Evidence?.FileTypeId || "",
      description: evidenceCycleMap?.Evidence?.Description || "",
      rejectionReason: evidenceCycleMap?.Evidence?.RejectionReason || "",
      cycleId: evidenceCycleMap?.CycleId || "",
    },
  });

  const [standardSetId, setStandardSetId] = useState<string>("");
  const uploadRef = useRef<UploadFileRef>(null);
  const [folderUpload, setFolderUpload] = useState<string>(
    evidenceCycleMap?.Evidence?.FolderUpload || uuidv4(),
  );
  const [listAttachment, setListAttachment] = useState<Attachment[]>(
    evidenceCycleMap?.Evidence?.ListAttachment || [],
  );

  const status = form.watch("status");
  const isPending = !!readOnly || status === "2" || status === "3";
  const cycleIdForm = form.watch("cycleId");
  const fileTypeIdForm = form.watch("fileTypeId");

  const [attachmentError, setAttachmentError] = useState<string>("");

  // Reuse evidence popup state
  const [showReusePopup, setShowReusePopup] = useState(false);
  const [pendingReuseEvidence, setPendingReuseEvidence] =
    useState<ModelVerifiedEvidenceForReuse | null>(null);
  const queryClient = useQueryClient();
  const isExternalReviewerView = !!isExternalViewer;

  const reuseMutation = useMutation({
    mutationFn: () =>
      evidenceCycleMapService.reuseVerifiedEvidence({
        EvidenceId: pendingReuseEvidence!.EvidenceId,
        TargetCycleId: cycleIdForm,
      }),
    onSuccess: () => {
      toast.success("Tái sử dụng minh chứng thành công");
      queryClient.invalidateQueries({ queryKey: ["evidenceCycleMaps"] });
      setPendingReuseEvidence(null);
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Có lỗi xảy ra");
    },
  });

  const cycleId_Change = async (val: string) => {
    if (!val) {
      setStandardSetId("");
      setAssignedStandardIds([]);
      return;
    }

    if (isExternalReviewerView) {
      setStandardSetId(evidenceCycleMap?.StandardSetId || "");
      setAssignedStandardIds([]);
      return;
    }

    const res = await cycleService.getById(val);
    if (res.Success) {
      setStandardSetId(res.Data?.StandardSetId || "");
      // Extract assigned standards for current user
      const council = res.Data?.ListCouncil?.find((c) => c.UserId === user?.Id);
      setAssignedStandardIds(council?.AssignedStandardIds || []);
    }
  };

  // --- Sync form state when evidenceCycleMap prop changes ---
  useEffect(() => {
    if (evidenceCycleMap) {
      form.reset({
        id: evidenceCycleMap.Id || uuidv4(),
        evidenceId: evidenceCycleMap.EvidenceId || "",
        name: evidenceCycleMap.Evidence?.Name || "",
        code: evidenceCycleMap.Evidence?.Code || "",
        status: evidenceCycleMap.Evidence?.Status?.toString() || "1",
        issueDate: evidenceCycleMap.Evidence?.IssueDate
          ? format(new Date(evidenceCycleMap.Evidence.IssueDate), "yyyy-MM-dd")
          : "",
        issuingAuthority: evidenceCycleMap.Evidence?.IssuingAuthority || "",
        expiryDate: evidenceCycleMap.Evidence?.ExpiryDate
          ? format(new Date(evidenceCycleMap.Evidence.ExpiryDate), "yyyy-MM-dd")
          : "",
        fileTypeId: evidenceCycleMap.Evidence?.FileTypeId || "",
        description: evidenceCycleMap.Evidence?.Description || "",
        rejectionReason: evidenceCycleMap.Evidence?.RejectionReason || "",
        cycleId: evidenceCycleMap.CycleId || "",
      });
      setFolderUpload(evidenceCycleMap.Evidence?.FolderUpload || uuidv4());
      setListAttachment(evidenceCycleMap.Evidence?.ListAttachment || []);
      setAttachmentError("");
    } else {
      form.reset({
        id: uuidv4(),
        evidenceId: "",
        name: "",
        code: "",
        status: "1",
        issueDate: "",
        issuingAuthority: "",
        expiryDate: "",
        fileTypeId: "",
        description: "",
        rejectionReason: "",
        cycleId: "",
      });
      setFolderUpload(uuidv4());
      setListAttachment([]);
      setAttachmentError("");
    }

    cycleId_Change(evidenceCycleMap?.CycleId || "");
  }, [evidenceCycleMap, form]);

  // --- Helpers ---
  const handleAttachmentChange = (attachments: Attachment[]) => {
    setListAttachment(attachments);
    if (attachmentError) {
      setAttachmentError("");
    }
  };

  // --- Submission ---
  const onSubmit = async (
    values: z.infer<typeof formSchema>,
    isAddMore: boolean,
    status: number,
  ) => {
    if (!isPending) {
      const pendingFiles = uploadRef.current?.getPendingFiles() ?? [];
      if (listAttachment.length === 0 && pendingFiles.length === 0) {
        setAttachmentError("Vui lòng tải lên ít nhất một tệp đính kèm");
        return;
      }
    }

    // Upload files first
    const uploadSuccess = await uploadRef.current?.upload();
    if (!uploadSuccess) {
      toast.error(
        "Tải tệp thất bại. Vui lòng kiểm tra định dạng hoặc dung lượng tối đa 50MB.",
      );
      return;
    }

    // Construct data object with nested Evidence
    const saveData: EvidenceCycleMap = {
      Id: values.id,
      EvidenceId: values.evidenceId || uuidv4(),
      CycleId: values.cycleId,
      ReviewStatus: evidenceCycleMap?.ReviewStatus || 1,
      Evidence: {
        Id: evidenceCycleMap?.Evidence?.Id || values.evidenceId || uuidv4(),
        Name: values.name,
        Code: values.code,
        Status: status,
        IssueDate: values.issueDate || undefined,
        IssuingAuthority: values.issuingAuthority || undefined,
        ExpiryDate: values.expiryDate || undefined,
        FileTypeId: values.fileTypeId,
        Description: values.description || undefined,
        CycleId: values.cycleId,
        AttachmentIds: listAttachment.map((a) => a.Id),
        ListAttachment: listAttachment,
        IsEdit: evidenceCycleMap?.IsEdit || false,
        IsActived: evidenceCycleMap?.IsActived ?? true,
        FolderUpload: folderUpload,
        CreatedBy: evidenceCycleMap?.Evidence?.CreatedBy ?? "",
        CreatedAt: evidenceCycleMap?.Evidence?.CreatedAt ?? "",
      },
      IsEdit: evidenceCycleMap?.IsEdit || false,
      IsActived: evidenceCycleMap?.IsActived ?? true,
      FolderUpload: folderUpload,
      CreatedBy: evidenceCycleMap?.CreatedBy ?? "",
      CreatedAt: evidenceCycleMap?.CreatedAt ?? "",
    };

    saveChange(saveData, isAddMore);
  };

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) setPendingReuseEvidence(null);
          onOpenChange(open);
        }}
      >
        <DialogContent
          className="sm:max-w-6xl max-h-[95vh] flex flex-col min-h-0 overflow-hidden"
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <DialogHeader className="border-b pb-2">
            <DialogTitle>
              {readOnly
                ? "Xem chi tiết Minh chứng"
                : evidenceCycleMap?.IsEdit
                  ? "Cập nhật Minh chứng theo chu kỳ"
                  : "Thêm mới Minh chứng theo chu kỳ"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Biểu mẫu thêm hoặc cập nhật minh chứng theo chu kỳ đánh giá.
            </DialogDescription>
          </DialogHeader>

          {/* Scrollable Body - Split View 6/6 */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <Form {...form}>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                }}
                className="grid grid-cols-12 gap-6 flex-1 min-h-0"
              >
                {/* LEFT COLUMN - General Information */}
                <div className="col-span-6 flex flex-col min-h-0">
                  <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar space-y-4 p-2">
                    {pendingReuseEvidence && (
                      <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                        <span className="mt-0.5 shrink-0">⚠️</span>
                        <span>
                          Đang xem trước minh chứng sẽ tái sử dụng. Nhấn{" "}
                          <strong>Xác nhận tái sử dụng</strong> để lưu, hoặc{" "}
                          <strong>Huỷ xem trước</strong> để chọn lại.
                        </span>
                      </div>
                    )}
                    <EvidenceFormFields
                      form={form}
                      isPending={isPending}
                      uploadRef={uploadRef}
                      listAttachment={listAttachment}
                      folderUpload={folderUpload}
                      handleAttachmentChange={handleAttachmentChange}
                      attachmentError={attachmentError}
                      status={form.watch("status")}
                      viewerMode={
                        isExternalReviewerView ? "external" : "internal"
                      }
                      allowAttachmentDownload={!isExternalReviewerView}
                    />
                  </div>
                </div>

                {/* RIGHT COLUMN - Criteria Mapping */}
                <div className="col-span-6 flex flex-col min-h-0">
                  <CriteriaMappingPanel
                    form={form}
                    cycleIdForm={cycleIdForm}
                    fileTypeIdForm={fileTypeIdForm}
                    standardSetId={standardSetId}
                    setStandardSetId={setStandardSetId}
                    assignedStandardIds={assignedStandardIds}
                    cycleId_Change={cycleId_Change}
                    onShowReusePopup={() => setShowReusePopup(true)}
                    isPending={isPending}
                    readOnly={!!readOnly}
                  />
                </div>
              </form>
            </Form>
          </div>

          {/* Footer */}
          <DialogFooter className="border-t pt-2">
            {readOnly ? (
              <DialogClose asChild>
                <Button variant="outline">Đóng</Button>
              </DialogClose>
            ) : pendingReuseEvidence ? (
              <>
                <Button
                  variant="outline"
                  disabled={reuseMutation.isPending}
                  onClick={() => {
                    setPendingReuseEvidence(null);
                    form.reset({
                      id: evidenceCycleMap?.Id || uuidv4(),
                      evidenceId: evidenceCycleMap?.EvidenceId || "",
                      name: evidenceCycleMap?.Evidence?.Name || "",
                      code: evidenceCycleMap?.Evidence?.Code || "",
                      status:
                        evidenceCycleMap?.Evidence?.Status?.toString() || "1",
                      issueDate: evidenceCycleMap?.Evidence?.IssueDate
                        ? format(
                            new Date(evidenceCycleMap.Evidence.IssueDate),
                            "yyyy-MM-dd",
                          )
                        : "",
                      issuingAuthority:
                        evidenceCycleMap?.Evidence?.IssuingAuthority || "",
                      expiryDate: evidenceCycleMap?.Evidence?.ExpiryDate
                        ? format(
                            new Date(evidenceCycleMap.Evidence.ExpiryDate),
                            "yyyy-MM-dd",
                          )
                        : "",
                      fileTypeId: evidenceCycleMap?.Evidence?.FileTypeId || "",
                      description:
                        evidenceCycleMap?.Evidence?.Description || "",
                      rejectionReason:
                        evidenceCycleMap?.Evidence?.RejectionReason || "",
                      cycleId: cycleIdForm,
                    });
                  }}
                >
                  Huỷ xem trước
                </Button>
                <Button
                  onClick={() => reuseMutation.mutate()}
                  disabled={reuseMutation.isPending}
                >
                  {reuseMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Xác nhận tái sử dụng
                </Button>
              </>
            ) : (
              <ApprovalActions
                status={status}
                isEdit={evidenceCycleMap?.IsEdit || false}
                isLoading={isLoading}
                isApproving={isApproving}
                onApprove={(approveStatus, reason) =>
                  onApprove(evidenceCycleMap!.Id, approveStatus, reason)
                }
                onSubmit={(submitStatus) => {
                  form.handleSubmit((values) =>
                    onSubmit(values, false, submitStatus),
                  )();
                }}
              />
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PopupReuseEvidence
        isOpen={showReusePopup}
        onOpenChange={setShowReusePopup}
        targetCycleId={cycleIdForm}
        onReuseSuccess={(evidence: ModelVerifiedEvidenceForReuse) => {
          setPendingReuseEvidence(evidence);
          form.reset({
            ...form.getValues(),
            evidenceId: evidence.EvidenceId,
            name: evidence.evidenceName,
            code: evidence.evidenceCode,
            fileTypeId: evidence.FileTypeId || "",
            description: evidence.Description || "",
            issueDate: evidence.IssueDate
              ? format(new Date(evidence.IssueDate), "yyyy-MM-dd")
              : "",
            expiryDate: evidence.ExpiryDate
              ? format(new Date(evidence.ExpiryDate), "yyyy-MM-dd")
              : "",
            issuingAuthority: evidence.IssuingAuthority || "",
            status: "3",
          });

          const ev = evidence as ModelVerifiedEvidenceForReuse & {
            listAttachment?: Attachment[];
            folderUpload?: string;
          };
          // Handle potential casing issues (PascalCase from C# vs camelCase from JSON serialization)
          const rawAttachments = ev.ListAttachment || ev.listAttachment || [];
          const normalizedAttachments: Attachment[] = rawAttachments.map(
            (att: any) => ({
              Id: att.Id || att.id,
              ReferenceType: att.ReferenceType || att.referenceType,
              RelatedId: att.RelatedId || att.relatedId,
              FileName: att.FileName || att.fileName,
              FileExtension: att.FileExtension || att.fileExtension,
              FileSize: att.FileSize || att.fileSize,
              FileUrl: att.FileUrl || att.fileUrl,
              FullFileName: att.FullFileName || att.fullFileName,
            }),
          );

          const rawFolder = ev.FolderUpload || ev.folderUpload;

          setFolderUpload(rawFolder || uuidv4());
          setListAttachment(normalizedAttachments);
        }}
      />
    </>
  );
};

export default PopupEvidenceCycleMap;
