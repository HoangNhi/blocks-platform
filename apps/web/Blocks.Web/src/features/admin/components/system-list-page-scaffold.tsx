import type { ReactNode } from "react"
import { RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

type SystemListPageScaffoldProps = {
  filterContent: ReactNode
  tableContent: ReactNode
  actions?: ReactNode
  onResetFilters: () => void
  filterTitle?: string
  children?: ReactNode
}

export function SystemListPageScaffold({
  filterContent,
  tableContent,
  actions,
  onResetFilters,
  filterTitle = "Bộ lọc danh sách",
  children,
}: SystemListPageScaffoldProps) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <Card className="shrink-0 border-platform-border bg-platform-surface-muted/40 shadow-sm">
        <CardContent className="grid gap-4 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <h2 className="text-sm font-semibold text-platform-ink">{filterTitle}</h2>
            <Button variant="ghost" size="sm" onClick={onResetFilters}>
              <RotateCcw className="size-4" aria-hidden="true" />
              Đặt lại bộ lọc
            </Button>
          </div>
          {filterContent}
        </CardContent>
      </Card>

      {actions ? (
        <div className="shrink-0 flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}

      <div data-slot="system-list-page-table" className="min-h-0 flex-1 overflow-hidden">
        {tableContent}
      </div>

      {children}
    </div>
  )
}
