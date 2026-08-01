import { ArrowRight } from "lucide-react"

export function RoutingFlowStrip() {
  const steps = [
    { label: "Surfaces", desc: "Interaction channels" },
    { label: "Core", desc: "Orchestrator" },
    { label: "Provider / Tools", desc: "Model routing & capabilities" },
    { label: "Memory / Sessions", desc: "Durable context & history" },
  ]

  return (
    <section
      aria-label="Hermes routing flow"
      className="rounded-lg border border-platform-border bg-platform-surface p-4"
      data-testid="routing-flow-strip"
    >
      <div className="flex items-center justify-between mb-3 text-xs font-medium uppercase tracking-wide">
        <p className="text-platform-muted">
          Context routing flow
        </p>
        <div
          data-testid="activity-empty-state"
          className="flex items-center gap-1.5 normal-case tracking-normal text-platform-muted font-normal"
          aria-label="Recent activity status"
        >
          <span className="font-semibold text-platform-ink">Recent activity:</span>
          <span>No recent data</span>
        </div>
      </div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {steps.map((step, index) => (
          <div key={step.label} className="flex flex-1 items-center justify-between sm:justify-start sm:gap-6">
            <div className="flex flex-col">
              <strong className="text-sm font-semibold text-platform-ink">
                {step.label}
              </strong>
              <span className="text-xs text-platform-muted">{step.desc}</span>
            </div>
            {index < steps.length - 1 && (
              <ArrowRight className="hidden size-4 text-platform-muted sm:block" aria-hidden="true" />
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
