import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { Loader2 } from "lucide-react";
import { v4 as uuidv4 } from "uuid";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DatePicker } from "@/components/ui/datepicker";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import UploadFile, { type UploadFileRef } from "@/components/ui/upload-file";
import { taskExecutionService } from "@/features/business/api/taskExecution.api";
import { useActionTask } from "./hooks/useActionTask";
import type { Attachment } from "@/features/file/types/uploadfile.types";
import type {
  TaskExecutionTask,
  TaskExecutionUpsertTaskRequest,
} from "@/features/business/types/taskExecution.types";
import { ActionTaskStatus } from "@/features/business/types/actionPlan.types";

const EMPTY_GUID = "00000000-0000-0000-0000-000000000000";

const TASK_STATUS_OPTIONS = [
  { Value: String(ActionTaskStatus.InProgress), Text: "Đang thực hiện" },
  { Value: String(ActionTaskStatus.Done), Text: "Hoàn thành" },
  { Value: String(ActionTaskStatus.HasError), Text: "Có lỗi/cần kiểm tra lại" },
];

interface TaskDraft {
  Id: string;
  Description: string;
  Note: string;
  TaskStatus: string;
  DueDate: Date | undefined;
  FolderUpload: string;
}

export interface DialogTaskFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: TaskExecutionTask | null;
  planId: string;
  isOwner: boolean;
  onSaved: () => void;
  onSave?: (request: TaskExecutionUpsertTaskRequest) => Promise<TaskExecutionTask>;
}

function parseDateToLocal(value?: string | null): Date | undefined {
  if (!value) {
    return undefined;
  }

  const dateStr = value.split("T")[0];
  const [year, month, day] = dateStr.split("-").map(Number);
  if (!year || !month || !day) {
    return undefined;
  }

  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function buildDraft(task: TaskExecutionTask | null): TaskDraft {
  if (!task) {
    return {
      Id: EMPTY_GUID,
      Description: "",
      Note: "",
      TaskStatus: String(ActionTaskStatus.InProgress),
      DueDate: undefined,
      FolderUpload: uuidv4(),
    };
  }

  return {
    Id: task.Id,
    Description: task.Description ?? "",
    Note: task.Note ?? "",
    TaskStatus: String(
      task.TaskStatus === ActionTaskStatus.Todo
        ? ActionTaskStatus.InProgress
        : task.TaskStatus ?? ActionTaskStatus.InProgress,
    ),
    DueDate: parseDateToLocal(task.DueDate),
    FolderUpload: task.Id,
  };
}

function mapToAttachment(a: TaskExecutionTask["Attachments"][number]): Attachment {
  const ext = a.FileExtension ?? "";
  const fullFileName = ext
    ? ext.startsWith(".")
      ? `${a.FileName}${ext}`
      : `${a.FileName}.${ext}`
    : a.FileName;

  return {
    Id: a.Id,
    ReferenceType: 0,
    RelatedId: a.ActionTaskId,
    FileName: a.FileName,
    FileExtension: ext,
    FileSize: a.FileSize ?? 0,
    FileUrl: a.FileUrl ?? "",
    FullFileName: fullFileName,
  };
}

export default function DialogTaskForm({
  open,
  onOpenChange,
  task,
  planId,
  isOwner,
  onSaved,
  onSave,
}: DialogTaskFormProps) {
  const uploadRef = useRef<UploadFileRef>(null);
  const { saveTask, isMutating } = useActionTask();
  const [draft, setDraft] = useState<TaskDraft>(() => buildDraft(task));
  const [listAttachment, setListAttachment] = useState<Attachment[]>(
    () => (task?.Attachments ?? []).map(mapToAttachment),
  );
  const [isSaving, setIsSaving] = useState(false);
  const isExistingTask = Boolean(task?.Id && task.Id !== EMPTY_GUID);

  const taskDetailQuery = useQuery({
    queryKey: ["task-detail", task?.Id],
    queryFn: async (): Promise<TaskExecutionTask> => {
      const response = await taskExecutionService.getTaskDetail(task!.Id);
      if (!response.Success || !response.Data) {
        throw new Error(response.Message || "Không thể tải thông tin công việc.");
      }

      return response.Data;
    },
    enabled: open && isExistingTask,
  });

  const taskDetail = taskDetailQuery.data ?? null;

  useEffect(() => {
    if (!open) {
      return;
    }

    const source = taskDetail ?? task;
    setDraft(buildDraft(source));
    setListAttachment((source?.Attachments ?? []).map(mapToAttachment));
  }, [open, task, taskDetail]);
  const isBusy = isMutating || isSaving;
  const isDetailLoading = open && isExistingTask && taskDetailQuery.isLoading;
  const title = !isOwner
    ? "Xem công việc"
    : task && task.Id !== EMPTY_GUID
      ? "Chỉnh sửa công việc"
      : "Thêm công việc mới";

  const handleSave = async () => {
    if (!planId || !draft.Description.trim() || isBusy) {
      return;
    }

    const originalAttachmentIds = new Set(
      (taskDetail?.Attachments ?? task?.Attachments ?? []).map((attachment) => attachment.Id),
    );
    const currentAttachmentIds = new Set(listAttachment.map((attachment) => attachment.Id));
    const deletedAttachmentIds = [...originalAttachmentIds].filter(
      (id) => !currentAttachmentIds.has(id),
    );

    const pendingFiles = uploadRef.current?.getPendingFiles() ?? [];
    const hasPendingFiles = pendingFiles.length > 0;

    const request: TaskExecutionUpsertTaskRequest = {
      Id: draft.Id,
      ActionPlanId: planId,
      Description: draft.Description.trim(),
      Note: draft.Note.trim() || null,
      TaskStatus: Number(draft.TaskStatus),
      DueDate: draft.DueDate ? format(draft.DueDate, "yyyy-MM-dd") : null,
      FolderUpload: hasPendingFiles ? draft.FolderUpload : null,
      DeletedAttachmentIds: deletedAttachmentIds,
    };

    setIsSaving(true);
    try {
      if (hasPendingFiles) {
        const uploaded = await uploadRef.current?.upload();
        if (uploaded === false) {
          return;
        }
      }

      if (onSave) {
        await onSave(request);
      } else {
        await saveTask(request);
      }

      onSaved();
      onOpenChange(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[94vh] w-[96vw] max-w-[96vw] overflow-hidden p-0 sm:max-w-[960px]"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>

        <div className="flex max-h-[94vh] min-h-0 flex-col overflow-hidden bg-white">
          <div className="flex shrink-0 items-start justify-between gap-3 border-b px-5 py-4">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold text-slate-900">{title}</h2>
              <p className="text-sm text-slate-500">
                {isOwner
                  ? "Chỉnh sửa nội dung công việc và đính kèm tệp nếu cần."
                  : "Bạn chỉ có thể xem thông tin công việc này."}
              </p>
            </div>
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => onOpenChange(false)}>
              <span className="sr-only">Đóng</span>
              ×
            </Button>
          </div>

          {isDetailLoading ? (
            <div className="flex flex-1 items-center justify-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Đang tải thông tin công việc...
            </div>
          ) : (
            <>
              <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            <div className="grid gap-4">
              {!isOwner ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  Công việc này không thuộc quyền sở hữu của bạn nên đang ở chế độ chỉ xem.
                </div>
              ) : null}

              <div className="grid gap-2">
                <Label>Mô tả công việc</Label>
                <Textarea
                  value={draft.Description}
                  onChange={(e) => setDraft((prev) => ({ ...prev, Description: e.target.value }))}
                  placeholder="Nhập mô tả công việc..."
                  rows={3}
                  readOnly={!isOwner || isBusy}
                />
              </div>

              <div className="grid gap-2">
                <Label>Ghi chú</Label>
                <Textarea
                  value={draft.Note}
                  onChange={(e) => setDraft((prev) => ({ ...prev, Note: e.target.value }))}
                  placeholder="Ghi chú thêm..."
                  rows={2}
                  readOnly={!isOwner || isBusy}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label>Trạng thái</Label>
                  <Combobox
                    options={TASK_STATUS_OPTIONS}
                    value={draft.TaskStatus}
                    onValueChange={(value) =>
                      setDraft((prev) => ({
                        ...prev,
                        TaskStatus: value || prev.TaskStatus,
                      }))
                    }
                    placeholder="Chọn trạng thái"
                    emptyText="Không có trạng thái."
                    readonly={!isOwner || isBusy}
                  />
                </div>

                <div className="grid gap-2">
                  <Label>Thời gian hoàn thành</Label>
                  <DatePicker
                    className="w-full"
                    optionLabel="Chọn thời hạn"
                    value={draft.DueDate}
                    onChange={(date) => setDraft((prev) => ({ ...prev, DueDate: date }))}
                    disabled={!isOwner || isBusy}
                  />
                </div>
              </div>

              <div className="grid gap-2">
                <Label>Tệp đính kèm</Label>
                <UploadFile
                  key={draft.FolderUpload}
                  ref={uploadRef}
                  folderUpload={draft.FolderUpload}
                  listAttachment={listAttachment}
                  setListAttachment={isOwner ? setListAttachment : undefined}
                  fileSizeLimit={100}
                  readonly={!isOwner || isBusy}
                  allowDownload
                  viewerMode="internal"
                  previewContext="taskAttachment"
                />
              </div>
            </div>
          </div>

          <div className="flex shrink-0 justify-end gap-2 border-t bg-white px-5 py-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {isOwner ? "Hủy" : "Đóng"}
            </Button>
            {isOwner ? (
              <Button
                type="button"
                onClick={() => void handleSave()}
                disabled={isBusy || !draft.Description.trim()}
              >
                {isBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Lưu
              </Button>
            ) : null}
          </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
