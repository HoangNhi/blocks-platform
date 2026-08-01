import { useEffect, useState } from "react"
import { ExternalLink } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

import { iconFor } from "./icon-for"
import { displayText } from "../truth"
import type { BlockSnapshot } from "../snapshot"

export type InspectionPanelProps = {
  block: BlockSnapshot | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

function getAvailabilityLabel() {
  return "Documented"
}

function useIsMobileDrawer() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window === "undefined" || !window.matchMedia
      ? false
      : window.matchMedia("(max-width: 767px)").matches,
  )

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return
    const media = window.matchMedia("(max-width: 767px)")
    const update = () => setIsMobile(media.matches)

    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  return isMobile;
}

export function ComponentInspectionPanel({
  block,
  open,
  onOpenChange,
}: InspectionPanelProps) {
  const isMobile = useIsMobileDrawer()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className="flex w-full flex-col gap-0 p-0 sm:max-w-[360px] max-w-full h-[75dvh] md:h-full overflow-x-hidden"
        data-testid="inspection-panel"
      >
        {block ? (
          <SheetHeader className="border-b border-platform-border px-5 py-4">
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-lg bg-platform-primary/8 text-platform-primary">
                {(() => {
                  const Icon = iconFor(block.iconName)
                  return <Icon className="size-4" aria-hidden="true" />
                })()}
              </span>
              <div className="min-w-0 pr-6">
                <SheetTitle
                  className="text-base break-words whitespace-normal"
                  data-testid="inspection-title"
                >
                  {block.label}
                </SheetTitle>
                <SheetDescription
                  className="text-xs break-words whitespace-normal"
                  data-testid="inspection-description"
                >
                  {block.description}
                </SheetDescription>
              </div>
            </div>
          </SheetHeader>
        ) : null}
        <div className="flex-1 overflow-auto p-5">
          {block ? (
            <div className="flex flex-col gap-5">
              <section
                aria-label="Capability role and availability"
                data-testid="inspection-primary"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-platform-muted">
                  Role
                </p>
                <p className="mt-1 text-2xl font-semibold text-platform-ink">
                  {displayText(block.primary)}
                </p>
                <p className="mt-2.5 text-xs font-medium uppercase tracking-wide text-platform-muted">
                  Availability
                </p>
                <p className="mt-1 text-sm font-medium text-platform-ink">
                  {getAvailabilityLabel()}
                </p>
              </section>
              {block.explanation && block.explanation.length > 0 ? (
                <section
                  aria-label="How Hermes uses it"
                  className="flex flex-col gap-3"
                  data-testid="inspection-explanation"
                >
                  <Separator />
                  <p className="text-xs font-medium uppercase tracking-wide text-platform-muted">
                    How Hermes uses it
                  </p>
                  <div className="flex flex-col gap-2.5 text-xs text-platform-muted leading-relaxed">
                    {block.explanation.map((paragraph, index) => (
                      <p key={index}>{paragraph}</p>
                    ))}
                  </div>
                </section>
              ) : null}
              <section
                aria-label="Actions"
                className="flex flex-col gap-2"
              >
                <Separator />
                {block.navigation && block.navigation.length > 0 ? (
                  block.navigation.map((action) => (
                    <Button
                      key={action.label}
                      variant="outline"
                      size="sm"
                      className="justify-between"
                      disabled={!action.available}
                      asChild={Boolean(action.available && action.href)}
                    >
                      {action.available && action.href ? (
                        <a href={action.href}>
                          <span>{action.label}</span>
                          <ExternalLink
                            className="size-3"
                            aria-hidden="true"
                          />
                        </a>
                      ) : (
                        <span>{action.label}</span>
                      )}
                    </Button>
                  ))
                ) : (
                  <p className="text-xs text-platform-muted">
                    No actions available for this block yet.
                  </p>
                )}
              </section>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
