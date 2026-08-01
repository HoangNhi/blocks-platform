import { useMemo, useState } from "react"
import { Virtuoso } from "react-virtuoso"
import { ChevronDown, ChevronRight, FileJson2 } from "lucide-react"

import { StatusBadge } from "@/components/platform/status-badge"
import { cn } from "@/lib/utils"

import type { TradeLabLogEntry } from "../types"
import { formatDateTime, logTone } from "../utils"

type BacktestLogsPanelProps = {
  logs: TradeLabLogEntry[]
}

export function BacktestLogsPanel({ logs }: BacktestLogsPanelProps) {
  const [openIds, setOpenIds] = useState<string[]>([])
  const openIdSet = useMemo(() => new Set(openIds), [openIds])

  return (
    <div className="overflow-hidden rounded-xl border border-platform-border bg-platform-surface">
      <div className="flex items-center justify-between border-b border-platform-border px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-platform-ink">Backtest Logs</h3>
          <p className="mt-1 text-xs text-platform-muted">
            Virtualized log timeline with expandable JSON payloads.
          </p>
        </div>
        <StatusBadge tone="neutral">{`${logs.length} rows`}</StatusBadge>
      </div>
      <div className="h-[520px]">
        {logs.length === 0 ? (
          <div className="grid h-full place-items-center px-4 text-center text-sm text-platform-muted">
            <div className="max-w-md">
              <strong className="block text-platform-ink">No backtest logs yet.</strong>
              <p className="mt-2 leading-6">
                Run a backtest to populate TradeLab logs, order events, and backend status messages.
              </p>
            </div>
          </div>
        ) : (
          <Virtuoso
            data={logs}
            itemContent={(index, log) => {
              const isOpen = openIdSet.has(log.id)

              return (
                <div className={cn("border-b border-platform-border px-4 py-3", index % 2 === 1 && "bg-slate-50/50")}>
                  <button
                    type="button"
                    className="flex w-full items-start gap-3 text-left"
                    onClick={() =>
                      setOpenIds((current) =>
                        current.includes(log.id)
                          ? current.filter((id) => id !== log.id)
                          : [...current, log.id],
                      )
                    }
                  >
                    <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
                      <FileJson2 className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="text-sm font-semibold text-platform-ink">
                          {log.eventType}
                        </strong>
                        <StatusBadge tone={logTone(log.level)}>{log.level}</StatusBadge>
                        <span className="text-xs text-platform-muted">
                          {formatDateTime(log.timestamp)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm leading-6 text-platform-ink">
                        {log.message}
                      </p>
                      {isOpen ? (
                        <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-950 px-3 py-2 text-xs leading-5 text-slate-100">
                          {JSON.stringify(log.payload, null, 2)}
                        </pre>
                      ) : null}
                    </div>
                    <span className="mt-0.5 text-slate-400">
                      {isOpen ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                    </span>
                  </button>
                </div>
              )
            }}
          />
        )}
      </div>
    </div>
  )
}
