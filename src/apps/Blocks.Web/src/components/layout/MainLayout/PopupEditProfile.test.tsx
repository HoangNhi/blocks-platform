import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import PopupEditProfile from "./PopupEditProfile";
import type { User } from "@/features/system/types/user.types";

const mockUpload = vi.fn();
const mockReset = vi.fn();

vi.mock("@/components/ui/upload-avatar", () => ({
  default: React.forwardRef((_props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      upload: mockUpload,
      reset: mockReset,
    }));
    return <div data-testid="upload-avatar-mock" />;
  }),
}));

describe("PopupEditProfile", () => {
  const user: User = {
    Id: "user-1",
    Username: "testuser",
    Fullname: "Test User",
    Email: "test@example.com",
    RoleId: "role-1",
    IsActived: true,
    IsEdit: true,
    FolderUpload: "folder-1",
    Avatar: "System/Avatar/existing.png",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockUpload.mockResolvedValue({ kind: "remove" });
  });

  it("save_sends_avatar_action_remove", async () => {
    const saveChange = vi.fn().mockResolvedValue(true);
    const onOpenChange = vi.fn();

    render(
      <PopupEditProfile
        user={user}
        isOpen={true}
        onOpenChange={onOpenChange}
        saveChange={saveChange}
      />
    );

    const submitBtn = screen.getByRole("button", { name: "Lưu" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(saveChange).toHaveBeenCalledWith(
        expect.objectContaining({
          AvatarAction: "remove",
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
      <PopupEditProfile
        user={user}
        isOpen={true}
        onOpenChange={onOpenChange}
        saveChange={saveChange}
      />
    );

    const submitBtn = screen.getByRole("button", { name: "Lưu" });
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
      <PopupEditProfile
        user={user}
        isOpen={true}
        onOpenChange={onOpenChange}
        saveChange={saveChange}
      />
    );

    const submitBtn = screen.getByRole("button", { name: "Lưu" });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(saveChange).toHaveBeenCalledTimes(1);
    });

    // Reset should not have been called on failure
    expect(mockReset).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});