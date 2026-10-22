import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { NavUser } from "./NavUser";
import { useAuth } from "@/hooks/useAuth";
import { userService } from "@/features/system/api/user.api";
import { toast } from "sonner";
import { SidebarProvider } from "@/components/ui/sidebar";
import type { User } from "@/features/system/types/user.types";

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/features/system/api/user.api", () => ({
  userService: {
    editProfile: vi.fn(),
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

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

describe("NavUser", () => {
  const mockRefreshProfile = vi.fn();
  const mockLogout = vi.fn();

  const mockUser: User = {
    Id: "user-1",
    Username: "testuser",
    Fullname: "Nguyễn Văn A",
    Email: "vana@example.com",
    RoleId: "role-admin",
    IsActived: true,
    IsEdit: false,
    Avatar: "System/Avatar/existing.png",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({
      user: mockUser,
      refreshProfile: mockRefreshProfile,
      logout: mockLogout,
      roleName: "Quản trị viên",
      isAuthenticated: true,
      loading: false,
      systemGroup: null,
      menu: null,
      permissions: null,
      isExternalReviewer: false,
      login: vi.fn(),
      getPermission: vi.fn(),
    });
  });

  const renderNavUser = () => {
    return render(
      <SidebarProvider>
        <NavUser user={mockUser} />
      </SidebarProvider>
    );
  };

  it("forwards_avatar_action_replace_and_closes_on_save_success", async () => {
    mockUpload.mockResolvedValue({
      kind: "staged",
      folderUpload: "staged-folder-uuid",
    });
    vi.mocked(userService.editProfile).mockResolvedValue({
      Success: true,
      StatusCode: 200,
      Data: undefined,
    });

    renderNavUser();

    // Open dropdown menu
    const userButton = screen.getByRole("button", { name: /Nguyễn Văn A/i });
    fireEvent.pointerDown(userButton);
    fireEvent.click(userButton);

    // Click "Đổi hồ sơ cá nhân"
    const editProfileItem = screen.getByText("Đổi hồ sơ cá nhân");
    fireEvent.click(editProfileItem);

    // Verify modal is open
    expect(screen.getByRole("heading", { name: "Cập nhật Tài khoản" })).toBeInTheDocument();

    // Submit form (Lưu)
    const saveButton = screen.getByRole("button", { name: "Lưu" });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(userService.editProfile).toHaveBeenCalledWith({
        Fullname: "Nguyễn Văn A",
        Email: "vana@example.com",
        Avatar: "System/Avatar/existing.png",
        AvatarAction: "replace",
        FolderUpload: "staged-folder-uuid",
      });
    });

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalledWith("Cập nhật hồ sơ thành công");
      expect(mockRefreshProfile).toHaveBeenCalledTimes(1);
    });

    // Modal closes
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Cập nhật Tài khoản" })).not.toBeInTheDocument();
    });
  });

  it("preserves_staged_selection_and_stays_open_on_save_failure", async () => {
    mockUpload.mockResolvedValue({
      kind: "staged",
      folderUpload: "staged-folder-uuid",
    });
    vi.mocked(userService.editProfile).mockResolvedValue({
      Success: false,
      StatusCode: 400,
      Message: "Cập nhật hồ sơ thất bại",
    });

    renderNavUser();

    // Open dropdown menu & popup
    const btn = screen.getByRole("button", { name: /Nguyễn Văn A/i });
    fireEvent.pointerDown(btn);
    fireEvent.click(btn);
    fireEvent.click(screen.getByText("Đổi hồ sơ cá nhân"));

    const saveButton = screen.getByRole("button", { name: "Lưu" });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(userService.editProfile).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("Cập nhật hồ sơ thất bại");
      expect(mockRefreshProfile).not.toHaveBeenCalled();
    });

    // Modal remains open on failure
    expect(screen.getByRole("heading", { name: "Cập nhật Tài khoản" })).toBeInTheDocument();
    // Staged selection was not reset
    expect(mockReset).not.toHaveBeenCalled();
  });
});