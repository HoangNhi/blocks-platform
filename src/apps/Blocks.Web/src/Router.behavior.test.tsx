// ponytail: temporary type import preserves TS inference for legacy InternalReviewPage until Task 4 purges features/business.
import type SarPage from "./features/business/routes/Sar/SarPage";
export type _UnusedSarPage = typeof SarPage;
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Outlet } from "react-router-dom";
import Router from "./Router";
import { api } from "@/lib/api";
import type { GetPermissionByUser } from "@/features/system/types/role.types";

vi.mock("react-router", async () => {
  return await vi.importActual("react-router-dom");
});

interface MockAuthState {
  user: null;
  isAuthenticated: boolean;
  loading: boolean;
  getPermission: ReturnType<typeof vi.fn>;
  permissions: never[];
  systemGroup: never[];
  menu: never[];
  roleName: null;
  isExternalReviewer: boolean;
  login: ReturnType<typeof vi.fn>;
  logout: ReturnType<typeof vi.fn>;
  refreshProfile: ReturnType<typeof vi.fn>;
}

const mockAuthState: MockAuthState = {
  user: null,
  isAuthenticated: false,
  loading: false,
  getPermission: vi.fn(),
  permissions: [],
  systemGroup: [],
  menu: [],
  roleName: null,
  isExternalReviewer: false,
  login: vi.fn(),
  logout: vi.fn(),
  refreshProfile: vi.fn(),
};

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => mockAuthState,
}));

function setAuthState(overrides: {
  isAuthenticated: boolean;
  loading?: boolean;
  permission?: Partial<GetPermissionByUser> | null;
}) {
  mockAuthState.isAuthenticated = overrides.isAuthenticated;
  mockAuthState.loading = overrides.loading ?? false;
  mockAuthState.getPermission = vi
    .fn()
    .mockImplementation(async () =>
      overrides.permission !== undefined ? (overrides.permission as GetPermissionByUser) : null,
    );
}

// Stub MainLayout preserving permission prop passed by guard
vi.mock("./components/layout/MainLayout/MainLayout", () => ({
  default: ({ permission }: { permission?: GetPermissionByUser | null }) => (
    <div data-testid="main-layout">
      <Outlet context={{ permission }} />
    </div>
  ),
}));

// Stub retained pages
vi.mock("./pages/Home/HomePage.tsx", () => ({
  default: () => <div data-testid="page-home">Home Sentinel</div>,
}));
vi.mock("./features/system/routes/User/UserPage", () => ({
  default: () => <div data-testid="page-user">User Sentinel</div>,
}));
vi.mock("./features/catalog/routes/Faculty/FacultyPage", () => ({
  default: () => <div data-testid="page-faculty">Faculty Sentinel</div>,
}));
vi.mock("./features/system/routes/SystemGroup/SystemGroupPage", () => ({
  default: () => <div data-testid="page-systemgroup">SystemGroup Sentinel</div>,
}));
vi.mock("./features/system/routes/Menu/MenuPage", () => ({
  default: () => <div data-testid="page-menu">Menu Sentinel</div>,
}));
vi.mock("./features/system/routes/Role", () => ({
  default: () => <div data-testid="page-role">Role Sentinel</div>,
}));
vi.mock("./features/system/routes/AuditLog/AuditLogPage", () => ({
  default: () => <div data-testid="page-auditlog">AuditLog Sentinel</div>,
}));
vi.mock("./features/system/routes/Auth/LoginPage", () => ({
  default: () => <div data-testid="page-login">Login Sentinel</div>,
}));
vi.mock("./pages/common/UnauthorizedPage", () => ({
  default: () => <div data-testid="page-unauthorized">Unauthorized Sentinel</div>,
}));

const allPageTestIds = [
  "page-home",
  "page-user",
  "page-faculty",
  "page-systemgroup",
  "page-menu",
  "page-role",
  "page-auditlog",
  "page-login",
  "page-unauthorized",
];

describe("Router behavior", () => {
  beforeEach(() => {
    vi.spyOn(api, "get").mockResolvedValue({ Success: true, StatusCode: 200 } as never);
    vi.spyOn(api, "post").mockResolvedValue({ Success: true, StatusCode: 200 } as never);
    window.history.replaceState({}, "", "/");
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("retired_and_unknown_urls_show_only_not_found", async () => {
    const retiredUrls = [
      "/cycle",
      "/evidence",
      "/evidencecyclemap",
      "/surveytemplate",
      "/surveycampaign",
      "/criterionevaluation",
      "/sar",
      "/internalreview",
      "/externalreview",
      "/actionplan",
      "/taskexecution",
      "/survey/do-survey",
      "/filetype",
      "/stakeholder",
      "/standard",
      "/standardset",
      "/survey/do-survey?token=obsolete-test-token",
      "/unknown/deep-link",
    ];

    setAuthState({ isAuthenticated: true, permission: { IsViewed: true } });

    for (const url of retiredUrls) {
      window.history.replaceState({}, "", url);
      const { unmount } = render(<Router />);

      expect(
        await screen.findByRole("heading", { name: "Trang không tồn tại" }),
      ).toBeInTheDocument();
      const link = screen.getByRole("link", { name: "Về trang chủ" });
      expect(link).toHaveAttribute("href", "/");

      expect(screen.queryByTestId("main-layout")).not.toBeInTheDocument();
      for (const id of allPageTestIds) {
        expect(screen.queryByTestId(id)).not.toBeInTheDocument();
      }

      expect(api.get).not.toHaveBeenCalled();
      expect(api.post).not.toHaveBeenCalled();
      unmount();
      cleanup();
    }
  });

  it("login_stays_public", async () => {
    setAuthState({ isAuthenticated: false });
    window.history.replaceState({}, "", "/login");

    render(<Router />);

    expect(await screen.findByTestId("page-login")).toBeInTheDocument();
    expect(mockAuthState.getPermission).not.toHaveBeenCalled();
    expect(screen.queryByTestId("main-layout")).not.toBeInTheDocument();
  });

  it("retained_routes_stay_guarded", async () => {
    const guardedRoutes = [
      { path: "/", testId: "page-home" },
      { path: "/user", testId: "page-user" },
      { path: "/faculty", testId: "page-faculty" },
      { path: "/systemgroup", testId: "page-systemgroup" },
      { path: "/menu", testId: "page-menu" },
      { path: "/role", testId: "page-role" },
      { path: "/auditlog", testId: "page-auditlog" },
    ];

    for (const route of guardedRoutes) {
      // 1. Unauthenticated -> redirected to login
      setAuthState({ isAuthenticated: false });
      window.history.replaceState({}, "", route.path);
      const { unmount: u1 } = render(<Router />);
      expect(await screen.findByTestId("page-login")).toBeInTheDocument();
      expect(screen.queryByTestId(route.testId)).not.toBeInTheDocument();
      u1();
      cleanup();

      // 2. Authenticated but permission denied -> redirected to unauthorized
      setAuthState({ isAuthenticated: true, permission: { IsViewed: false } });
      window.history.replaceState({}, "", route.path);
      const { unmount: u2 } = render(<Router />);
      expect(await screen.findByTestId("page-unauthorized")).toBeInTheDocument();
      expect(screen.queryByTestId(route.testId)).not.toBeInTheDocument();
      u2();
      cleanup();

      // 3. Authenticated and permission granted -> renders sentinel in main layout
      setAuthState({ isAuthenticated: true, permission: { IsViewed: true } });
      window.history.replaceState({}, "", route.path);
      const { unmount: u3 } = render(<Router />);
      expect(await screen.findByTestId(route.testId)).toBeInTheDocument();
      expect(screen.getByTestId("main-layout")).toBeInTheDocument();
      u3();
      cleanup();
    }
  });

  it("not_found_has_safe_home_link", async () => {
    // 1. Signed-out state
    setAuthState({ isAuthenticated: false });
    window.history.replaceState({}, "", "/not-found-signed-out");
    const { unmount: u1 } = render(<Router />);
    expect(
      await screen.findByRole("heading", { name: "Trang không tồn tại" }),
    ).toBeInTheDocument();
    const link1 = screen.getByRole("link", { name: "Về trang chủ" });
    expect(link1).toHaveAttribute("href", "/");
    expect(mockAuthState.getPermission).not.toHaveBeenCalled();
    u1();
    cleanup();

    // 2. Signed-in state
    setAuthState({ isAuthenticated: true, permission: { IsViewed: true } });
    window.history.replaceState({}, "", "/not-found-signed-in");
    const { unmount: u2 } = render(<Router />);
    expect(
      await screen.findByRole("heading", { name: "Trang không tồn tại" }),
    ).toBeInTheDocument();
    const link2 = screen.getByRole("link", { name: "Về trang chủ" });
    expect(link2).toHaveAttribute("href", "/");
    expect(mockAuthState.getPermission).not.toHaveBeenCalled();
    u2();
    cleanup();
  });
});
