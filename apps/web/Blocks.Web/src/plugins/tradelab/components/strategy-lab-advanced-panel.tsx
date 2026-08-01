import * as React from "react"

import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type StrategyLabAdvancedPanelProps = {
  defaultOpen?: boolean
  paperTab: React.ReactNode
  assistedTestnetTab: React.ReactNode
  assistedLiveTab: React.ReactNode
  dataOpsTab: React.ReactNode
}

export function StrategyLabAdvancedPanel({
  defaultOpen = false,
  paperTab,
  assistedTestnetTab,
  assistedLiveTab,
  dataOpsTab,
}: StrategyLabAdvancedPanelProps) {
  const [open, setOpen] = React.useState(defaultOpen)

  return (
    <section aria-label="Strategy Lab advanced tools" className="grid gap-3 rounded-xl border border-platform-border bg-platform-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-platform-muted">Advanced</p>
          <p className="mt-1 text-xs text-platform-muted">
            Secondary paper, assisted, and ops tooling stays out of the default research path until opened.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => setOpen((value) => !value)}>
          {open ? "Hide advanced tools" : "Open advanced tools"}
        </Button>
      </div>

      {open ? (
        <Tabs defaultValue="paper" className="gap-4">
          <TabsList>
            <TabsTrigger value="paper">Paper</TabsTrigger>
            <TabsTrigger value="assisted-testnet">Assisted Testnet</TabsTrigger>
            <TabsTrigger value="assisted-live">Assisted Live</TabsTrigger>
            <TabsTrigger value="data-ops">Data Ops</TabsTrigger>
          </TabsList>
          <TabsContent value="paper">{paperTab}</TabsContent>
          <TabsContent value="assisted-testnet">{assistedTestnetTab}</TabsContent>
          <TabsContent value="assisted-live">{assistedLiveTab}</TabsContent>
          <TabsContent value="data-ops">{dataOpsTab}</TabsContent>
        </Tabs>
      ) : null}
    </section>
  )
}
