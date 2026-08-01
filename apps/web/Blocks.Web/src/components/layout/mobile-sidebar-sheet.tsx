import { AppSidebarNav } from "@/components/layout/app-sidebar-nav"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import type {
  AuthUser,
  ChangePasswordRequest,
  EditProfileRequest,
} from "@/features/auth/types"
import type { NavNode } from "@/features/navigation/types"

type MobileSidebarSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
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

export function MobileSidebarSheet({
  open,
  onOpenChange,
  navigation,
  currentUser,
  openSubgroupIds,
  activeRoute,
  onToggleSubgroup,
  onLogout,
  onEditProfile,
  onChangePassword,
  onNavigate,
}: MobileSidebarSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="flex h-svh w-[86vw] max-w-[20rem] flex-col p-0">
        <SheetHeader className="shrink-0 border-b border-platform-border px-4 py-4">
          <SheetTitle>Blocks</SheetTitle>
          <SheetDescription>
            Bảng điều hướng hệ thống dành cho thiết bị di động.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1">
          <AppSidebarNav
            navigation={navigation}
            currentUser={currentUser}
            openSubgroupIds={openSubgroupIds}
            activeRoute={activeRoute}
            onToggleSubgroup={onToggleSubgroup}
            onLogout={onLogout}
            onEditProfile={onEditProfile}
            onChangePassword={onChangePassword}
            onNavigate={(route) => {
              onNavigate?.(route)
              onOpenChange(false)
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
