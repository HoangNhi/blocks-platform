import { useCallback, useEffect, useRef, useState } from "react"

import { ComponentInspectionPanel } from "./component-inspection-panel"
import { ConnectionLayer } from "./connection-layer"
import { SystemBlock } from "./system-block"
import type { BlockKey, BlockSnapshot } from "../snapshot"

const CORE_KEY: BlockKey = "core"

const visibleKeys: BlockKey[] = [
  "core",
  "provider",
  "surfaces",
  "cron",
  "tools",
  "memory",
  "sessions",
]

// Bounded desktop layout contract with standard 3x3 grid & integrated split region inside Memory
const gridTemplate = {
  gridTemplateAreas: `
    "surfaces core provider"
    "tools core cron"
    "memory memory memory"
  `,
  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.3fr) minmax(0, 1fr)",
  gridTemplateRows: "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)",
  gap: "12px",
  height: "clamp(396px, 31vw, 440px)",
}

const areaForKey: Record<BlockKey, string> = {
  surfaces: "surfaces",
  core: "core",
  provider: "provider",
  tools: "tools",
  cron: "cron",
  memory: "memory",
  sessions: "memory",
}

type SystemMapProps = {
  blocks: Record<BlockKey, BlockSnapshot>
}

export function SystemMap({ blocks }: SystemMapProps) {
  const [selected, setSelected] = useState<BlockKey | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  const open = selected !== null

  const onSelect = useCallback((key: BlockKey) => {
    setSelected((current) => (current === key ? null : key))
  }, [])

  const onOpenChange = useCallback((next: boolean) => {
    if (!next) setSelected(null)
  }, [])

  useEffect(() => {
    if (open) {
      previousFocusRef.current =
        (document.activeElement as HTMLElement | null) ?? null
    } else if (previousFocusRef.current) {
      previousFocusRef.current.focus()
    }
  }, [open])

  // Escape closes the inspection panel.
  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault()
        setSelected(null)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])

  const onOutsideMouseDown = useCallback(
    (event: MouseEvent | TouchEvent) => {
      if (!open) return
      const root = containerRef.current
      if (!root) return
      const target = event.target as Node | null
      if (!target) return
      if (root.contains(target)) {
        // Allow clicks inside the map: SystemBlock click handler decides.
        return
      }
      const panel = document.querySelector(
        '[data-testid="inspection-panel"]',
      )
      if (panel && panel.contains(target)) return
      setSelected(null)
    },
    [open],
  )

  useEffect(() => {
    if (!open) return
    document.addEventListener("mousedown", onOutsideMouseDown)
    document.addEventListener("touchstart", onOutsideMouseDown)
    return () => {
      document.removeEventListener("mousedown", onOutsideMouseDown)
      document.removeEventListener("touchstart", onOutsideMouseDown)
    }
  }, [open, onOutsideMouseDown])

  return (
    <>
      {/* Desktop / tablet map */}
      <section
        ref={containerRef}
        aria-label="Hermes system map"
        className="relative hidden rounded-lg border border-platform-border bg-platform-surface py-2.5 px-3 md:grid"
        style={gridTemplate}
        data-testid="system-map"
      >
        <ConnectionLayer />
        {visibleKeys.map((key) => {
          const block = blocks[key]
          const isSelected = selected === key
          const isDimmed =
            selected !== null &&
            isSelected === false &&
            (selected === CORE_KEY
              ? key !== "sessions"
              : key !== selected)

          const isSessions = key === "sessions"
          const isMemory = key === "memory"

          if (isMemory || isSessions) return null

          return (
            <div
              key={key}
              className="relative z-10 flex w-full h-full min-h-0"
              style={{
                gridArea: areaForKey[key],
              }}
            >
              <div className="w-full h-full min-h-0">
                <SystemBlock
                  block={block}
                  selected={isSelected}
                  dimmed={isDimmed}
                  onClick={() => onSelect(key)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      onSelect(key)
                    }
                  }}
                  className="py-2 px-3 min-h-0"
                  data-testid={`block-${key}`}
                />
              </div>
            </div>
          )
        })}

        {/* Memory and Sessions split row at the bottom - non-overlapping grid wrappers */}
        <div
          className="relative z-10 flex w-full h-full min-h-0 gap-4"
          style={{ gridArea: "memory" }}
        >
          <div className="w-1/2 h-full min-h-0">
            <SystemBlock
              block={blocks.memory}
              selected={selected === "memory"}
              dimmed={selected !== null && selected !== "memory" && (selected === CORE_KEY ? false : true)}
              onClick={() => onSelect("memory")}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  onSelect("memory")
                }
              }}
              className="py-2 px-3 min-h-0"
              data-testid="block-memory"
            />
          </div>
          <div className="w-1/2 h-full min-h-0">
            <SystemBlock
              block={blocks.sessions}
              selected={selected === "sessions"}
              dimmed={selected !== null && selected !== "sessions" && (selected === CORE_KEY ? false : true)}
              onClick={() => onSelect("sessions")}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  onSelect("sessions")
                }
              }}
              className="py-2 px-3 min-h-0"
              data-testid="block-sessions"
            />
          </div>
        </div>
      </section>

      {/* Mobile stack */}
      <section
        aria-label="Hermes system blocks"
        className="flex flex-col gap-2 md:hidden"
        data-testid="system-map-mobile"
      >
        {visibleKeys.map((key) => {
          const block = blocks[key]
          const isSelected = selected === key
          return (
            <SystemBlock
              key={key}
              block={block}
              selected={isSelected}
              dimmed={false}
              onClick={() => onSelect(key)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  onSelect(key)
                }
              }}
              data-testid={`block-${key}-mobile`}
            />
          )
        })}
      </section>

      <ComponentInspectionPanel
        block={selected ? blocks[selected] : null}
        open={open}
        onOpenChange={onOpenChange}
      />
    </>
  )
}
