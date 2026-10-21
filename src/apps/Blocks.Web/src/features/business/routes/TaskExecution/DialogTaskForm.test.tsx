import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import { forwardRef, useImperativeHandle } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActionTaskStatus } from "@/features/business/types/actionPlan.types";
import type { TaskExecutionTask } from "@/features/business/types/taskExecution.types";
import DialogTaskForm from "./DialogTaskForm";

const mocks = vi.hoisted(() => ({
  getTaskDetailMock: vi.fn(),
  uploadFileMock: vi.fn(),
}));

vi.mock("@/features/business/api/taskExecution.api", () => ({
  taskExecutionService: {
    getTaskDetail: mocks.getTaskDetailMock,
  },
}));

vi.mock("./hooks/useActionTask", () => ({
  useActionTask: () => ({
    saveTask: vi.fn(),
    isMutating: false,
  }),
}));

vi.mock("@/components/ui/upload-file", () => ({
  default: forwardRef((props: any, ref) => {
    mocks.uploadFileMock(props);
    useImperativeHandle(ref, () => ({
      upload: vi.fn().mockResolvedValue(true),
      getPendingFiles: vi.fn(() => []),
    }));
    return null;
  }),
}));

function createTask(): TaskExecutionTask {
  return {
    Id: "task-1",
    ActionPlanId: "plan-1",
    Description: "Mô tả công việc",
    Note: "Ghi chú",
    TaskStatus: ActionTaskStatus.InProgress,
    DueDate: "2026-04-20T00:00:00Z",
    CompletedAt: null,
    CreatedBy: "tester",
    CreatedByFullname: "Tester",
    Attachments: [
      {
        Id: "attachment-1",
        ActionTaskId: "task-1",
        AttachmentId: null,
        FileName: "tai-lieu.pdf",
        FileSize: 1234,
        FileUrl: "/files/tai-lieu.pdf",
        UploadedAt: "2026-04-19T00:00:00Z",
        UploadedBy: "tester",
      } as any,
    ],
  };
}

function renderWithQueryClient(task: TaskExecutionTask) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <DialogTaskForm
        open
        onOpenChange={vi.fn()}
        task={task}
        planId="plan-1"
        isOwner
        onSaved={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

describe("DialogTaskForm", () => {
  beforeEach(() => {
    mocks.getTaskDetailMock.mockReset();
    mocks.uploadFileMock.mockReset();
  });

  it("gọi API chi tiết khi mở công việc đã tồn tại", async () => {
    const task = createTask();
    mocks.getTaskDetailMock.mockResolvedValue({
      Success: true,
      Data: task,
      Message: "",
    });

    renderWithQueryClient(task);

    await waitFor(() => {
      expect(mocks.getTaskDetailMock).toHaveBeenCalledWith("task-1");
    });
  });

  it("giữ FileSize khi ánh xạ sang UploadFile", async () => {
    const task = createTask();
    mocks.getTaskDetailMock.mockResolvedValue({
      Success: true,
      Data: task,
      Message: "",
    });

    renderWithQueryClient(task);

    await waitFor(() => {
      expect(mocks.uploadFileMock).toHaveBeenCalled();
    });

    const props = mocks.uploadFileMock.mock.calls.at(-1)?.[0];
    expect(props?.listAttachment?.[0]?.FileSize).toBe(1234);
  });
});
