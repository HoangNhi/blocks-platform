import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { LoaderCircle, ShieldCheck } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AppShell } from "@/components/layout/app-shell";
import { PageState } from "@/components/platform/page-state";
import { LoginPage } from "@/features/auth/login-page";
import { RegistrationPage } from "@/features/auth/registration-page";
import { AuthProvider, useAuth } from "@/features/auth/auth-context";
import { ProtectedRoute } from "@/features/auth/protected-route";
import { PlatformOverview } from "@/features/dashboard/platform-overview";
import { useNavigationData } from "@/features/navigation/navigation-hooks";
import { RouteStubPage } from "@/features/platform/route-stub-page";
import { ApiError } from "@/lib/api/api-error";
import { SystemOverviewPage } from "@/features/admin/pages/system-overview-page";

const AuditLogPage = lazy(() =>
  import("@/features/admin/pages/audit-log-page").then((module) => ({
    default: module.AuditLogPage,
  })),
);

const MenusPage = lazy(() =>
  import("@/features/admin/pages/menus-page").then((module) => ({
    default: module.MenusPage,
  })),
);

const RolesPage = lazy(() =>
  import("@/features/admin/pages/roles-page").then((module) => ({
    default: module.RolesPage,
  })),
);

const SystemGroupsPage = lazy(() =>
  import("@/features/admin/pages/system-groups-page").then((module) => ({
    default: module.SystemGroupsPage,
  })),
);

const UsersPage = lazy(() =>
  import("@/features/admin/pages/users-page").then((module) => ({
    default: module.UsersPage,
  })),
);

const StrategyLabPage = lazy(() =>
  import("@/plugins/tradelab/pages/strategy-lab-page").then((module) => ({
    default: module.StrategyLabPage,
  })),
);

const DatasetCatalogPage = lazy(() =>
  import("@/plugins/tradelab/pages/dataset-catalog-page").then((module) => ({
    default: module.DatasetCatalogPage,
  })),
);

const HermesOverviewPage = lazy(() =>
  import("@/features/hermes-overview/hermes-overview-page").then((module) => ({
    default: module.HermesOverviewPage,
  })),
);

const AiVideoOperationsPage = lazy(() =>
  import("@/plugins/ai-video-production/pages/ai-video-operations-page").then((module) => ({
    default: module.AiVideoOperationsPage,
  })),
);

const AiVideoRunDetailPage = lazy(() =>
  import("@/plugins/ai-video-production/pages/ai-video-run-detail-page").then((module) => ({
    default: module.AiVideoRunDetailPage,
  })),
);

function RouteLoadingState() {
  return (
    <PageState
      icon={LoaderCircle}
      title="Đang tải trang"
      description="Đang tải nội dung tuyến vừa chọn."
    />
  );
}

function renderLazyRoute(element: ReactNode) {
  return <Suspense fallback={<RouteLoadingState />}>{element}</Suspense>;
}

function ShellRoute() {
  const { currentUser, logout, status, editProfile, changePassword, session } =
    useAuth();
  const { navigation, isLoading, error } = useNavigationData(
    currentUser?.id ?? null,
  );

  useEffect(() => {
    if (error instanceof ApiError && error.isUnauthorized) {
      void logout();
    }
  }, [error, logout]);

  if (status === "forbidden" || (error instanceof ApiError && error.isForbidden)) {
    return (
      <Alert role="alert" variant="destructive" className="m-4">
        <AlertTitle>Truy cập bị từ chối</AlertTitle>
        <AlertDescription>Bạn không có quyền xem nội dung này. Hãy liên hệ quản trị viên để được cấp quyền phù hợp.</AlertDescription>
      </Alert>
    );
  }

  if (status !== "authenticated" || !currentUser) {
    return (
      <PageState
        icon={ShieldCheck}
        title="Đang mở shell"
        description="Đang chuẩn bị không gian làm việc đã xác thực."
      />
    );
  }

  if (isLoading) {
    return (
      <PageState
        icon={ShieldCheck}
        title="Đang tải điều hướng"
        description="Đang lấy cây menu của người dùng hiện tại."
      />
    );
  }

  if (error instanceof ApiError && error.isUnauthorized) {
    return <Navigate to="/login" replace />;
  }

  if (error) {
    return (
      <PageState
        icon={ShieldCheck}
        title="Không tải được điều hướng"
        description={error.message}
        tone="danger"
      />
    );
  }

  return (
    <AppShell
      navigation={navigation}
      currentUser={currentUser}
      onLogout={logout}
      onEditProfile={editProfile}
      onChangePassword={changePassword}
      accessToken={session?.tokens.accessToken ?? undefined}
    />
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegistrationPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<ShellRoute />}>
              <Route index element={<PlatformOverview />} />
              <Route
                path="/overview/service-health"
                element={
                  <RouteStubPage
                    title="Service Health"
                    description="Chưa kết nối. Kiểm tra sức khỏe hệ thống vẫn chưa được nối với backend."
                  />
                }
              />
              <Route
                path="/overview/recent-activity"
                element={
                  <RouteStubPage
                    title="Recent Activity"
                    description="Chưa kết nối. Dòng thời gian hoạt động vẫn cần một nguồn backend."
                  />
                }
              />
              <Route
                path="/system/overview"
                element={<SystemOverviewPage />}
              />
              <Route
                path="/system/audit-log"
                element={renderLazyRoute(<AuditLogPage />)}
              />
              <Route
                path="/system/identity/users"
                element={renderLazyRoute(<UsersPage />)}
              />
              <Route
                path="/system/identity/roles"
                element={renderLazyRoute(<RolesPage />)}
              />
              <Route
                path="/system/identity/menus"
                element={renderLazyRoute(<MenusPage />)}
              />
              <Route
                path="/system/identity/system-groups"
                element={renderLazyRoute(<SystemGroupsPage />)}
              />
              <Route
                path="/plugins/tradelab"
                element={renderLazyRoute(<StrategyLabPage />)}
              />
              <Route
                path="/plugins/tradelab/datasets"
                element={renderLazyRoute(<DatasetCatalogPage />)}
              />
              <Route
                path="/plugins/ai-video"
                element={renderLazyRoute(<AiVideoOperationsPage />)}
              />
              <Route
                path="/plugins/ai-video/runs/:runId"
                element={renderLazyRoute(<AiVideoRunDetailPage />)}
              />
              <Route
                path="/system/hermes/overview"
                element={renderLazyRoute(<HermesOverviewPage />)}
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
