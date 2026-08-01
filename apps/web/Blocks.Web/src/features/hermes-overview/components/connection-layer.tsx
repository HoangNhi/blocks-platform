import { useEffect, useState } from "react"

import { cn } from "@/lib/utils"

// Curved connectors matching specific endpoint colors. Solid lines, no animation.
type Path = {
  d: string
  key: string
  color: string
  x1: number
  y1: number
  x2: number
  y2: number
}

export function ConnectionLayer({ className }: { className?: string }) {
  const [paths, setPaths] = useState<Path[]>([])
  const [coreCenter, setCoreCenter] = useState<{ x: number; y: number } | null>(null)

  useEffect(() => {
    function recompute() {
      const next: Path[] = []
      const colors: Record<string, string> = {
        surfaces: "#3b82f6", // Blue
        tools: "#a855f7",    // Purple
        provider: "#22c55e", // Green
        cron: "#f97316",     // Orange
        memory: "#14b8a6",   // Teal
      }

      const core = document.querySelector<HTMLElement>(
        '[data-block-key="core"]',
      )
      const layer = document.querySelector<HTMLElement>(
        '[data-connection-layer="true"]',
      )

      if (core && layer) {
        const a = core.getBoundingClientRect()
        const l = layer.getBoundingClientRect()
        if (a.width > 0 && l.width > 0) {
          setCoreCenter({
            x: a.left + a.width / 2 - l.left,
            y: a.top + a.height / 2 - l.top,
          })
        }
      }

      for (const childKey of ["provider", "surfaces", "cron", "tools", "memory"] as const) {
        const target = document.querySelector<HTMLElement>(
          `[data-block-key="${childKey}"]`,
        )
        if (!core || !target || !layer) continue
        const a = core.getBoundingClientRect()
        const b = target.getBoundingClientRect()
        const l = layer.getBoundingClientRect()
        if (a.width === 0 || b.width === 0 || l.width === 0) continue

        // Start/End coordinates relative to layer
        const x1_raw = a.left + a.width / 2 - l.left
        const y1_raw = a.top + a.height / 2 - l.top
        const x2_raw = b.left + b.width / 2 - l.left
        const y2_raw = b.top + b.height / 2 - l.top

        // Bounded shift offsets to make endpoints connect nicely at the border edges (ports)
        const dx = x2_raw - x1_raw
        const dy = y2_raw - y1_raw
        const dist = Math.sqrt(dx * dx + dy * dy)
        const offsetCore = 60 // core border distance approx
        const offsetTarget = 40 // target border distance approx

        const x1 = x1_raw + (dx / dist) * offsetCore
        const y1 = y1_raw + (dy / dist) * offsetCore
        const x2 = x2_raw - (dx / dist) * offsetTarget
        const y2 = y2_raw - (dy / dist) * offsetTarget

        const mx = (x1 + x2) / 2
        const my = (y1 + y2) / 2

        // Dynamic curvature offset (non-crossing curve pathways)
        let cx = mx
        let cy = my
        if (childKey === "surfaces" || childKey === "provider") {
          cy = my - 15
        } else if (childKey === "tools" || childKey === "cron") {
          cy = my + 15
        } else if (childKey === "memory") {
          cx = mx - 20
        }

        next.push({
          key: `connect-${childKey}`,
          d: `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`,
          color: colors[childKey],
          x1,
          y1,
          x2,
          y2,
        })
      }
      setPaths(next)
    }
    recompute()
    window.addEventListener("resize", recompute)
    const interval = window.setInterval(recompute, 250)
    return () => {
      window.removeEventListener("resize", recompute)
      window.clearInterval(interval)
    }
  }, [])

  return (
    <div className="absolute inset-0 pointer-events-none w-full h-full">
      {/* Faint dotted rings aligned relative to actual Core rect layout */}
      {coreCenter && (
        <>
          <div
            className="absolute rounded-full border border-purple-200 border-dashed opacity-40 -translate-x-[50%] -translate-y-[50%]"
            style={{
              left: `${coreCenter.x}px`,
              top: `${coreCenter.y}px`,
              width: "180px",
              height: "180px",
            }}
          />
          <div
            className="absolute rounded-full border border-purple-100 border-dashed opacity-30 -translate-x-[50%] -translate-y-[50%]"
            style={{
              left: `${coreCenter.x}px`,
              top: `${coreCenter.y}px`,
              width: "240px",
              height: "240px",
            }}
          />
        </>
      )}

      <svg
        aria-hidden="true"
        data-connection-layer="true"
        className={cn(
          "absolute inset-0 h-full w-full",
          className,
        )}
      >
        {paths.map((path) => (
          <g key={path.key}>
            {/* Solid connector lines, visible under prefers-reduced-motion */}
            <path
              d={path.d}
              fill="none"
              stroke={path.color}
              strokeWidth={1.5}
              className="opacity-45"
            />
            {/* White-fill colored-stroke endpoint circles */}
            <circle cx={path.x1} cy={path.y1} r={4} fill="#ffffff" stroke="#a855f7" strokeWidth={1.5} className="opacity-95" />
            <circle cx={path.x2} cy={path.y2} r={4} fill="#ffffff" stroke={path.color} strokeWidth={1.5} className="opacity-95" />
          </g>
        ))}
      </svg>
    </div>
  )
}
