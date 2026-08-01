import { type ButtonHTMLAttributes, forwardRef } from "react"

import { cn } from "@/lib/utils"

import { iconFor } from "./icon-for"
import {
  displayText,
  stateLabel,
  type TruthState,
} from "../truth"
import type { BlockSnapshot } from "../snapshot"

const toneChipClass: Record<TruthState, string> = {
  ok: "bg-green-50 text-green-700 ring-green-200",
  stale: "bg-amber-50 text-amber-700 ring-amber-200",
  unknown: "bg-slate-50 text-slate-600 ring-slate-200",
  not_reported: "bg-slate-50 text-slate-600 ring-slate-200",
  no_recent_data: "bg-slate-50 text-slate-600 ring-slate-200",
}

type SystemBlockProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> & {
  block: BlockSnapshot
  selected: boolean
  dimmed: boolean
}

export const SystemBlock = forwardRef<HTMLButtonElement, SystemBlockProps>(
  function SystemBlock({ block, selected, dimmed, className, ...rest }, ref) {
    const Icon = iconFor(block.iconName)
    const stateText = displayText(block.primary)

    const isCore = block.key === "core"
    const isMemoryOrSessions = block.key === "memory" || block.key === "sessions"

    return (
      <button
        ref={ref}
        type="button"
        role="button"
        aria-pressed={selected}
        aria-label={`${block.label} ${stateLabel(block.status)}`}
        data-block-key={block.key}
        data-selected={selected ? "true" : "false"}
        data-dimmed={dimmed ? "true" : "false"}
        tabIndex={0}
        className={cn(
          // White cards, thin pale borders, 15-18px radii, soft shadows
          "group relative flex h-full w-full min-w-0 flex-col items-start gap-1 rounded-2xl border bg-white p-4 text-left transition-all duration-150",
          "border-slate-100/90 shadow-[0_2px_8px_rgba(0,0,0,0.03),0_1px_2px_rgba(0,0,0,0.02)]",
          "hover:-translate-y-0.5 hover:border-slate-200 hover:shadow-[0_8px_20px_rgba(0,0,0,0.05),0_2px_4px_rgba(0,0,0,0.02)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-platform-primary/30",
          "motion-reduce:transition-none motion-reduce:hover:translate-y-0",

          // Core lavender frame & strongest restrained depth
          isCore && "border-purple-200 bg-purple-50/10 shadow-[0_6px_16px_rgba(124,58,237,0.06),0_1px_3px_rgba(124,58,237,0.03)]",

          // Memory or Sessions specific styling (teal accent)
          isMemoryOrSessions && "border-teal-200 bg-teal-50/5 hover:border-teal-300",

          // Selected block styling
          selected && cn(
            "-translate-y-0.5 shadow-md",
            isCore && "border-purple-500 ring-2 ring-purple-500/20",
            isMemoryOrSessions && "border-teal-500 ring-2 ring-teal-500/20",
            !isCore && !isMemoryOrSessions && "border-platform-primary ring-2 ring-platform-primary/20"
          ),

          // Dimming other blocks when one is selected
          dimmed && "opacity-80 saturate-[70%]",
          className,
        )}
        {...rest}
      >
        <div className="flex w-full items-start justify-between gap-2 mb-1">
          <span className={cn(
            "grid size-6 place-items-center rounded-full text-white",
            block.key === "surfaces" && "bg-blue-500",
            block.key === "tools" && "bg-purple-500",
            block.key === "core" && "bg-purple-600",
            block.key === "provider" && "bg-green-500",
            block.key === "cron" && "bg-orange-500",
            block.key === "memory" && "bg-teal-500",
            block.key === "sessions" && "bg-purple-500",
          )}>
            <Icon className="size-3.5" aria-hidden="true" />
          </span>
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide ring-1",
              toneChipClass[block.status],
            )}
          >
            {stateLabel(block.status)}
          </span>
        </div>
        <strong className={cn(
          "whitespace-normal break-words leading-tight font-semibold text-platform-ink",
          isCore ? "text-base" : "text-sm"
        )}>
          {block.label}
        </strong>
        <p className="line-clamp-2 w-full text-xs leading-relaxed text-platform-muted font-normal">
          {block.description}
        </p>

        {/* Primary value/semantic state at bottom */}
        <div className="mt-auto pt-2 flex items-center justify-between w-full">
          <span className="text-[11px] font-medium text-platform-ink">
            {stateText}
          </span>
        </div>

        <span className="sr-only">Click to inspect</span>
      </button>
    )
  },
)
