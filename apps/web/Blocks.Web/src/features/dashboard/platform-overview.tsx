import { Link } from "react-router"

import { Panel } from "@/components/platform/panel"
import { StatCard } from "@/components/platform/stat-card"
import { StatusBadge } from "@/components/platform/status-badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import {
  adminAttentionRows,
  adminQuickActions,
  platformHealthRows,
  platformStats,
  recentPlatformActivity,
} from "./platform-overview-data"

const toneClassName = {
  primary: "bg-platform-primary",
  info: "bg-platform-info",
  plugin: "bg-platform-plugin",
  warning: "bg-platform-warning",
  success: "bg-platform-success",
}

export function PlatformOverview() {
  return (
    <div className="grid gap-5">
      <section className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-platform-ink">
            Platform is healthy
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-platform-muted">
            Admin summary for services, access, storage, plugins, and
            operational risk.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/plugins/installed">Plugin readiness</Link>
          </Button>
          <Button asChild>
            <Link to="/overview/service-health">Review Alerts</Link>
          </Button>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {platformStats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.05fr_0.95fr]">
        <Panel title="Platform health" meta="Core services and runtime readiness">
          <div className="grid gap-3 p-4">
            {platformHealthRows.map((row) => (
              <div
                className="grid grid-cols-[2.25rem_1fr_auto] items-center gap-3 rounded-lg border border-platform-border p-3"
                key={row.id}
              >
                <span
                  className={cn(
                    "grid size-9 place-items-center rounded-lg text-xs font-bold text-white",
                    toneClassName[row.tone],
                  )}
                >
                  {row.badge}
                </span>
                <div className="min-w-0">
                  <strong className="block truncate text-sm text-platform-ink">
                    {row.label}
                  </strong>
                  <span className="block truncate text-xs text-platform-muted">
                    {row.description}
                  </span>
                </div>
                <StatusBadge tone={row.statusTone}>{row.status}</StatusBadge>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Admin attention" meta="Things worth checking first">
          <div className="grid gap-3 p-4">
            {adminAttentionRows.map((row) => (
              <div
                className="rounded-lg border border-platform-border p-3"
                key={row.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <strong className="block text-sm text-platform-ink">
                      {row.label}
                    </strong>
                    <span className="mt-1 block text-xs text-platform-muted">
                      {row.description}
                    </span>
                  </div>
                  <StatusBadge tone={row.tone === "warning" ? "warning" : "info"}>
                    {row.value}
                  </StatusBadge>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                  <span
                    className={cn("block h-full rounded-full", toneClassName[row.tone])}
                    style={{ width: `${row.progress}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </section>

      <Panel title="Admin quick actions" meta="Direct jumps for platform operators">
        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
          {adminQuickActions.map((action) => (
            <Link
              className="rounded-lg border border-platform-border bg-platform-surface-muted p-3 transition hover:border-blue-200 hover:bg-blue-50"
              key={action.title}
              to={action.route}
            >
              <action.icon className="size-4 text-platform-primary" />
              <strong className="mt-3 block text-sm text-platform-ink">
                {action.title}
              </strong>
              <span className="mt-1 block text-xs leading-5 text-platform-muted">
                {action.description}
              </span>
            </Link>
          ))}
        </div>
      </Panel>

      <Panel title="Recent platform activity" meta="Audit-friendly timeline">
        <div className="divide-y divide-platform-border px-4">
          {recentPlatformActivity.map((item) => (
            <div
              className="grid min-h-12 grid-cols-[1.75rem_1fr_4.75rem] items-center gap-3 py-3"
              key={item.id}
            >
              <span
                className={cn(
                  "size-7 rounded-lg",
                  item.tone === "primary" && "bg-blue-100",
                  item.tone === "info" && "bg-cyan-100",
                  item.tone === "plugin" && "bg-violet-100",
                )}
              />
              <div className="min-w-0">
                <strong className="block truncate text-sm text-platform-ink">
                  {item.title}
                </strong>
                <span className="block truncate text-xs text-platform-muted">
                  {item.area}
                </span>
              </div>
              <span className="text-right text-xs text-platform-muted">
                {item.time}
              </span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  )
}
