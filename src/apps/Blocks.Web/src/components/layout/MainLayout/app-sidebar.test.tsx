import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./app-sidebar";
import { useAuth } from "@/hooks/useAuth";
import type { Menu } from "@/features/system/types/menu.types";
import type { SystemGroup } from "@/features/system/types/systemGroup.types";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => false,
}));

function renderSidebar(_menu: Menu[], _systemGroup: SystemGroup[], pathname = "/") {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <SidebarProvider defaultOpen>
        <AppSidebar />
      </SidebarProvider>
    </MemoryRouter>
  );
}

describe("AppSidebar menu filtering and empty groups", () => {
  it("cached_retired_controllers_are_hidden_case_insensitively", () => {
    const originalPermissions = Object.freeze([
      { PermissionId: "p1", Name: "VIEW_FACULTY" },
      { PermissionId: "p2", Name: "VIEW_FILETYPE" },
    ]);

    const systemGroup: SystemGroup[] = [
      { Id: "g-catalog", Name: "Danh mục", Sort: 1, IsEdit: false, IsActived: true },
      { Id: "g-old-only", Name: "Nhóm chỉ có danh mục cũ", Sort: 2, IsEdit: false, IsActived: true },
      { Id: "g-system", Name: "Hệ thống", Sort: 3, IsEdit: false, IsActived: true },
      { Id: "sub-old", Name: "Nhóm con cũ", Sort: 1, ParentId: "g-catalog", IsEdit: false, IsActived: true },
    ];

    const menu: Menu[] = [
      {
        Id: "m1",
        Name: "Phòng ban",
        Controller: "faculty",
        SystemGroupId: "g-catalog",
        Sort: 1,
        CanView: true,
        CanAdd: true,
        CanUpdate: true,
        CanDelete: true,
        CanApprove: false,
        CanAnalyze: false,
        IsShowMenu: true,
        IsEdit: false,
        IsActived: true,
      },
      {
        Id: "m2",
        Name: "Loại tài liệu",
        Controller: "FileType",
        SystemGroupId: "g-catalog",
        Sort: 2,
        CanView: true,
        CanAdd: true,
        CanUpdate: true,
        CanDelete: true,
        CanApprove: false,
        CanAnalyze: false,
        IsShowMenu: true,
        IsEdit: false,
        IsActived: true,
      },
      {
        Id: "m3",
        Name: "Bộ tiêu chuẩn",
        Controller: "STANDARDSET",
        SystemGroupId: "sub-old",
        Sort: 1,
        CanView: true,
        CanAdd: true,
        CanUpdate: true,
        CanDelete: true,
        CanApprove: false,
        CanAnalyze: false,
        IsShowMenu: true,
        IsEdit: false,
        IsActived: true,
      },
      {
        Id: "m4",
        Name: "Đối tượng",
        Controller: "stakeholder",
        SystemGroupId: "g-old-only",
        Sort: 1,
        CanView: true,
        CanAdd: true,
        CanUpdate: true,
        CanDelete: true,
        CanApprove: false,
        CanAnalyze: false,
        IsShowMenu: true,
        IsEdit: false,
        IsActived: true,
      },
      {
        Id: "m5",
        Name: "Tiêu chuẩn",
        Controller: "Standard",
        SystemGroupId: "g-old-only",
        Sort: 2,
        CanView: true,
        CanAdd: true,
        CanUpdate: true,
        CanDelete: true,
        CanApprove: false,
        CanAnalyze: false,
        IsShowMenu: true,
        IsEdit: false,
        IsActived: true,
      },
      {
        Id: "m6",
        Name: "Người dùng",
        Controller: "user",
        SystemGroupId: "g-system",
        Sort: 1,
        CanView: true,
        CanAdd: true,
        CanUpdate: true,
        CanDelete: true,
        CanApprove: false,
        CanAnalyze: false,
        IsShowMenu: true,
        IsEdit: false,
        IsActived: true,
      },
    ];

    const authState = {
      menu,
      systemGroup,
      permissions: originalPermissions,
      user: null,
    };
    vi.mocked(useAuth).mockReturnValue(authState as any);

    renderSidebar(menu, systemGroup, "/faculty");

    // Open "Danh mục" collapsible
    const catalogTrigger = screen.getByRole("button", { name: /Danh mục/ });
    fireEvent.click(catalogTrigger);

    // 1. Retired controllers hidden
    expect(screen.queryByRole("link", { name: "Loại tài liệu" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Bộ tiêu chuẩn" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Đối tượng" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Tiêu chuẩn" })).not.toBeInTheDocument();

    // 2. Active faculty link retained
    const facultyLink = screen.getByRole("link", { name: "Phòng ban" });
    expect(facultyLink).toHaveAttribute("href", "/faculty");
    expect(facultyLink).toHaveAttribute("data-active", "true");

    // Open "Hệ thống" collapsible
    const systemTrigger = screen.getByRole("button", { name: /Hệ thống/ });
    fireEvent.click(systemTrigger);

    // 3. User link retained
    const userLink = screen.getByRole("link", { name: "Người dùng" });
    expect(userLink).toHaveAttribute("href", "/user");

    // 4. Empty root group containing only retired items disappears
    expect(screen.queryByText("Nhóm chỉ có danh mục cũ")).not.toBeInTheDocument();
    expect(screen.queryByText("Nhóm con cũ")).not.toBeInTheDocument();

    // 5. Context / permissions not mutated
    expect(authState.permissions).toEqual(originalPermissions);
  });

  it("empty_roots_and_subgroups_disappear_but_mixed_groups_remain", () => {
    const systemGroup: SystemGroup[] = [
      { Id: "g-root-only-retired-subgroup", Name: "Gốc có nhóm con bị lọc", Sort: 1, IsEdit: false, IsActived: true },
      { Id: "sub-retired", Name: "Nhóm con bị lọc", Sort: 1, ParentId: "g-root-only-retired-subgroup", IsEdit: false, IsActived: true },
      { Id: "g-empty", Name: "Gốc hoàn toàn rỗng", Sort: 2, IsEdit: false, IsActived: true },
      { Id: "g-mixed", Name: "Nhóm hỗn hợp", Sort: 3, IsEdit: false, IsActived: true },
    ];

    const menu: Menu[] = [
      {
        Id: "m1",
        Name: "Bộ tiêu chuẩn",
        Controller: "StandardSet",
        SystemGroupId: "sub-retired",
        Sort: 1,
        CanView: true,
        CanAdd: false,
        CanUpdate: false,
        CanDelete: false,
        CanApprove: false,
        CanAnalyze: false,
        IsShowMenu: true,
        IsEdit: false,
        IsActived: true,
      },
      {
        Id: "m2",
        Name: "Phòng ban",
        Controller: "faculty",
        SystemGroupId: "g-mixed",
        Sort: 1,
        CanView: true,
        CanAdd: true,
        CanUpdate: true,
        CanDelete: true,
        CanApprove: false,
        CanAnalyze: false,
        IsShowMenu: true,
        IsEdit: false,
        IsActived: true,
      },
      {
        Id: "m3",
        Name: "Menu ẩn không retire",
        Controller: "hidden-feature",
        SystemGroupId: "g-mixed",
        Sort: 2,
        CanView: true,
        CanAdd: false,
        CanUpdate: false,
        CanDelete: false,
        CanApprove: false,
        CanAnalyze: false,
        IsShowMenu: false, // IsShowMenu is false, but not retired
        IsEdit: false,
        IsActived: true,
      },
    ];

    vi.mocked(useAuth).mockReturnValue({
      menu,
      systemGroup,
      permissions: [],
      user: null,
    } as any);

    renderSidebar(menu, systemGroup, "/");

    // Root only containing retired subgroup must disappear
    expect(screen.queryByText("Gốc có nhóm con bị lọc")).not.toBeInTheDocument();
    expect(screen.queryByText("Nhóm con bị lọc")).not.toBeInTheDocument();
    expect(screen.queryByText("Gốc hoàn toàn rỗng")).not.toBeInTheDocument();

    // Mixed group remains
    expect(screen.getByText("Nhóm hỗn hợp")).toBeInTheDocument();

    // Open mixed group
    fireEvent.click(screen.getByRole("button", { name: /Nhóm hỗn hợp/ }));
    expect(screen.getByRole("link", { name: "Phòng ban" })).toBeInTheDocument();
    // Non-retired menu with IsShowMenu=false keeps existing behavior (rendered)
    expect(screen.getByRole("link", { name: "Menu ẩn không retire" })).toBeInTheDocument();
  });

  it("remaining_link_keeps_active_state_and_empty_arrays_do_not_crash", () => {
    vi.mocked(useAuth).mockReturnValue({
      menu: [],
      systemGroup: [],
      permissions: [],
      user: null,
    } as any);

    expect(() => renderSidebar([], [], "/")).not.toThrow();
    expect(screen.getByText("TỔNG QUAN")).toBeInTheDocument();
  });
});
