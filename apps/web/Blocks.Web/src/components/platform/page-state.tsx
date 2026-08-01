import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export type PageStateTone = "neutral" | "danger" | "warning"

const toneClassName: Record<PageStateTone, string> = {
  neutral: "bg-slate-50 text-slate-600",
  danger: "bg-rose-50 text-rose-700",
  warning: "bg-amber-50 text-amber-700",
}

type PageStateProps = {
  icon: LucideIcon
  title: string
  description: string
  tone?: PageStateTone
  className?: string
}

export function PageState({
  icon: Icon,
  title,
  description,
  tone = "neutral",
  className,
}: PageStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-56 flex-col items-center justify-center rounded-lg border border-platform-border bg-platform-surface p-8 text-center",
        className,
      )}
    >
      <span
        className={cn(
          "mb-3 grid size-11 place-items-center rounded-lg",
          toneClassName[tone],
        )}
      >
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <h2 className="text-base font-semibold text-platform-ink">{title}</h2>
      <p className="mt-2 max-w-sm text-sm leading-6 text-platform-muted">
        {description}
      </p>
    </div>
  )
}
