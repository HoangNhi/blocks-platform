import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { toast } from "sonner";
import LoginPage from "./LoginPage";
import { useAuth } from "@/hooks/useAuth";
import { api } from "@/lib/api";
import type { User } from "@/features/system/types/user.types";
import type { AuthContextType, LoginResponse } from "@/features/system/types/auth.types";
import type { ApiResponse } from "@/lib/api";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/features/system/components/MotionCanvas", () => ({
  MotionCanvas: () => <div data-testid="motion-canvas" aria-hidden="true" />,
}));

const mockLogin = vi.fn();

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
  loginFn = mockLogin,
): AuthContextType => ({
  user,
  systemGroup: [],
  menu: [],
  permissions: [],
  roleName: user?.RoleName ?? null,
  isAuthenticated: !!user,
  loading: false,
  login: loginFn,
  logout: vi.fn(),
  getPermission: vi.fn(),
  refreshProfile: vi.fn(),
});

function renderLogin(user: User | null = null) {
  vi.mocked(useAuth).mockReturnValue(createMockAuth(user, mockLogin));
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<h1>Home</h1>} />
      </Routes>
    </MemoryRouter>
  );
}

function fillCredentials(username: string, password: string): void {
  const usernameInput = screen.getByLabelText("Tên tài khoản");
  const passwordInput = screen.getByLabelText("Mật khẩu");
  fireEvent.change(usernameInput, { target: { value: username } });
  fireEvent.change(passwordInput, { target: { value: password } });
}

function submit(): void {
  const form = screen.getByRole("form", { name: "Đăng nhập Blocks Studio" });
  fireEvent.submit(form);
}

describe("LoginPage", () => {
  beforeEach(() => {
    mockLogin.mockReset();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders_studio_copy_and_no_split_illustration", () => {
    renderLogin();

    expect(
      screen.getByRole("heading", { level: 1, name: "Đăng nhập Blocks Studio" })
    ).toBeVisible();
    expect(
      screen.getByText("Nơi mỗi ý tưởng trở thành một Microservice độc lập.")
    ).toBeVisible();

    expect(screen.getByText("Blocks Studio")).toBeVisible();

    const currentYear = new Date().getFullYear();
    expect(
      screen.getByText(`© ${currentYear} Blocks Platform. Modular Microservices Ecosystem.`)
    ).toBeVisible();

    const badge = screen.getByText("v2.4");
    expect(badge.closest("[aria-hidden='true']")).not.toBeNull();

    expect(screen.getByText("Hoặc đăng nhập nhanh qua")).toBeVisible();

    expect(screen.getByRole("button", { name: "Đăng nhập Studio" })).toBeVisible();
    expect(screen.getByRole("button", { name: "GitHub" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Blocks SSO" })).toBeVisible();

    const usernameInput = screen.getByLabelText("Tên tài khoản");
    expect(usernameInput).toHaveAttribute("autocomplete", "username");
    expect(screen.getByPlaceholderText("Tên tài khoản của bạn")).toBeVisible();

    const passwordInput = screen.getByLabelText("Mật khẩu");
    expect(passwordInput).toHaveAttribute("autocomplete", "current-password");

    expect(screen.getByRole("checkbox", { name: "Ghi nhớ đăng nhập" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Quên mật khẩu?" })).toBeVisible();

    const logo = document.querySelector('img[src="/blocks.png"]');
    expect(logo).not.toBeNull();
    expect(logo).toHaveClass("object-contain");

    expect(screen.getByTestId("motion-canvas")).toBeInTheDocument();

    expect(document.querySelector('img[src="/login.png"]')).toBeNull();
    expect(screen.queryByText(/Kiểm định Chất lượng Giáo dục/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Quality Assurance/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Ban thư ký/i)).not.toBeInTheDocument();
  });

  it("empty_credentials_show_existing_errors_without_login", async () => {
    renderLogin();
    submit();

    const usernameError = await screen.findByText("Vui lòng nhập tên đăng nhập");
    const passwordError = await screen.findByText("Vui lòng nhập mật khẩu");
    expect(usernameError).toBeVisible();
    expect(passwordError).toBeVisible();

    expect(mockLogin).not.toHaveBeenCalled();

    const usernameInput = screen.getByLabelText("Tên tài khoản");
    const passwordInput = screen.getByLabelText("Mật khẩu");
    expect(usernameInput).toHaveAttribute("aria-invalid", "true");
    expect(passwordInput).toHaveAttribute("aria-invalid", "true");
    expect(usernameInput.getAttribute("aria-describedby")).toContain(usernameError.id);
    expect(passwordInput.getAttribute("aria-describedby")).toContain(passwordError.id);
  });

  it("credentials_pass_unchanged_without_email_validation", async () => {
    mockLogin.mockResolvedValueOnce({
      Success: true,
      StatusCode: 200,
      Data: {} as LoginResponse,
      Message: "Thành công",
    });

    renderLogin();
    fillCredentials("  lập.trình+dev  ", " pass ! mật khẩu ");
    submit();

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("  lập.trình+dev  ", " pass ! mật khẩu ");
    });

    expect(screen.getByLabelText("Tên tài khoản")).toHaveValue("  lập.trình+dev  ");
    expect(screen.getByLabelText("Mật khẩu")).toHaveValue(" pass ! mật khẩu ");
  });

  it("duplicate_submissions_share_one_pending_request", async () => {
    let resolveLogin!: (value: ApiResponse<LoginResponse>) => void;
    const pendingPromise = new Promise<ApiResponse<LoginResponse>>((resolve) => {
      resolveLogin = resolve;
    });
    mockLogin.mockReturnValue(pendingPromise);

    renderLogin();
    fillCredentials("admin", "secret123");

    submit();
    submit();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Đang đăng nhập…" })).toBeDisabled();
    });

    submit();

    expect(mockLogin).toHaveBeenCalledTimes(1);
    const form = screen.getByRole("form", { name: "Đăng nhập Blocks Studio" });
    expect(form).toHaveAttribute("aria-busy", "true");

    await act(async () => {
      resolveLogin({
        Success: false,
        StatusCode: 400,
        Data: {} as LoginResponse,
        Message: "Đăng nhập thất bại",
      });
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Đăng nhập Studio" })).toBeEnabled();
    });
    expect(form).toHaveAttribute("aria-busy", "false");

    mockLogin.mockResolvedValueOnce({
      Success: false,
      StatusCode: 400,
      Data: {} as LoginResponse,
      Message: "Lỗi lần 2",
    });
    submit();

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledTimes(2);
    });
  });

  it("envelope_failures_and_rejections_restore_submit", async () => {
    const cases = [
      {
        rejection: false,
        payload: { Success: false, StatusCode: 200, Message: "Sai thông tin" },
        expectedToast: "Sai thông tin",
      },
      {
        rejection: false,
        payload: { Success: false, StatusCode: 200, Message: "" },
        expectedToast: "Đăng nhập thất bại",
      },
      {
        rejection: true,
        payload: new Error("Mất kết nối"),
        expectedToast: "Mất kết nối",
      },
      {
        rejection: true,
        payload: "Unexpected network failure",
        expectedToast: "Đăng nhập thất bại",
      },
    ];

    for (const c of cases) {
      const toastSpy = vi.spyOn(toast, "error").mockImplementation(() => "" as never);
      if (c.rejection) {
        mockLogin.mockRejectedValueOnce(c.payload);
      } else {
        mockLogin.mockResolvedValueOnce(c.payload as ApiResponse<LoginResponse>);
      }

      const { unmount } = renderLogin();
      fillCredentials("admin", "secret123");
      submit();

      await waitFor(() => {
        expect(toastSpy).toHaveBeenCalledWith(c.expectedToast);
      });

      const submitButton = screen.getByRole("button", { name: "Đăng nhập Studio" });
      expect(submitButton).toBeEnabled();
      expect(screen.queryByRole("heading", { name: "Home" })).not.toBeInTheDocument();

      unmount();
      toastSpy.mockRestore();
    }
  });

  it("existing_user_redirects_home", async () => {
    const validUser = createMockUser();
    renderLogin(validUser);

    expect(await screen.findByRole("heading", { name: "Home" })).toBeVisible();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("visibility_toggle_keeps_password_without_submitting", () => {
    renderLogin();
    fillCredentials("admin", "secret123");

    const passwordInput = screen.getByLabelText("Mật khẩu");
    expect(passwordInput).toHaveAttribute("type", "password");
    expect(passwordInput).toHaveValue("secret123");

    const showToggle = screen.getByRole("button", { name: "Hiện mật khẩu" });
    expect(showToggle).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(showToggle);

    expect(passwordInput).toHaveAttribute("type", "text");
    expect(passwordInput).toHaveValue("secret123");

    const hideToggle = screen.getByRole("button", { name: "Ẩn mật khẩu" });
    expect(hideToggle).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(hideToggle);

    expect(passwordInput).toHaveAttribute("type", "password");
    expect(passwordInput).toHaveValue("secret123");
    expect(screen.getByRole("button", { name: "Hiện mật khẩu" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );

    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("placeholders_remain_noops_with_valid_credentials", () => {
    const postSpy = vi.spyOn(api, "post");
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const toastSpy = vi.spyOn(toast, "error").mockImplementation(() => "" as never);

    renderLogin();
    fillCredentials("admin", "secret123");

    const githubBtn = screen.getByRole("button", { name: "GitHub" });
    const ssoBtn = screen.getByRole("button", { name: "Blocks SSO" });
    const recoveryBtn = screen.getByRole("button", { name: "Quên mật khẩu?" });

    expect(githubBtn).toHaveAttribute("type", "button");
    expect(ssoBtn).toHaveAttribute("type", "button");
    expect(recoveryBtn).toHaveAttribute("type", "button");

    fireEvent.click(githubBtn);
    fireEvent.click(ssoBtn);
    fireEvent.click(recoveryBtn);

    expect(mockLogin).not.toHaveBeenCalled();
    expect(postSpy).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
    expect(screen.getByRole("form", { name: "Đăng nhập Blocks Studio" })).toBeInTheDocument();
    expect(toastSpy).not.toHaveBeenCalled();
  });

  it("remember_is_local_and_resets_on_remount", () => {
    const { unmount } = renderLogin();

    const setItemSpy = vi.spyOn(Storage.prototype, "setItem");
    const cookieSetterSpy = vi.spyOn(document, "cookie", "set");

    const checkbox = screen.getByRole("checkbox", { name: "Ghi nhớ đăng nhập" });
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();

    expect(setItemSpy).not.toHaveBeenCalled();
    expect(cookieSetterSpy).not.toHaveBeenCalled();
    expect(mockLogin).not.toHaveBeenCalled();

    unmount();

    renderLogin();
    const remountedCheckbox = screen.getByRole("checkbox", { name: "Ghi nhớ đăng nhập" });
    expect(remountedCheckbox).not.toBeChecked();
  });
});
