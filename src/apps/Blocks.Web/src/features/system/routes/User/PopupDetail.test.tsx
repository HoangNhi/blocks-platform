import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import PopupDetail from "./PopupDetail";
import type { User } from "@/features/system/types/user.types";

vi.mock("@/components/ui/upload-avatar", () => ({
  default: React.forwardRef((_props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      upload: vi.fn().mockResolvedValue({ kind: "staged", folderUpload: "mock-folder-guid" }),
      reset: vi.fn(),
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
  it("save_sends_avatar_action", async () => {
    const saveChange = vi.fn().mockResolvedValue(true);
    const onOpenChange = vi.fn();

    const user: User = {
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

    render(
      <PopupDetail
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
          AvatarAction: "replace",
          FolderUpload: "mock-folder-guid",
        }),
        false
      );
    });
  });
});
