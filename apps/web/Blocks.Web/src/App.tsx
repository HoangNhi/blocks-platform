import { lazy, Suspense, useEffect, type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { LoaderCircle, ShieldCheck } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { PageState } from "@/components/platform/page-state";
import { AccessDeniedPage } from "@/features/auth/access-denied-page";
import { AuthProvider, useAuth } from "@/features/auth/auth-context";
import { LoginPage } from "@/features/auth/login-page";
import { ProtectedRoute } from "@/features/auth/protected-route";
import { PlatformOverview } from "@/features/dashboard/platform-overview";
import { useNavigationData } from "@/features/navigation/navigation-hooks";
import { RouteStubPage } from "@/features/platform/route-stub-page";
import { ApiError } from "@/lib/api/api-error";

const PluginReadinessPage = lazy(() =>
  import("@/features/plugins/plugin-readiness-page").then((module) => ({
    default: module.PluginReadinessPage,
  })),
);
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

const PermissionMatrixPage = lazy(() =>
  import("@/features/admin/pages/permission-matrix-page").then((module) => ({
    default: module.PermissionMatrixPage,
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

  if (error instanceof ApiError && error.isForbidden) {
    return <AccessDeniedPage />;
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
          <Route path="/403" element={<AccessDeniedPage />} />
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
                element={
                  <RouteStubPage
                    title="System Overview"
                    description="Chưa kết nối. Các trang quản trị hệ thống vẫn chưa được triển khai."
                  />
                }
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
                path="/system/identity/permissions"
                element={renderLazyRoute(<PermissionMatrixPage />)}
              />
              <Route
                path="/services/files/library"
                element={
                  <RouteStubPage
                    title="File Library"
                    description="Dịch vụ chỉ lưu trữ. Tải tệp được dùng bởi các biểu mẫu tính năng qua File Service API; một thư viện tệp độc lập không nằm trong giai đoạn này."
                  />
                }
              />
              <Route
                path="/services/files/storage-providers"
                element={
                  <RouteStubPage
                    title="Storage Providers"
                    description="Dịch vụ chỉ lưu trữ. Quản lý nhà cung cấp không nằm trong hợp đồng File Service hiện tại."
                  />
                }
              />
              <Route
                path="/plugins/installed"
                element={renderLazyRoute(
                  <PluginReadinessPage
                    title="Installed Plugins"
                    description="Sổ đăng ký plugin chưa được kết nối. Tuyến này ở chế độ sẵn sàng cho đến khi có hợp đồng runtime thực sự."
                  />,
                )}
              />
              <Route
                path="/plugins/activity"
                element={renderLazyRoute(
                  <PluginReadinessPage
                    title="Plugin Activity"
                    description="Hoạt động runtime chưa được kết nối. Tuyến này vẫn là một bề mặt sẵn sàng cho đến khi có hợp đồng hoạt động từ backend."
                  />,
                )}
              />
              <Route
                path="/plugins/manifests"
                element={renderLazyRoute(
                  <PluginReadinessPage
                    title="Plugin Manifests"
                    description="Kiểm tra manifest chưa được kết nối. Tuyến này không tự bịa dữ liệu registry hoặc manifest."
                  />,
                )}
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
