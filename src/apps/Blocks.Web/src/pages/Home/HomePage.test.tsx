import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import HomePage from "./HomePage.tsx";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import type { User } from "@/features/system/types/user.types";
import type { AuthContextType } from "@/features/system/types/auth.types";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

const createMockUser = (overrides?: Partial<User>): User => ({
  Id: "u1",
  Username: "testuser",
  Fullname: "Test User",
  Email: "test@example.com",
  RoleId: "r1",
  RoleName: "User",
  IsActived: true,
  IsEdit: false,
  ...overrides,
});

const createMockAuth = (
  user: User | null = null,
  permissions: AuthContextType["permissions"] = [],
): AuthContextType => ({
  user,
  systemGroup: [],
  menu: [],
  permissions,
  roleName: user?.RoleName ?? null,
  isAuthenticated: !!user,
  loading: false,
  login: vi.fn(),
  logout: vi.fn(),
  getPermission: vi.fn(),
  refreshProfile: vi.fn(),
});

describe("HomePage", () => {
  beforeEach(() => {
    vi.spyOn(api, "get").mockResolvedValue({ Success: true, StatusCode: 200 } as never);
    vi.spyOn(api, "post").mockResolvedValue({ Success: true, StatusCode: 200 } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders_authenticated_welcome", () => {
    const mockUser = createMockUser();
    vi.mocked(useAuth).mockReturnValue(createMockAuth(mockUser));

    render(<HomePage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Xin chào, Test User");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  it.each([
    { label: "null user", user: null },
    {
      label: "empty fullname",
      user: createMockUser({ Id: "u2", Username: "user2", Fullname: "" }),
    },
    {
      label: "whitespace fullname",
      user: createMockUser({ Id: "u3", Username: "user3", Fullname: "   " }),
    },
  ])("handles_missing_or_blank_fullname ($label)", ({ user }) => {
    vi.mocked(useAuth).mockReturnValue(createMockAuth(user));

    render(<HomePage />);

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading.textContent).toBe("Xin chào");
    expect(heading.textContent).not.toContain("undefined");
    expect(heading.textContent).not.toContain("null");
    expect(heading.textContent).not.toContain(",");
  });

  it("does_not_fetch_or_link_to_privileged_features", () => {
    const mockUser = createMockUser({
      Id: "u4",
      Username: "restricted",
      Fullname: "Restricted User",
      Email: "restricted@example.com",
      RoleId: "r2",
      RoleName: "Guest",
    });
    vi.mocked(useAuth).mockReturnValue(createMockAuth(mockUser, []));

    render(<HomePage />);

    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Xin chào, Restricted User");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });
});
