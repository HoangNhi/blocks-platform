import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
} from "@/components/ui/sidebar";

import { useLocation, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { NavUser } from "./NavUser";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const location = useLocation();
  const pathname = location.pathname.replace("/", "");
  const { systemGroup, menu, user } = useAuth();
  const [openGroupId, setOpenGroupId] = React.useState<string | null>(null);

  // Filter root groups (Level 1)
  const rootGroups = React.useMemo(
    () =>
      systemGroup
        ?.filter((g) => !g.ParentId)
        ?.sort((a, b) => a.Sort - b.Sort) || [],
    [systemGroup],
  );

  return (
    <Sidebar {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link to="/">
                <img src="/blocks.png" alt="Blocks" className="size-8 rounded-lg" />
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-medium">Blocks</span>
                  <span className="">v1.0.0</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={pathname === "/"}
                className="data-[active=true]:bg-muted data-[active=true]:font-bold"
              >
                <Link className="font-medium" to="/">
                  <span className="min-w-0 flex-1 whitespace-normal wrap-break-word">
                    TỔNG QUAN
                  </span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>

            {/* Level 1: Root Groups */}
            {rootGroups.map((group) => {
              // Find direct menus for this group
              const groupMenus = menu?.filter(
                (item) => item.SystemGroupId === group.Id,
              );
              // Find child groups (Level 2)
              const childGroups = systemGroup
                ?.filter((g) => g.ParentId === group.Id)
                ?.sort((a, b) => a.Sort - b.Sort);

              const hasChildren =
                (groupMenus && groupMenus.length > 0) ||
                (childGroups && childGroups.length > 0);

              if (!hasChildren) return null;

              // Helper to check if a path matches
              const isPathActive = (path?: string) => {
                if (!path) return false;
                return pathname.toLowerCase() === path.toLowerCase();
              };

              // Determine if any child menu (Level 1 or Level 2) is active
              const isGroupActive =
                groupMenus?.some((item) => isPathActive(item.Controller)) ||
                childGroups?.some((subGroup) =>
                  menu?.some(
                    (item) =>
                      item.SystemGroupId === subGroup.Id &&
                      isPathActive(item.Controller),
                  ),
                );

              return (
                <Collapsible
                  key={group.Id}
                  open={group.Id === openGroupId}
                  onOpenChange={(isOpen) =>
                    setOpenGroupId(isOpen ? group.Id : null)
                  }
                  className="group/collapsible"
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        className="font-medium data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold"
                        isActive={isGroupActive}
                      >
                        <span className="min-w-0 flex-1 whitespace-normal wrap-break-word leading-snug">
                          {group.Name}
                        </span>
                        <ChevronRight className="ml-auto transition-transform group-data-[state=open]/collapsible:rotate-90" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <SidebarMenuSub className="mr-0 pr-0">
                        {/* Level 1 Menus (Direct children of Root) */}
                        {groupMenus?.map((item) => (
                          <SidebarMenuSubItem key={item.Id}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={isPathActive(item.Controller)}
                            >
                              <Link
                                to={item.Controller}
                                className={cn(
                                  isPathActive(item.Controller) &&
                                    "bg-primary/10 text-primary font-bold block w-full rounded-md p-2",
                                )}
                              >
                                <span className="min-w-0 flex-1 whitespace-normal wrap-break-word">
                                  {item.Name}
                                </span>
                              </Link>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}

                        {/* Level 2: Sub Groups */}
                        {childGroups?.map((subGroup) => {
                          const subGroupMenus = menu?.filter(
                            (item) => item.SystemGroupId === subGroup.Id,
                          );

                          if (!subGroupMenus?.length) return null;

                          // Determine if any child menu (Level 3) is active
                          const isSubGroupActive = subGroupMenus.some((item) =>
                            isPathActive(item.Controller),
                          );

                          return (
                            <Collapsible
                              key={subGroup.Id}
                              className="group/sub-collapsible"
                            >
                              <SidebarMenuItem>
                                <CollapsibleTrigger asChild>
                                  <SidebarMenuButton
                                    className="h-auto whitespace-normal pr-2 data-[active=true]:bg-primary/10 data-[active=true]:text-primary data-[active=true]:font-bold"
                                    isActive={isSubGroupActive}
                                  >
                                    {/* Manual indentation to match siblings in SidebarMenuSub */}
                                    <span className="min-w-0 flex-1 whitespace-normal wrap-break-word leading-snug">
                                      {subGroup.Name}
                                    </span>
                                    <ChevronRight className="ml-auto transition-transform group-data-[state=open]/sub-collapsible:rotate-90" />
                                  </SidebarMenuButton>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  {/* Indent the children to match hierarchy */}
                                  <SidebarMenuSub className="mr-0 border-l-0 px-0 ml-6">
                                    {/* Level 3: Menus inside Sub Group */}
                                    {subGroupMenus.map((item) => (
                                      <SidebarMenuSubItem key={item.Id}>
                                        <SidebarMenuSubButton
                                          asChild
                                          isActive={isPathActive(
                                            item.Controller,
                                          )}
                                          className="pl-2"
                                        >
                                          <Link
                                            to={item.Controller}
                                            className={cn(
                                              isPathActive(item.Controller) &&
                                                "bg-primary/10 text-primary font-bold block w-full rounded-md p-2",
                                            )}
                                          >
                                            <span className="min-w-0 flex-1 whitespace-normal wrap-break-word">
                                              {item.Name}
                                            </span>
                                          </Link>
                                        </SidebarMenuSubButton>
                                      </SidebarMenuSubItem>
                                    ))}
                                  </SidebarMenuSub>
                                </CollapsibleContent>
                              </SidebarMenuItem>
                            </Collapsible>
                          );
                        })}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>{user && <NavUser user={user} />}</SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
