import { iconFor } from "./icon-for"
import type { RailGroup } from "../snapshot"

export function CurrentStateRail({ rail }: { rail: RailGroup[] }) {
  return (
    <section
      aria-label="Hermes capability summary"
      className="flex flex-col gap-2 rounded-lg border border-platform-border bg-platform-surface p-3"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-platform-muted">
        Capability summary
      </p>
      <ul className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
        {rail.map((group, index) => {
          const Icon = iconFor(
            group.key === "core"
              ? "Cpu"
              : group.key === "provider"
                ? "Server"
                : group.key === "surfaces"
                  ? "MessagesSquare"
                  : group.key === "tools"
                    ? "Wrench"
                    : group.key === "memory"
                      ? "BookMarked"
                      : group.key === "sessions"
                        ? "Users"
                        : "CalendarClock",
          )
          return (
            <li
              key={group.key}
              data-testid={`rail-${group.key}`}
              className="flex items-center gap-2"
            >
              <Icon className="size-3.5 text-platform-muted" aria-hidden="true" />
              <span className="font-medium text-platform-ink">
                {group.label}
              </span>
              <span className="text-platform-muted">{group.primary}</span>
              {index < rail.length - 1 ? (
                <span
                  aria-hidden="true"
                  className="mx-1 hidden h-3 w-px bg-platform-border sm:inline-block"
                />
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
