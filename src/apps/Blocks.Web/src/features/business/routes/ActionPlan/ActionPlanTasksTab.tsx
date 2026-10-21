import { useCallback, useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Loader2, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { TaskExecutionTask } from "@/features/business/types/taskExecution.types";
import { getTaskStatusLabel } from "@/features/business/routes/TaskExecution/taskExecution.utils";
import DialogTaskForm from "@/features/business/routes/TaskExecution/DialogTaskForm";
import { useActionPlanTasks } from "./hooks/useActionPlanTasks";

interface ActionPlanTasksTabProps {
  planId: string;
  isCouncilEdit: boolean;
  open: boolean;
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

export default function ActionPlanTasksTab({
  planId,
  isCouncilEdit,
  open,
}: ActionPlanTasksTabProps) {
  const [taskDialogOpen, setTaskDialogOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskExecutionTask | null>(
    null,
  );

  const {
    tasks,
    totalRow,
    doneCount,
    isLoading,
    isFetching,
    pageRequest,
    setPageRequest,
    updateTask,
    isMutating,
    refetch,
  } = useActionPlanTasks(planId, open);

  const progressPercent =
    totalRow > 0 ? Math.round((doneCount / totalRow) * 100) : 0;

  const handleOpenTask = useCallback((task: TaskExecutionTask) => {
    setSelectedTask(task);
    setTaskDialogOpen(true);
  }, []);

  const handleTaskSaved = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const taskColumns = useMemo<ColumnDef<TaskExecutionTask>[]>(
    () => [
      {
        id: "index",
        header: "STT",
        cell: ({ row }) => <span className="text-slate-500">{row.index + 1}</span>,
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
              className={cn(
                "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                getTaskStatusBadgeClass(status),
              )}
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
        cell: ({ row }) => (
          <div className="flex justify-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" disabled={isMutating}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handleOpenTask(row.original)}>
                  {isCouncilEdit ? "Cập nhật" : "Xem"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ),
      },
    ],
    [handleOpenTask, isCouncilEdit, isMutating],
  );

  return (
    <>
      <div className="space-y-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <span>
              {doneCount}/{totalRow} việc hoàn thành
            </span>
            <span className="font-medium">{progressPercent}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-200">
            <div
              className="h-2 rounded-full bg-blue-500 transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {!isCouncilEdit && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Bạn chỉ có quyền xem nội dung công việc.
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Đang tải danh sách công việc...
          </div>
        ) : (
          <DataTable
            columns={taskColumns}
            data={tasks}
            totalRow={totalRow}
            pageRequest={pageRequest}
            setPageRequest={setPageRequest}
            onRefresh={() => void refetch()}
            containerClassName="w-full relative"
            isLoading={isFetching}
          />
        )}
      </div>

      <DialogTaskForm
        open={taskDialogOpen}
        onOpenChange={setTaskDialogOpen}
        task={selectedTask}
        planId={planId}
        isOwner={isCouncilEdit}
        onSave={isCouncilEdit ? updateTask : undefined}
        onSaved={() => void handleTaskSaved()}
      />
    </>
  );
}
