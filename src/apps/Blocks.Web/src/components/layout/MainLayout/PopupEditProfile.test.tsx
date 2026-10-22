import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import PopupEditProfile from "./PopupEditProfile";
import type { User } from "@/features/system/types/user.types";

vi.mock("@/components/ui/upload-avatar", () => ({
  default: React.forwardRef((_props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      upload: vi.fn().mockResolvedValue({ kind: "remove" }),
      reset: vi.fn(),
    }));
    return <div data-testid="upload-avatar-mock" />;
  }),
}));

describe("PopupEditProfile", () => {
  it("save_sends_avatar_action_remove", async () => {
    const saveChange = vi.fn().mockResolvedValue(true);
    const onOpenChange = vi.fn();

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
});
