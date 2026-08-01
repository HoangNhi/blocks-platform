export function OverviewHeader() {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight text-platform-ink">
            Hermes Overview
          </h1>
          <span
            className="inline-flex items-center rounded-full bg-platform-primary/8 px-2.5 py-0.5 text-xs font-medium text-platform-primary ring-1 ring-platform-primary/20"
            data-testid="header-badge"
          >
            Capability architecture
          </span>
        </div>
        <p className="max-w-2xl text-sm leading-5 text-platform-muted">
          How Hermes routes context, models, tools, and knowledge
        </p>
      </div>
    </header>
  )
}
