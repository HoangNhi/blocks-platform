import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Loader2, MoreHorizontal, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { DataTable } from "@/components/ui/data-table";
import { DatePicker } from "@/components/ui/datepicker";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import UploadFile from "@/components/ui/upload-file";
import type { Attachment } from "@/features/file/types/uploadfile.types";
import { useAuth } from "@/hooks/useAuth";
import { useCycleOptions } from "@/features/business/hooks/useCycleOptions";
import { useStandardsByCycle } from "@/features/business/hooks/useStandardsByCycle";
import { useCriteriaByStandard } from "@/features/business/hooks/useCriteriaByStandard";
import { taskExecutionService } from "@/features/business/api/taskExecution.api";
import { useActionTask } from "./hooks/useActionTask";
import DialogTaskForm from "./DialogTaskForm";
import type {
  TaskExecutionGetTaskListRequest,
  TaskExecutionPlanDetail,
  TaskExecutionPlanListItem,
  TaskExecutionTask,
} from "@/features/business/types/taskExecution.types";
import { ActionPlanStatus } from "@/features/business/types/actionPlan.types";
import { getTaskStatusLabel } from "./taskExecution.utils";
import { getActionPlanStatusLabel } from "../ActionPlan/actionPlan.utils";
import { getActionPlanStatusComboboxOptions } from "../ActionPlan/popupActionPlan.helpers";

interface PopupTaskExecutionProps {
  open: boolean;
  item: TaskExecutionPlanListItem;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}

function parseDateInput(value?: string | null): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

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

function getTaskStatusBadgeClass(status: number): string {
  switch (status) {
    case 2:
      return "bg-blue-100 text-blue-700";
    case 3:
      return "bg-emerald-100 text-emerald-700";
    case 4:
      return "bg-red-100 text-red-700";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

export default function PopupTaskExecution({
  open,
  item,
  onOpenChange,
  onChanged,
}: PopupTaskExecutionProps) {
  const { user } = useAuth();
  const currentUsername = user?.Username ?? "";

  const [activeTab, setActiveTab] = useState("general");
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskExecutionTask | null>(
    null,
  );
  const [taskPageRequest, setTaskPageRequest] =
    useState<TaskExecutionGetTaskListRequest>({
      ActionPlanId: item.Id,
      PageIndex: 1,
      PageSize: 10,
    });

  const { deleteTask, isMutating } = useActionTask();

  useEffect(() => {
    if (open) {
      setActiveTab("general");
      setTaskDialogOpen(false);
      setSelectedTask(null);
      setTaskPageRequest({
        ActionPlanId: item.Id,
        PageIndex: 1,
        PageSize: 10,
      });
      return;
    }

    setActiveTab("general");
    setTaskDialogOpen(false);
    setSelectedTask(null);
  }, [open, item.Id]);

  const planDetailQuery = useQuery({
    queryKey: ["task-execution", "plan-detail", item.Id],
    queryFn: async (): Promise<TaskExecutionPlanDetail> => {
      const response = await taskExecutionService.getPlanDetail(item.Id);
      if (!response.Success || !response.Data) {
        throw new Error(response.Message || "Không thể tải chi tiết kế hoạch.");
      }
      return response.Data;
    },
    enabled: open && Boolean(item.Id),
  });

  const taskListQuery = useQuery({
    queryKey: [
      "task-execution",
      "task-list",
      planDetailQuery.data?.Id ?? item.Id,
      taskPageRequest,
    ],
    queryFn: async () => {
      const response = await taskExecutionService.getTaskList({
        ...taskPageRequest,
        ActionPlanId: planDetailQuery.data?.Id ?? item.Id,
      });
      if (!response.Success || !response.Data) {
        throw new Error(
          response.Message || "Không thể tải danh sách công việc.",
        );
      }
      return response.Data;
    },
    enabled: open && Boolean(planDetailQuery.data?.Id ?? item.Id),
  });

  const planDetail = planDetailQuery.data ?? null;
  const planId = planDetail?.Id ?? item.Id;
  const cycleId = planDetail?.CycleId ?? item.CycleId;
  const standardId = planDetail?.StandardId ?? item.StandardId ?? "";
  const criterionId = planDetail?.CriterionId ?? item.CriterionId ?? "";
  const currentStatus = Number(
    planDetail?.Status ?? item.Status ?? ActionPlanStatus.Draft,
  );
  const currentPriority = Number(planDetail?.Priority ?? item.Priority ?? 2);
  const tasks = taskListQuery.data?.Data ?? [];
  const taskTotalRow = taskListQuery.data?.TotalRow ?? 0;
  const doneTasks = taskListQuery.data?.DoneCount ?? 0;
  const totalTasks = taskTotalRow;
  const progressPercent =
    totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const canEdit = currentStatus === ActionPlanStatus.InProgress;
  const statusOptions = useMemo(() => getActionPlanStatusComboboxOptions(), []);
  const cycleOptions = useCycleOptions(open);
  const standards = useStandardsByCycle(cycleId || undefined);
  const criteria = useCriteriaByStandard(standardId || undefined);
  const normalizedCurrentUsername = useMemo(
    () => currentUsername.trim().toLowerCase(),
    [currentUsername],
  );

  const isTaskOwner = useCallback(
    (task: TaskExecutionTask) =>
      task.CreatedBy.trim().toLowerCase() === normalizedCurrentUsername,
    [normalizedCurrentUsername],
  );

  const refreshPlan = useCallback(async () => {
    onChanged();
  }, [onChanged]);

  const handleOpenNewTask = useCallback(() => {
    setSelectedTask(null);
    setTaskDialogOpen(true);
  }, []);

  const handleOpenEditTask = useCallback((task: TaskExecutionTask) => {
    setSelectedTask(task);
    setTaskDialogOpen(true);
  }, []);

  const handleDeleteTask = useCallback(
    async (task: TaskExecutionTask) => {
      if (!canEdit || !isTaskOwner(task)) {
        return;
      }

      const confirmed = window.confirm(
        "Bạn có chắc chắn muốn xóa công việc này không?",
      );
      if (!confirmed) {
        return;
      }

      await deleteTask({ TaskId: task.Id });
      await refreshPlan();
    },
    [canEdit, deleteTask, isTaskOwner, refreshPlan],
  );

  const handleTaskSaved = useCallback(async () => {
    await refreshPlan();
  }, [refreshPlan]);

  const taskColumns = useMemo<ColumnDef<TaskExecutionTask>[]>(
    () => [
      {
        id: "index",
        header: "STT",
        cell: ({ row }) => (
          <span className="text-slate-500">{row.index + 1}</span>
        ),
      },
      {
        accessorKey: "Description",
        header: "Mô tả",
        cell: ({ row }) => (
          <div className="min-w-[220px]">
            <p className="font-medium text-slate-900">
              {row.original.Description}
            </p>
            {row.original.Note ? (
              <p className="line-clamp-1 text-xs text-slate-500">
                {row.original.Note}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "TaskStatus",
        header: "Trạng thái",
        cell: ({ row }) => {
          const status = Number(row.original.TaskStatus);
          return (
            <span
              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${getTaskStatusBadgeClass(status)}`}
            >
              {getTaskStatusLabel(status)}
            </span>
          );
        },
      },
      {
        accessorKey: "DueDate",
        header: "Thời gian hoàn thành",
        cell: ({ row }) =>
          row.original.DueDate ? (
            new Date(row.original.DueDate).toLocaleDateString("vi-VN")
          ) : (
            <span className="text-slate-400">—</span>
          ),
      },
      {
        accessorKey: "CreatedBy",
        header: "Người tạo",
        cell: ({ row }) => (
          <span className="text-sm text-slate-600">
            {row.original.CreatedByFullname ?? row.original.CreatedBy}
          </span>
        ),
      },
      {
        id: "actions",
        header: () => <div className="text-center">Thao tác</div>,
        meta: { className: "text-center" },
        cell: ({ row }) => {
          const task = row.original;
          const isOwner = isTaskOwner(task);

          return (
            <div className="flex justify-center">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon-sm" disabled={isMutating}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleOpenEditTask(task)}>
                    Cập nhật
                  </DropdownMenuItem>
                  {isOwner && canEdit ? (
                    <DropdownMenuItem
                      className="text-red-600 focus:text-red-600"
                      onClick={() => void handleDeleteTask(task)}
                    >
                      Xóa
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    [canEdit, handleDeleteTask, handleOpenEditTask, isMutating, isTaskOwner],
  );

  const isOwnerOfSelected = !selectedTask || isTaskOwner(selectedTask);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="max-h-[94vh] w-[96vw] max-w-[96vw] overflow-hidden p-0 sm:max-w-[1420px]"
          showCloseButton={false}
        >
          <DialogTitle className="sr-only">Task Execution</DialogTitle>

          <div className="flex max-h-[94vh] min-h-0 flex-col overflow-hidden bg-white">
            <div className="flex shrink-0 items-start justify-between gap-3 border-b px-5 py-4">
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-semibold text-slate-900">
                  {planDetail?.Title || item.Title}
                </h2>
                <p className="text-sm text-slate-500">
                  Trạng thái: {getActionPlanStatusLabel(currentStatus)}
                </p>
                <div className="mt-2 space-y-1">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>
                      {doneTasks}/{totalTasks} việc hoàn thành
                    </span>
                    <span className="font-medium">{progressPercent}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-slate-200">
                    <div
                      className="h-1.5 rounded-full bg-blue-500 transition-all"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
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
              onValueChange={setActiveTab}
              className="flex min-h-0 flex-1 flex-col overflow-hidden"
            >
              <div className="shrink-0 border-b px-5 pt-3">
                <TabsList className="grid w-full max-w-sm grid-cols-2">
                  <TabsTrigger value="general">Thông tin chung</TabsTrigger>
                  <TabsTrigger value="tasks">Công việc</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent
                value="general"
                className="mt-0 flex-1 overflow-y-auto px-5 py-5"
              >
                {planDetailQuery.isLoading ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Đang tải chi tiết kế hoạch...
                  </div>
                ) : planDetailQuery.isError ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    Không thể tải chi tiết kế hoạch. Vui lòng thử lại.
                  </div>
                ) : (
                  <div className="grid gap-5">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="grid gap-2 md:col-span-2">
                        <Label>Tên kế hoạch</Label>
                        <Input
                          value={planDetail?.Title ?? item.Title}
                          readOnly
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Chu kỳ</Label>
                        <Combobox
                          options={cycleOptions.options ?? []}
                          loading={cycleOptions.isLoading}
                          value={cycleId || undefined}
                          onValueChange={() => {}}
                          placeholder="Chọn chu kỳ"
                          searchPlaceholder="Tìm chu kỳ..."
                          emptyText="Không tìm thấy chu kỳ."
                          disabled
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Trạng thái</Label>
                        <Combobox
                          options={statusOptions}
                          value={String(currentStatus)}
                          onValueChange={() => {}}
                          placeholder="Chọn trạng thái"
                          emptyText="Không có trạng thái."
                          disabled
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="grid gap-2">
                        <Label>Tiêu chuẩn</Label>
                        <Combobox
                          options={standards.options ?? []}
                          loading={standards.isLoading}
                          value={standardId || undefined}
                          onValueChange={() => {}}
                          placeholder="Không có tiêu chuẩn"
                          searchPlaceholder="Tìm tiêu chuẩn..."
                          emptyText="Không có tiêu chuẩn."
                          disabled
                        />
                      </div>
                      <div className="grid gap-2">
                        <Label>Tiêu chí</Label>
                        <Combobox
                          options={criteria.options ?? []}
                          loading={criteria.isLoading}
                          value={criterionId || undefined}
                          onValueChange={() => {}}
                          placeholder="Không có tiêu chí"
                          searchPlaceholder="Tìm tiêu chí..."
                          emptyText="Không có tiêu chí."
                          disabled
                        />
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="grid gap-2">
                        <Label>Ưu tiên</Label>
                        <Select
                          value={String(currentPriority)}
                          onValueChange={() => {}}
                        >
                          <SelectTrigger className="w-full" disabled>
                            <SelectValue placeholder="Chọn ưu tiên" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">Cao</SelectItem>
                            <SelectItem value="2">Trung bình</SelectItem>
                            <SelectItem value="3">Thấp</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label>Hạn hoàn thành</Label>
                        <DatePicker
                          className="w-full"
                          optionLabel="Chọn thời hạn"
                          value={parseLocalDate(
                            parseDateInput(
                              planDetail?.Deadline ?? item.Deadline,
                            ),
                          )}
                          onChange={() => {}}
                          disabled
                        />
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <Label>Mô tả</Label>
                      <Textarea
                        value={planDetail?.Description ?? ""}
                        readOnly
                        rows={4}
                        placeholder="Không có mô tả."
                      />
                    </div>

                    {planDetail?.SourceFindingId ? (
                      <div className="grid gap-2">
                        <Label>Kiến nghị từ CHECK</Label>
                        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                          <p className="text-sm text-amber-800">
                            Kế hoạch này được tạo từ một kiến nghị bên ngoài.
                          </p>
                        </div>
                      </div>
                    ) : null}

                    <div className="grid gap-2">
                      <Label>Người thực hiện</Label>
                      <div className="flex flex-wrap gap-2">
                        {planDetail?.Assignees.length ? (
                          planDetail.Assignees.map((assignee) => (
                            <span
                              key={assignee.UserId}
                              className="inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700"
                            >
                              {assignee.Fullname ??
                                assignee.Username ??
                                assignee.UserId}
                            </span>
                          ))
                        ) : (
                          <p className="text-sm italic text-slate-400">
                            Chưa có người thực hiện
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-2">
                      <Label>Tài liệu đính kèm</Label>
                      <UploadFile
                        folderUpload={planId}
                        listAttachment={planDetail?.Attachments as Attachment[]}
                        setListAttachment={() => {}}
                        readonly
                        multiFile
                        previewContext="ActionPlan"
                      />
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent
                value="tasks"
                className="mt-0 flex-1 overflow-y-auto px-5 py-5"
              >
                {taskListQuery.isLoading ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Đang tải danh sách công việc...
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm text-slate-500">
                        {taskTotalRow} công việc
                      </p>
                      {canEdit ? (
                        <Button
                          type="button"
                          size="sm"
                          onClick={handleOpenNewTask}
                          disabled={isMutating}
                        >
                          <Plus className="mr-1 h-3 w-3" />
                          Thêm công việc
                        </Button>
                      ) : null}
                    </div>

                    {!canEdit ? (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                        Kế hoạch này chưa ở trạng thái đang thực hiện nên chưa
                        thể chỉnh sửa công việc.
                      </div>
                    ) : null}

                    <DataTable
                      columns={taskColumns}
                      data={tasks}
                      totalRow={taskTotalRow}
                      pageRequest={taskPageRequest}
                      setPageRequest={setTaskPageRequest}
                      onRefresh={() => void taskListQuery.refetch()}
                      containerClassName="w-full relative"
                      isLoading={taskListQuery.isFetching}
                    />
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </DialogContent>
      </Dialog>

      <DialogTaskForm
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
        task={selectedTask}
        planId={planId}
        isOwner={isOwnerOfSelected && canEdit}
        onSaved={() => void handleTaskSaved()}
      />
    </>
  );
}
