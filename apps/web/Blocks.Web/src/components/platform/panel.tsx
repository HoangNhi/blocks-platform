import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

type PanelProps = {
  title: string
  meta?: string
  children: ReactNode
  className?: string
}

export function Panel({ title, meta, children, className }: PanelProps) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-lg border border-platform-border bg-platform-surface",
        className,
      )}
    >
      <header className="flex min-h-13 items-center justify-between border-b border-platform-border px-4">
        <h2 className="text-sm font-semibold text-platform-ink">{title}</h2>
        {meta ? (
          <span className="text-xs font-medium text-platform-muted">{meta}</span>
        ) : null}
      </header>
      {children}
    </section>
  )
}
