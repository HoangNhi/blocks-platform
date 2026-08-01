import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export type StatTone = "primary" | "success" | "info" | "warning" | "danger" | "plugin"

const toneClassName: Record<StatTone, string> = {
  primary: "text-platform-primary bg-blue-50",
  success: "text-platform-success bg-green-50",
  info: "text-platform-info bg-cyan-50",
  warning: "text-platform-warning bg-amber-50",
  danger: "text-platform-danger bg-rose-50",
  plugin: "text-platform-plugin bg-violet-50",
}

type StatCardProps = {
  label: string
  value: string
  helper: string
  icon: LucideIcon
  tone: StatTone
}

export function StatCard({
  label,
  value,
  helper,
  icon: Icon,
  tone,
}: StatCardProps) {
  return (
    <article className="min-h-31 rounded-lg border border-platform-border bg-platform-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold text-platform-muted">{label}</p>
        <span
          className={cn(
            "grid size-9 place-items-center rounded-lg",
            toneClassName[tone],
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </span>
      </div>
      <strong
        className={cn(
          "mt-3 block text-3xl font-bold",
          toneClassName[tone].split(" ")[0],
        )}
      >
        {value}
      </strong>
      <p className="mt-2 text-xs leading-5 text-platform-muted">{helper}</p>
    </article>
  )
}
