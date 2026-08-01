import { Menu, PanelLeft, Plus, Search, Sparkles, X } from "lucide-react";
import {
  Fragment,
  cloneElement,
  isValidElement,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { WorkspaceTab } from "@/features/navigation/workspace-tabs";
import type { SidebarLayoutMode } from "@/features/navigation/sidebar-layout-state";
import { cn } from "@/lib/utils";

type WorkspaceTopChromeProps = {
  tabs: WorkspaceTab[];
  candidates: WorkspaceTab[];
  activeRoute: string;
  breadcrumb: WorkspaceTab["breadcrumb"];
  desktopSidebarMode: SidebarLayoutMode;
  onSelectRoute: (route: string) => void;
  onCloseRoute: (route: string) => void;
  onOpenMobileSidebar: () => void;
  onToggleDesktopSidebar: () => void;
  onOpenAssistant: () => void;
};

export function WorkspaceTopChrome({
  tabs,
  candidates,
  activeRoute,
  breadcrumb,
  desktopSidebarMode,
  onSelectRoute,
  onCloseRoute,
  onOpenMobileSidebar,
  onToggleDesktopSidebar,
  onOpenAssistant,
}: WorkspaceTopChromeProps) {
  const activeTab =
    tabs.find((tab) => tab.route === activeRoute) ?? tabs[0] ?? candidates[0];

  return (
    <TooltipProvider delayDuration={250}>
      <div className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <WorkspaceTabStrip
          tabs={tabs}
          candidates={candidates}
          activeRoute={activeRoute}
          onSelectRoute={onSelectRoute}
          onCloseRoute={onCloseRoute}
        />
        <WorkspacePageBar
          activeTab={activeTab}
          breadcrumb={breadcrumb}
          candidates={candidates}
          desktopSidebarMode={desktopSidebarMode}
          onSelectRoute={onSelectRoute}
          onOpenMobileSidebar={onOpenMobileSidebar}
          onToggleDesktopSidebar={onToggleDesktopSidebar}
          onOpenAssistant={onOpenAssistant}
        />
      </div>
    </TooltipProvider>
  );
}

type WorkspaceTabStripProps = {
  tabs: WorkspaceTab[];
  candidates: WorkspaceTab[];
  activeRoute: string;
  onSelectRoute: (route: string) => void;
  onCloseRoute: (route: string) => void;
};

function WorkspaceTabStrip({
  tabs,
  candidates,
  activeRoute,
  onSelectRoute,
  onCloseRoute,
}: WorkspaceTabStripProps) {
  return (
    <div className="hidden h-10 items-center border-b bg-muted/35 px-3 md:flex">
      <ScrollArea className="min-w-0 flex-1 whitespace-nowrap">
        <div className="flex min-w-max items-center gap-1 pr-2" role="tablist">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = tab.route === activeRoute;

            return (
              <div
                key={tab.route}
                className={cn(
                  "group flex h-8 max-w-56 items-center rounded-md border transition-colors",
                  isActive
                    ? "border-border bg-background text-foreground shadow-sm"
                    : "border-transparent text-muted-foreground hover:bg-background/70 hover:text-foreground",
                )}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className="flex h-full min-w-0 items-center gap-1.5 px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => onSelectRoute(tab.route)}
                >
                  {Icon ? (
                    <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                  ) : null}
                  <span className="truncate">{tab.title}</span>
                </button>
                {!tab.pinned ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Close ${tab.title} tab`}
                        className="mr-1 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => onCloseRoute(tab.route)}
                      >
                        <X className="size-3.5" aria-hidden="true" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Close {tab.title} tab</TooltipContent>
                  </Tooltip>
                ) : null}
              </div>
            );
          })}
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
      <WorkspaceQuickSwitcher
        candidates={candidates}
        onSelectRoute={onSelectRoute}
      />
    </div>
  );
}

type WorkspacePageBarProps = {
  activeTab?: WorkspaceTab;
  breadcrumb: WorkspaceTab["breadcrumb"];
  candidates: WorkspaceTab[];
  desktopSidebarMode: SidebarLayoutMode;
  onSelectRoute: (route: string) => void;
  onOpenMobileSidebar: () => void;
  onToggleDesktopSidebar: () => void;
  onOpenAssistant: () => void;
};

function WorkspacePageBar({
  activeTab,
  breadcrumb,
  candidates,
  desktopSidebarMode,
  onSelectRoute,
  onOpenMobileSidebar,
  onToggleDesktopSidebar,
  onOpenAssistant,
}: WorkspacePageBarProps) {
  return (
    <div className="flex min-h-12 items-center gap-2 px-3 md:px-4">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="hidden md:inline-flex"
        aria-label={
          desktopSidebarMode === "collapsed"
            ? "Expand navigation"
            : "Collapse navigation"
        }
        onClick={onToggleDesktopSidebar}
      >
        <PanelLeft className="size-4" aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="md:hidden"
        aria-label="Open navigation"
        onClick={onOpenMobileSidebar}
      >
        <Menu className="size-4" aria-hidden="true" />
      </Button>
      <div className="min-w-0 flex-1 md:hidden">
        {activeTab ? (
          <WorkspaceQuickSwitcher
            candidates={candidates}
            onSelectRoute={onSelectRoute}
            trigger={
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full justify-start overflow-hidden"
                aria-label={`Current page: ${activeTab.title}`}
              >
                <span className="truncate">{activeTab.title}</span>
              </Button>
            }
          />
        ) : null}
      </div>
      <Breadcrumb className="hidden min-w-0 flex-1 md:block">
        <BreadcrumbList className="flex-nowrap overflow-hidden">
          {breadcrumb.map((item, index) => {
            const isLast = index === breadcrumb.length - 1;

            return (
              <Fragment key={item.id}>
                <BreadcrumbItem className="min-w-0 shrink">
                  {isLast ? (
                    <span
                      aria-current="page"
                      className="truncate text-foreground"
                    >
                      {item.title}
                    </span>
                  ) : (
                    <span className="truncate text-muted-foreground">
                      {item.title}
                    </span>
                  )}
                </BreadcrumbItem>
                {!isLast ? (
                  <BreadcrumbSeparator key={`${item.id}-separator`} />
                ) : null}
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Open AI assistant"
            onClick={onOpenAssistant}
          >
            <Sparkles className="size-4" aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Open AI assistant</TooltipContent>
      </Tooltip>
      <span className="hidden shrink-0 rounded-md border bg-muted/40 px-2 py-1 text-xs font-medium text-muted-foreground md:inline-flex">
        {activeTab?.ownerKey ?? "workspace"}
      </span>
    </div>
  );
}

type WorkspaceQuickSwitcherProps = {
  candidates: WorkspaceTab[];
  onSelectRoute: (route: string) => void;
  trigger?: ReactNode;
};

function WorkspaceQuickSwitcher({
  candidates,
  onSelectRoute,
  trigger,
}: WorkspaceQuickSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filteredCandidates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return candidates;
    }

    return candidates.filter((candidate) =>
      [candidate.title, ...candidate.breadcrumb.map((item) => item.title)]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [candidates, query]);

  function selectRoute(route: string) {
    onSelectRoute(route);
    setOpen(false);
    setQuery("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {isValidElement<{ onClick?: () => void }>(trigger) ? (
        cloneElement(trigger, { onClick: () => setOpen(true) })
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Open page switcher"
              onClick={() => setOpen(true)}
            >
              <Plus className="size-4" aria-hidden="true" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Open page switcher</TooltipContent>
        </Tooltip>
      )}
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Open page</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label="Search pages"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="pl-8"
              autoFocus
            />
          </div>
          <div className="max-h-80 overflow-y-auto">
            {filteredCandidates.map((candidate) => (
              <button
                key={candidate.route}
                type="button"
                aria-label={getSwitcherButtonName(candidate)}
                className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => selectRoute(candidate.route)}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-foreground">
                    {candidate.title}
                  </span>
                  <span
                    className="block truncate text-xs text-muted-foreground"
                    aria-hidden="true"
                  >
                    {candidate.breadcrumb
                      .slice(0, -1)
                      .map((item) => item.title)
                      .join(" / ")}
                  </span>
                </span>
                <span
                  className="shrink-0 text-xs text-muted-foreground"
                  aria-hidden="true"
                >
                  {candidate.ownerKey}
                </span>
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function getSwitcherButtonName(candidate: WorkspaceTab) {
  const path = candidate.breadcrumb
    .slice(0, -1)
    .map((item) => item.title)
    .join(" ");

  return [candidate.title, path].filter(Boolean).join(" ");
}
