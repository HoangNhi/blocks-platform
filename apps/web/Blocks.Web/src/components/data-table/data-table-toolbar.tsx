import type { ReactNode } from "react"
import { Filter, Search } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type DataTableToolbarProps = {
  searchValue?: string
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  searchAriaLabel?: string
  filterOpen?: boolean
  onFilterOpenChange?: (open: boolean) => void
  activeFilterCount?: number
  filterContent?: ReactNode
  actions?: ReactNode
  className?: string
}

export function DataTableToolbar({
  searchValue,
  onSearchChange,
  searchPlaceholder = "Tìm kiếm...",
  searchAriaLabel = "Tìm kiếm",
  filterOpen = false,
  onFilterOpenChange,
  activeFilterCount = 0,
  filterContent,
  actions,
  className,
}: DataTableToolbarProps) {
  const hasSearch = searchValue !== undefined && onSearchChange
  const hasFilters = filterContent !== undefined

  return (
    <div className={cn("shrink-0 border-b p-4", className)}>
      <Collapsible open={filterOpen} onOpenChange={onFilterOpenChange}>
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-1 gap-2">
            {hasSearch ? (
              <div className="relative min-w-0 flex-1 xl:max-w-[460px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  type="search"
                  className="h-10 pl-9"
                  value={searchValue}
                  placeholder={searchPlaceholder}
                  aria-label={searchAriaLabel}
                  onChange={(event) => onSearchChange(event.target.value)}
                />
              </div>
            ) : null}
            {hasFilters ? (
              <CollapsibleTrigger asChild>
                <Button type="button" variant={filterOpen ? "secondary" : "outline"} className="gap-2">
                  <Filter className="size-4" aria-hidden="true" />
                  Bộ lọc
                  {activeFilterCount > 0 ? <Badge variant="secondary" className="h-5 min-w-5 px-1.5">{activeFilterCount}</Badge> : null}
                </Button>
              </CollapsibleTrigger>
            ) : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
        {hasFilters ? <CollapsibleContent className="mt-3">{filterContent}</CollapsibleContent> : null}
      </Collapsible>
    </div>
  )
}

export type { DataTableToolbarProps }
