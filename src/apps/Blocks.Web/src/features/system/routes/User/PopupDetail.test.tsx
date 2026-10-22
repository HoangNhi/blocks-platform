import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import PopupDetail from "./PopupDetail";
import type { User } from "@/features/system/types/user.types";
import { toast } from "sonner";

const mockUpload = vi.fn();
const mockReset = vi.fn();

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

vi.mock("@/components/ui/upload-avatar", () => ({
  default: React.forwardRef((_props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      upload: mockUpload,
      reset: mockReset,
    }));
    return <div data-testid="upload-avatar-mock" />;
  }),
}));

vi.mock("@/features/system/api/role.api", () => ({
  roleService: {
    getAllCombobox: vi.fn().mockResolvedValue({
      Success: true,
      Data: [{ Text: "Admin", Value: "role-1" }],
    }),
  },
}));

describe("PopupDetail", () => {
  const baseUser: User = {
    Id: "user-1",
    Username: "testuser",
    Fullname: "Test User",
    Password: "initial-password",
    Email: "test@example.com",
    RoleId: "role-1",
    IsActived: true,
    IsEdit: true,
    FolderUpload: "old-folder",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpload.mockResolvedValue({ kind: "staged", folderUpload: "mock-folder-guid" });
  });

  it("save_sends_avatar_action", async () => {
    const saveChange = vi.fn().mockResolvedValue(true);
    const onOpenChange = vi.fn();

    render(
      <PopupDetail
        user={baseUser}
        isOpen={true}
        onOpenChange={onOpenChange}
        saveChange={saveChange}
      />
    );

    const submitBtn = screen.getByRole("button", { name: /^Lưu$/ });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(saveChange).toHaveBeenCalledWith(
        expect.objectContaining({
          AvatarAction: "replace",
          FolderUpload: "mock-folder-guid",
        }),
        false
      );
    });
  });

  it("double_submit_is_prevented_while_in_flight", async () => {
    let resolveSave: (res: boolean) => void;
    const savePromise = new Promise<boolean>((resolve) => {
      resolveSave = resolve;
    });
    const saveChange = vi.fn().mockReturnValue(savePromise);
    const onOpenChange = vi.fn();

    render(
      <PopupDetail
        user={baseUser}
        isOpen={true}
        onOpenChange={onOpenChange}
        saveChange={saveChange}
      />
    );

    const submitBtn = screen.getByRole("button", { name: /^Lưu$/ });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(saveChange).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(submitBtn);
    fireEvent.click(submitBtn);

    expect(saveChange).toHaveBeenCalledTimes(1);

    resolveSave!(true);
    await waitFor(() => {
      expect(submitBtn).not.toBeDisabled();
    });
  });

  it("save_failure_preserves_staged_selection", async () => {
    const saveChange = vi.fn().mockResolvedValue(false);
    const onOpenChange = vi.fn();

    render(
      <PopupDetail
        user={baseUser}
        isOpen={true}
        onOpenChange={onOpenChange}
        saveChange={saveChange}
      />
    );

    const submitBtn = screen.getByRole("button", { name: /^Lưu$/ });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(saveChange).toHaveBeenCalledTimes(1);
    });

    expect(mockReset).not.toHaveBeenCalled();
  });

  it("upload_failure_shows_toast_and_aborts_save", async () => {
    mockUpload.mockRejectedValue(new Error("Upload network error"));
    const saveChange = vi.fn().mockResolvedValue(true);
    const onOpenChange = vi.fn();

    render(
      <PopupDetail
        user={baseUser}
        isOpen={true}
        onOpenChange={onOpenChange}
        saveChange={saveChange}
      />
    );

    const submitBtn = screen.getByRole("button", { name: /^Lưu$/ });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Tải ảnh đại diện lên máy chủ thất bại");
    });

    expect(saveChange).not.toHaveBeenCalled();
    expect(mockReset).not.toHaveBeenCalled();
  });
});