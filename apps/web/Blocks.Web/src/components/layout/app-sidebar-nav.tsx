import { ChevronRight } from "lucide-react"
import { NavLink } from "react-router"

import { SidebarAccountMenu } from "@/components/layout/sidebar-account-menu"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type {
  AuthUser,
  ChangePasswordRequest,
  EditProfileRequest,
} from "@/features/auth/types"
import type { SidebarLayoutMode } from "@/features/navigation/sidebar-layout-state"
import type { NavNode } from "@/features/navigation/types"
import { cn } from "@/lib/utils"

type AppSidebarNavProps = {
  navigation: NavNode[]
  currentUser: AuthUser
  openSubgroupIds: string[]
  activeRoute: string
  layoutMode?: SidebarLayoutMode
  onToggleSubgroup: (id: string) => void
  onLogout: () => void | Promise<void>
  onEditProfile: (request: EditProfileRequest) => unknown | Promise<unknown>
  onChangePassword: (request: ChangePasswordRequest) => unknown | Promise<unknown>
  onNavigate?: (route: string) => void
}

function ownerAccentClass(ownerKey: string) {
  if (ownerKey.includes("file")) return "bg-platform-info"
  if (ownerKey.includes("plugin") || ownerKey.includes("tradelab")) return "bg-platform-plugin"
  return "bg-platform-primary"
}

function isNodeActive(node: NavNode, activeRoute: string): boolean {
  return (
    node.route === activeRoute ||
    Boolean(node.children?.some((child) => isNodeActive(child, activeRoute)))
  )
}

function getIndentClass(depth: number) {
  if (depth <= 0) return "pl-2"
  if (depth === 1) return "pl-7"
  return "pl-11"
}

function NavTreeNode({
  node,
  activeRoute,
  openSubgroupIds,
  layoutMode = "expanded",
  onToggleSubgroup,
  onNavigate,
  depth,
}: {
  node: NavNode
  activeRoute: string
  openSubgroupIds: string[]
  layoutMode?: SidebarLayoutMode
  onToggleSubgroup: (id: string) => void
  onNavigate?: (route: string) => void
  depth: number
}) {
  const Icon = node.icon
  const isOpen = openSubgroupIds.includes(node.id)
  const active = isNodeActive(node, activeRoute)
  const hasChildren = Boolean(node.children?.length)
  const compact = layoutMode === "collapsed"

  if (!hasChildren && !node.route) return null

  if (compact && !node.route && hasChildren) {
    return (
      <SidebarMenuItem>
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  aria-label={node.title}
                  className="justify-center px-0 pr-0"
                  isActive={active}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "grid size-5 shrink-0 place-items-center rounded-md text-[10px] font-bold text-white",
                      ownerAccentClass(node.ownerKey),
                    )}
                  >
                    {Icon ? <Icon className="size-3" aria-hidden="true" /> : node.title[0]}
                  </span>
                  <span className="sr-only">{node.title}</span>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="right">{node.title}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent
            side="right"
            align="start"
            sideOffset={12}
            className="w-56"
            forceMount
          >
            {node.children?.map((child) =>
              child.route ? (
                <DropdownMenuItem
                  key={child.id}
                  className="p-0"
                >
                  <NavLink
                    to={child.route!}
                    className="flex w-full items-center gap-2 px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                    onClick={() => onNavigate?.(child.route!)}
                  >
                    {child.title}
                  </NavLink>
                </DropdownMenuItem>
              ) : null,
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    )
  }

  if (!hasChildren && node.route) {
    const route = node.route

    return (
      <SidebarMenuItem>
        <Tooltip>
          <TooltipTrigger asChild>
            <NavLink
              to={route}
              end
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-8 items-center gap-2 rounded-lg py-1.5 pr-2 text-sm text-slate-600 transition hover:bg-slate-100 hover:text-slate-900",
                compact ? "justify-center px-0 pr-0" : getIndentClass(depth),
                active && "bg-blue-50 font-semibold text-blue-700",
              )}
              onClick={() => onNavigate?.(route)}
            >
              {compact ? (
                <span
                  aria-hidden="true"
                  className={cn(
                    "grid size-5 shrink-0 place-items-center rounded-md text-[10px] font-bold text-white",
                    ownerAccentClass(node.ownerKey),
                  )}
                >
                  {Icon ? <Icon className="size-3" aria-hidden="true" /> : node.title[0]}
                </span>
              ) : (
                <span
                  aria-hidden="true"
                  className={cn(
                    "size-1.5 shrink-0 rounded-full",
                    active ? "bg-platform-success" : "bg-transparent",
                  )}
                />
              )}
              <span className={cn("min-w-0 truncate", compact && "sr-only")}>{node.title}</span>
            </NavLink>
          </TooltipTrigger>
          {compact ? <TooltipContent side="right">{node.title}</TooltipContent> : null}
        </Tooltip>
      </SidebarMenuItem>
    )
  }

  if (node.route) {
    const route = node.route

    return (
      <SidebarMenuItem>
        <Tooltip>
          <TooltipTrigger asChild>
            <NavLink
              to={route}
              end
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-9 w-full items-center gap-2 rounded-lg pr-2 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-100 hover:text-slate-900",
                compact ? "justify-center px-0 pr-0" : getIndentClass(depth),
                active && "bg-blue-50 text-blue-700",
              )}
              onClick={() => onNavigate?.(route)}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-5 shrink-0 place-items-center rounded-md text-[10px] font-bold text-white",
                  ownerAccentClass(node.ownerKey),
                )}
              >
                {Icon ? <Icon className="size-3" aria-hidden="true" /> : node.title[0]}
              </span>
              <span className={cn("min-w-0 flex-1 truncate", compact && "sr-only")}>{node.title}</span>
            </NavLink>
          </TooltipTrigger>
          {compact ? <TooltipContent side="right">{node.title}</TooltipContent> : null}
        </Tooltip>
        {!compact && (isOpen || active) && node.children?.length ? (
          <ul className="mt-1 grid gap-1">
            {node.children.map((child) => (
              <NavTreeNode
                key={child.id}
                node={child}
                activeRoute={activeRoute}
                openSubgroupIds={openSubgroupIds}
                layoutMode={layoutMode}
                onToggleSubgroup={onToggleSubgroup}
                onNavigate={onNavigate}
                depth={depth + 1}
                />
            ))}
          </ul>
        ) : null}
      </SidebarMenuItem>
    )
  }

  return (
    <SidebarMenuItem>
      <Collapsible open={isOpen || active} onOpenChange={() => onToggleSubgroup(node.id)}>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton
            className={cn(
              "justify-start gap-2 rounded-lg pr-2 text-sm font-semibold text-slate-700 hover:bg-slate-100",
              getIndentClass(depth),
              (isOpen || active) && "bg-blue-50 text-blue-700",
            )}
            isActive={isOpen || active}
          >
            <ChevronRight
              className={cn(
                "size-4 shrink-0 text-slate-500 transition-transform",
                (isOpen || active) && "rotate-90",
              )}
              aria-hidden="true"
            />
            <span
              aria-hidden="true"
              className={cn(
                "grid size-5 shrink-0 place-items-center rounded-md text-[10px] font-bold text-white",
                ownerAccentClass(node.ownerKey),
              )}
            >
              {Icon ? <Icon className="size-3" aria-hidden="true" /> : node.title[0]}
            </span>
            <span className="min-w-0 flex-1 truncate">{node.title}</span>
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-1">
          <ul className="grid gap-1">
            {node.children?.map((child) => (
              <NavTreeNode
              key={child.id}
              node={child}
              activeRoute={activeRoute}
              openSubgroupIds={openSubgroupIds}
              onToggleSubgroup={onToggleSubgroup}
              onNavigate={onNavigate}
              depth={depth + 1}
              />
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>
    </SidebarMenuItem>
  )
}

export function AppSidebarNav({
  navigation,
  currentUser,
  openSubgroupIds,
  activeRoute,
  layoutMode = "expanded",
  onToggleSubgroup,
  onLogout,
  onEditProfile,
  onChangePassword,
  onNavigate,
}: AppSidebarNavProps) {
  const compact = layoutMode === "collapsed"

  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex h-full min-h-0 flex-col">
        <ScrollArea className="min-h-0 flex-1">
          <div className={cn("grid gap-3 py-4", compact ? "px-2" : "px-3")}>
            {navigation.map((group) => (
              <SidebarGroup key={group.id} className="px-0 py-0">
                <SidebarGroupContent>
                  <SidebarMenu>
                    {group.children?.map((child) => (
                      <NavTreeNode
                        key={child.id}
                        node={child}
                        activeRoute={activeRoute}
                        openSubgroupIds={openSubgroupIds}
                        layoutMode={layoutMode}
                        onToggleSubgroup={onToggleSubgroup}
                        onNavigate={onNavigate}
                        depth={0}
                      />
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            ))}
          </div>
        </ScrollArea>

        <div className={cn("shrink-0 border-t border-platform-border", compact ? "p-2" : "p-3")}>
          <SidebarAccountMenu
            compact={compact}
            currentUser={currentUser}
            onLogout={onLogout}
            onEditProfile={onEditProfile}
            onChangePassword={onChangePassword}
          />
        </div>
      </div>
    </TooltipProvider>
  )
}
