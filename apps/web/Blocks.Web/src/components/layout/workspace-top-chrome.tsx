import { Menu, PanelLeft, Plus, Search, Sparkles, X } from "lucide-react"
import { useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import type { WorkspaceTab } from "@/features/navigation/workspace-tabs"
import type { SidebarLayoutMode } from "@/features/navigation/sidebar-layout-state"
import { cn } from "@/lib/utils"

type WorkspaceTopChromeProps = {
  tabs: WorkspaceTab[]
  candidates: WorkspaceTab[]
  activeRoute: string
  desktopSidebarMode: SidebarLayoutMode
  assistantOpen: boolean
  onSelectRoute: (route: string) => void
  onCloseRoute: (route: string) => void
  onOpenMobileSidebar: () => void
  onToggleDesktopSidebar: () => void
  onOpenAssistant: () => void
}

export function WorkspaceTopChrome({
  tabs,
  candidates,
  activeRoute,
  desktopSidebarMode,
  assistantOpen,
  onSelectRoute,
  onCloseRoute,
  onOpenMobileSidebar,
  onToggleDesktopSidebar,
  onOpenAssistant,
}: WorkspaceTopChromeProps) {
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  function focusTab(route: string) {
    tabRefs.current[route]?.focus()
  }

  function handleTabKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    if (event.key === "Delete") {
      event.preventDefault()
      onCloseRoute(tabs[index].route)
      return
    }

    const nextIndex =
      event.key === "ArrowRight"
        ? Math.min(index + 1, tabs.length - 1)
        : event.key === "ArrowLeft"
          ? Math.max(index - 1, 0)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabs.length - 1
              : -1

    if (nextIndex >= 0 && nextIndex !== index) {
      event.preventDefault()
      focusTab(tabs[nextIndex].route)
    }
  }

  return (
    <TooltipProvider delayDuration={250}>
      <header
        role="banner"
        aria-label="Workspace header"
        className="sticky top-0 z-30 flex h-11 min-h-11 w-full min-w-0 flex-nowrap items-center gap-1 border-b border-platform-border bg-background/95 px-1.5 backdrop-blur supports-[backdrop-filter]:bg-background/85"
      >
        <Tooltip>
          <TooltipTrigger asChild>
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
          </TooltipTrigger>
          <TooltipContent>
            {desktopSidebarMode === "collapsed"
              ? "Expand navigation"
              : "Collapse navigation"}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
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
          </TooltipTrigger>
          <TooltipContent>Open navigation</TooltipContent>
        </Tooltip>

        <div
          data-testid="workspace-tab-rail"
          className="relative min-w-0 flex-1 overflow-x-auto whitespace-nowrap scrollbar-none"
        >
          <div
            role="tablist"
            aria-label="Open workspace pages"
            className="flex min-w-max items-center gap-0.5 pr-2"
          >
            {tabs.map((tab, index) => {
              const isActive = tab.route === activeRoute

              return (
                <div
                  key={tab.route}
                  data-state={isActive ? "active" : "inactive"}
                  className={cn(
                    "group relative flex h-8 min-w-[88px] max-w-[168px] shrink-0 items-center rounded-md transition-colors [@media(pointer:coarse)]:min-w-[102px]",
                    isActive
                      ? "bg-muted/70 text-foreground after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary/70"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                >
                  <button
                    ref={(element) => {
                      tabRefs.current[tab.route] = element
                    }}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    tabIndex={isActive ? 0 : -1}
                    className="flex h-full min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 text-left text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                    onClick={() => onSelectRoute(tab.route)}
                    onKeyDown={(event) => handleTabKeyDown(event, index)}
                    title={tab.title}
                  >
                    {tab.isDirty ? (
                      <span
                        role="img"
                        aria-label={`Unsaved changes for ${tab.title}`}
                        className="size-1.5 shrink-0 rounded-full bg-amber-500"
                      />
                    ) : null}
                    <span className="truncate">{tab.title}</span>
                  </button>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Close ${tab.title} tab`}
                        className="mr-1 inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 outline-none transition-opacity hover:bg-background/70 hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring/60 group-hover:opacity-100 group-focus-within:opacity-100 [@media(pointer:coarse)]:opacity-100"
                        onClick={(event) => {
                          event.stopPropagation()
                          onCloseRoute(tab.route)
                        }}
                      >
                        <X className="size-3.5" aria-hidden="true" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>Close {tab.title} tab</TooltipContent>
                  </Tooltip>
                </div>
              )
            })}
          </div>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-3 bg-gradient-to-r from-background/80 to-transparent"
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-4 bg-gradient-to-l from-background/90 to-transparent"
          />
        </div>

        <WorkspaceQuickSwitcher
          candidates={candidates}
          openRoutes={new Set(tabs.map((tab) => tab.route))}
          onSelectRoute={onSelectRoute}
        />

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="Open AI assistant"
              aria-expanded={assistantOpen}
              onClick={onOpenAssistant}
              className={cn(
                "gap-1.5 px-2",
                assistantOpen && "bg-muted text-foreground",
              )}
            >
              <Sparkles className="size-4" aria-hidden="true" />
              <span className="hidden md:inline">AI</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Open AI assistant</TooltipContent>
        </Tooltip>
      </header>
    </TooltipProvider>
  )
}

type WorkspaceQuickSwitcherProps = {
  candidates: WorkspaceTab[]
  openRoutes: Set<string>
  onSelectRoute: (route: string) => void
}

function WorkspaceQuickSwitcher({
  candidates,
  openRoutes,
  onSelectRoute,
}: WorkspaceQuickSwitcherProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const filteredCandidates = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()

    if (!normalizedQuery) {
      return candidates
    }

    return candidates.filter((candidate) =>
      `${candidate.title} ${candidate.route}`.toLowerCase().includes(normalizedQuery),
    )
  }, [candidates, query])

  function closePicker() {
    setOpen(false)
    setQuery("")
  }

  function selectRoute(route: string) {
    onSelectRoute(route)
    closePicker()
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen)
        if (!nextOpen) {
          setQuery("")
        }
      }}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Open new page"
            onClick={() => setOpen(true)}
          >
            <Plus className="size-4" aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Open new page</TooltipContent>
      </Tooltip>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Open page</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 p-4">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              aria-label="Search pages"
              placeholder="Search pages..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="pl-8"
              autoFocus
            />
          </div>
          <div className="max-h-80 overflow-y-auto">
            {filteredCandidates.length > 0 ? (
              filteredCandidates.map((candidate) => {
                const isOpen = openRoutes.has(candidate.route)

                return (
                  <button
                    key={candidate.route}
                    type="button"
                    aria-label={`${candidate.title}${isOpen ? " (open)" : ""}`}
                    className="flex min-h-10 w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60"
                    onClick={() => selectRoute(candidate.route)}
                  >
                    <span className="min-w-0 truncate font-medium text-foreground">
                      {candidate.title}
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {isOpen ? "Open" : candidate.route}
                    </span>
                  </button>
                )
              })
            ) : (
              <p className="px-3 py-2 text-sm text-muted-foreground">No pages found.</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
