import { CurrentStateRail } from "./components/current-state-rail"
import { OverviewHeader } from "./components/overview-header"
import { RoutingFlowStrip } from "./components/recent-activity-strip"
import { SystemMap } from "./components/system-map"
import { getOverviewSnapshot } from "./overview-data-source"

export function HermesOverviewPage() {
  const snapshot = getOverviewSnapshot()

  return (
    <div className="grid gap-4" data-testid="hermes-overview-page">
      <OverviewHeader />
      <SystemMap blocks={snapshot.blocks} />
      <CurrentStateRail rail={snapshot.rail} />
      <RoutingFlowStrip />
    </div>
  )
}
