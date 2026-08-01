import { AppSidebarNav } from "@/components/layout/app-sidebar-nav"
import type {
  AuthUser,
  ChangePasswordRequest,
  EditProfileRequest,
} from "@/features/auth/types"
import type { SidebarLayoutMode } from "@/features/navigation/sidebar-layout-state"
import type { NavNode } from "@/features/navigation/types"
import { cn } from "@/lib/utils"

type AppSidebarProps = {
  layoutMode: SidebarLayoutMode
  navigation: NavNode[]
  currentUser: AuthUser
  openSubgroupIds: string[]
  activeRoute: string
  onToggleSubgroup: (id: string) => void
  onLogout: () => void | Promise<void>
  onEditProfile: (request: EditProfileRequest) => unknown | Promise<unknown>
  onChangePassword: (request: ChangePasswordRequest) => unknown | Promise<unknown>
  onNavigate?: (route: string) => void
}

export function AppSidebar({
  layoutMode,
  navigation,
  currentUser,
  openSubgroupIds,
  activeRoute,
  onToggleSubgroup,
  onLogout,
  onEditProfile,
  onChangePassword,
  onNavigate,
}: AppSidebarProps) {
  const compact = layoutMode === "collapsed"

  return (
    <aside
      className={cn(
        "flex h-full min-h-0 shrink-0 flex-col border-r border-platform-border bg-[linear-gradient(180deg,rgba(255,255,255,0.94)_0%,rgba(248,250,252,1)_100%)] shadow-[0_20px_60px_rgba(15,23,42,0.08)] transition-[width] duration-200",
        compact ? "w-[4.5rem]" : "w-80",
      )}
    >
      <div
        className={cn(
          "flex h-18 shrink-0 items-center border-b border-platform-border",
          compact ? "justify-center px-2" : "gap-3 px-4",
        )}
      >
        <span className="size-9 rounded-lg bg-[conic-gradient(from_20deg,#2563eb,#06b6d4,#22c55e,#f59e0b,#2563eb)]" />
        {!compact ? (
          <div className="min-w-0">
            <strong className="block truncate text-base font-semibold text-platform-ink">
              Blocks
            </strong>
            <span className="block truncate text-xs text-platform-muted">
              Không gian làm việc nền tảng
            </span>
          </div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1">
        <AppSidebarNav
          layoutMode={layoutMode}
          navigation={navigation}
          currentUser={currentUser}
          openSubgroupIds={openSubgroupIds}
          activeRoute={activeRoute}
          onToggleSubgroup={onToggleSubgroup}
          onLogout={onLogout}
          onEditProfile={onEditProfile}
          onChangePassword={onChangePassword}
          onNavigate={onNavigate}
        />
      </div>
    </aside>
  )
}
