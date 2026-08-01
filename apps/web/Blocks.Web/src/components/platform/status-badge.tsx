import { cn } from "@/lib/utils"

export type StatusBadgeTone = "success" | "warning" | "danger" | "info" | "neutral"

const toneClassName: Record<StatusBadgeTone, string> = {
  success: "bg-green-50 text-green-700 ring-green-200",
  warning: "bg-amber-50 text-amber-700 ring-amber-200",
  danger: "bg-rose-50 text-rose-700 ring-rose-200",
  info: "bg-blue-50 text-blue-700 ring-blue-200",
  neutral: "bg-slate-50 text-slate-600 ring-slate-200",
}

type StatusBadgeProps = {
  children: string
  tone?: StatusBadgeTone
  className?: string
}

export function StatusBadge({
  children,
  tone = "neutral",
  className,
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full px-2 py-1 text-xs font-semibold ring-1",
        toneClassName[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}
