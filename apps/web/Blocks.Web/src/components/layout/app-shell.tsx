import { useEffect, useMemo, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileSidebarSheet } from "@/components/layout/mobile-sidebar-sheet";
import { WorkspaceTopChrome } from "@/components/layout/workspace-top-chrome";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type {
  AuthUser,
  ChangePasswordRequest,
  EditProfileRequest,
} from "@/features/auth/types";
import {
  canAccessRoute,
  getParentSubgroupIdsForRoute,
  getVisibleNavigation,
} from "@/features/navigation/navigation-utils";
import {
  ensureOpenSubgroups,
  toggleOpenSubgroup,
} from "@/features/navigation/sidebar-state";
import {
  getSidebarLayoutStorageKey,
  parseSidebarLayoutMode,
  toggleSidebarLayoutMode,
  type SidebarLayoutMode,
} from "@/features/navigation/sidebar-layout-state";
import type { NavNode } from "@/features/navigation/types";
import {
  DEFAULT_WORKSPACE_ROUTE,
  closeWorkspaceTab,
  getWorkspaceTabsStorageKey,
  openWorkspaceTab,
  parseSerializedWorkspaceTabs,
  resolveWorkspaceTabsState,
  serializeWorkspaceTabs,
} from "@/features/navigation/workspace-tabs";
import {
  createAssistantApi,
  type AssistantApi,
} from "@/features/assistant/assistant-api";
import { AssistantDrawer } from "@/features/assistant/assistant-drawer";

const OPEN_STATE_KEY = "blocks.sidebar.openSubgroups";

type AppShellProps = {
  navigation: NavNode[];
  currentUser: AuthUser;
  accessToken?: string;
  assistantApi?: AssistantApi;
  onLogout: () => void | Promise<void>;
  onEditProfile: (request: EditProfileRequest) => unknown | Promise<unknown>;
  onChangePassword: (
    request: ChangePasswordRequest,
  ) => unknown | Promise<unknown>;
};

function getInitialOpenSubgroups() {
  try {
    const rawValue = window.localStorage.getItem(OPEN_STATE_KEY);
    return rawValue ? (JSON.parse(rawValue) as string[]) : ["workspace"];
  } catch {
    return ["workspace"];
  }
}

function getInitialSidebarLayoutMode(userId: string): SidebarLayoutMode {
  try {
    return parseSidebarLayoutMode(
      window.localStorage.getItem(getSidebarLayoutStorageKey(userId)),
    );
  } catch {
    return "expanded";
  }
}

function getInitialWorkspaceRoutes(userId: string) {
  try {
    const parsed = parseSerializedWorkspaceTabs(
      window.localStorage.getItem(getWorkspaceTabsStorageKey(userId)),
    );

    return parsed?.routes ?? [DEFAULT_WORKSPACE_ROUTE];
  } catch {
    return [DEFAULT_WORKSPACE_ROUTE];
  }
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(query).matches,
  );

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);

    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);

  return matches;
}

export function AppShell({
  navigation,
  currentUser,
  onLogout,
  onEditProfile,
  onChangePassword,
  accessToken = undefined,
  assistantApi = undefined,
}: AppShellProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const activeRoute = location.pathname;
  const visibleNavigation = useMemo(
    () => getVisibleNavigation(navigation),
    [navigation],
  );
  const requiredOpenIds = useMemo(
    () => getParentSubgroupIdsForRoute(visibleNavigation, activeRoute),
    [activeRoute, visibleNavigation],
  );
  const [openSubgroupIds, setOpenSubgroupIds] = useState(
    getInitialOpenSubgroups,
  );
  const [workspaceRouteState, setWorkspaceRouteState] = useState(() => ({
    userId: currentUser.id,
    routes: getInitialWorkspaceRoutes(currentUser.id),
  }));
  const workspaceRoutes =
    workspaceRouteState.userId === currentUser.id
      ? workspaceRouteState.routes
      : getInitialWorkspaceRoutes(currentUser.id);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [desktopSidebarMode, setDesktopSidebarMode] = useState(() =>
    getInitialSidebarLayoutMode(currentUser.id),
  );
  const isCompactDesktopViewport = useMediaQuery(
    "(min-width: 768px) and (max-width: 1179px)",
  );
  const effectiveDesktopSidebarMode: SidebarLayoutMode = isCompactDesktopViewport
    ? "collapsed"
    : desktopSidebarMode;

  const [assistantOpen, setAssistantOpen] = useState(false);
  const defaultAssistantApi = useMemo(() => {
    return createAssistantApi({
      baseUrl: import.meta.env.VITE_API_BASE_URL ?? "/",
      getAccessToken: () => accessToken ?? null,
    });
  }, [accessToken]);

  const effectiveOpenSubgroupIds = useMemo(
    () => ensureOpenSubgroups(openSubgroupIds, requiredOpenIds),
    [openSubgroupIds, requiredOpenIds],
  );
  const workspaceTabsState = useMemo(
    () =>
      resolveWorkspaceTabsState({
        navigation: visibleNavigation,
        routes: workspaceRoutes,
        activeRoute,
      }),
    [activeRoute, visibleNavigation, workspaceRoutes],
  );

  const activeWorkspaceTab = workspaceTabsState.tabs.find(
    (tab) => tab.route === workspaceTabsState.activeRoute,
  );

  const assistantPageContext = useMemo(
    () => ({
      route: activeRoute,
      title: activeWorkspaceTab?.title ?? "Current page",
      ownerKey: activeWorkspaceTab?.ownerKey ?? "workspace",
    }),
    [
      activeRoute,
      activeWorkspaceTab?.ownerKey,
      activeWorkspaceTab?.title,
    ],
  );

  const effectiveAssistantApi = assistantApi ?? defaultAssistantApi;

  useEffect(() => {
    window.localStorage.setItem(
      OPEN_STATE_KEY,
      JSON.stringify(openSubgroupIds),
    );
  }, [openSubgroupIds]);

  useEffect(() => {
    window.localStorage.setItem(
      getSidebarLayoutStorageKey(currentUser.id),
      JSON.stringify(desktopSidebarMode),
    );
  }, [currentUser.id, desktopSidebarMode]);

  useEffect(() => {
    const serialized = serializeWorkspaceTabs(workspaceTabsState);

    window.localStorage.setItem(
      getWorkspaceTabsStorageKey(currentUser.id),
      JSON.stringify(serialized),
    );
  }, [currentUser.id, workspaceTabsState]);

  function selectWorkspaceRoute(route: string) {
    const nextState = openWorkspaceTab(workspaceTabsState, route);
    setWorkspaceRouteState({
      userId: currentUser.id,
      routes: nextState.tabs.map((tab) => tab.route),
    });
    navigate(route);
  }

  function closeWorkspaceRoute(route: string) {
    const nextState = closeWorkspaceTab(workspaceTabsState, route);
    setWorkspaceRouteState({
      userId: currentUser.id,
      routes: nextState.tabs.map((tab) => tab.route),
    });

    if (nextState.activeRoute !== activeRoute) {
      navigate(nextState.activeRoute);
    }
  }

  const hasRouteAccess = canAccessRoute(navigation, activeRoute);

  return (
    <div className="flex h-svh overflow-hidden bg-platform-bg text-platform-ink">
      <div className="hidden h-full min-h-0 md:flex">
        <AppSidebar
          layoutMode={effectiveDesktopSidebarMode}
          navigation={visibleNavigation}
          currentUser={currentUser}
          openSubgroupIds={effectiveOpenSubgroupIds}
          activeRoute={activeRoute}
          onToggleSubgroup={(id) =>
            setOpenSubgroupIds((current) => toggleOpenSubgroup(current, id))
          }
          onLogout={onLogout}
          onEditProfile={onEditProfile}
          onChangePassword={onChangePassword}
          onNavigate={selectWorkspaceRoute}
        />
      </div>

      <MobileSidebarSheet
        open={mobileSidebarOpen}
        onOpenChange={setMobileSidebarOpen}
        navigation={visibleNavigation}
        currentUser={currentUser}
        openSubgroupIds={effectiveOpenSubgroupIds}
        activeRoute={activeRoute}
        onToggleSubgroup={(id) =>
          setOpenSubgroupIds((current) => toggleOpenSubgroup(current, id))
        }
        onLogout={onLogout}
        onEditProfile={onEditProfile}
        onChangePassword={onChangePassword}
        onNavigate={selectWorkspaceRoute}
      />

      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <WorkspaceTopChrome
          tabs={workspaceTabsState.tabs}
          candidates={workspaceTabsState.candidates}
          activeRoute={workspaceTabsState.activeRoute}
          desktopSidebarMode={effectiveDesktopSidebarMode}
          assistantOpen={assistantOpen}
          onSelectRoute={selectWorkspaceRoute}
          onCloseRoute={closeWorkspaceRoute}
          onOpenMobileSidebar={() => setMobileSidebarOpen(true)}
          onToggleDesktopSidebar={() =>
            setDesktopSidebarMode((current) => toggleSidebarLayoutMode(current))
          }
          onOpenAssistant={() => setAssistantOpen(true)}
        />
        <div className="min-h-0 flex-1 overflow-auto p-3 md:p-4 xl:p-5">
          {hasRouteAccess ? <Outlet /> : (
            <Alert role="alert" variant="destructive">
              <AlertTitle>Truy cập bị từ chối</AlertTitle>
              <AlertDescription>Bạn không có quyền truy cập nội dung này.</AlertDescription>
            </Alert>
          )}
        </div>
      </main>
      <AssistantDrawer
        open={assistantOpen}
        onOpenChange={setAssistantOpen}
        pageContext={assistantPageContext}
        streamMessage={effectiveAssistantApi.streamChat}
      />
    </div>
  );
}
