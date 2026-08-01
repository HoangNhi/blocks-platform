import type { ReactNode } from "react"
import { FileText, Gauge, TrendingDown, TrendingUp } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"

import type { TradeLabSelectedTradeExecutionDetail } from "../types"
import { formatCurrency, formatDateTime, formatPercent } from "../utils"

type SelectedTradeExecutionPanelProps = {
  detail: TradeLabSelectedTradeExecutionDetail | null
}

export function SelectedTradeExecutionPanel({ detail }: SelectedTradeExecutionPanelProps) {
  if (!detail) {
    return (
      <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Selected trade execution</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-500">
          Select a trade from the breakdown table to inspect entry, exit, and event context.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
      <CardHeader className="space-y-2 border-b border-slate-200 bg-slate-50/80">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={detail.trade.side === "buy" ? "default" : "secondary"} className="capitalize">
            {detail.trade.side} trade
          </Badge>
          <Badge variant="outline">{detail.trade.status}</Badge>
        </div>
        <CardTitle className="flex items-center gap-2 text-base">
          <Gauge className="size-4 text-slate-600" aria-hidden="true" />
          Selected trade execution
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 p-4 text-sm">
        <SummaryGrid detail={detail} />

        <Section label="Entry context" icon={TrendingUp}>
          <div className="grid gap-1">
            <Row label="Order id" value={readValue(detail.entryOrder, "id")} />
            <Row label="Signal id" value={readValue(detail.entrySignal, "id")} />
            <Row label="Signal type" value={readValue(detail.entrySignal, "signal_type", "signalType")} />
            <Row label="Time" value={formatMaybeDate(readValue(detail.entrySignal, "candle_open_time", "candleOpenTime"))} />
            <Row label="Fill price" value={formatMaybeCurrency(readValue(detail.entryOrder, "fill_price", "fillPrice"))} />
            <Row label="Reason" value={formatMaybeText(readValue(detail.entryOrder, "reason"))} />
          </div>
        </Section>

        <Section label="Exit context" icon={TrendingDown}>
          <div className="grid gap-1">
            <Row label="Order id" value={readValue(detail.exitOrder, "id")} />
            <Row label="Signal id" value={readValue(detail.exitSignal, "id")} />
            <Row label="Signal type" value={readValue(detail.exitSignal, "signal_type", "signalType")} />
            <Row label="Time" value={formatMaybeDate(readValue(detail.exitSignal, "candle_open_time", "candleOpenTime"))} />
            <Row label="Fill price" value={formatMaybeCurrency(readValue(detail.exitOrder, "fill_price", "fillPrice"))} />
            <Row label="Reason" value={formatMaybeText(readValue(detail.exitOrder, "reason"))} />
          </div>
        </Section>

        <Separator />

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <FileText className="size-3.5" aria-hidden="true" />
            Relevant logs
          </div>
          {detail.logs.length === 0 ? (
            <p className="text-sm text-slate-500">No logs were captured for this trade window.</p>
          ) : (
            <ScrollArea className="max-h-[240px] pr-3">
              <div className="grid gap-2">
                {detail.logs.map((log) => (
                  <div key={log.id} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{log.level}</Badge>
                      <strong className="text-slate-900">{log.eventType}</strong>
                      <span className="text-slate-400">{formatDateTime(log.timestamp)}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-700">{log.message}</p>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function SummaryGrid({ detail }: { detail: TradeLabSelectedTradeExecutionDetail }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <InfoCard label="Entry" value={formatDateTime(detail.trade.entryTime)} />
      <InfoCard label="Exit" value={detail.trade.exitTime ? formatDateTime(detail.trade.exitTime) : "Open"} />
      <InfoCard label="PnL" value={detail.trade.pnl === null ? "N/A" : formatCurrency(detail.trade.pnl)} />
      <InfoCard label="PnL %" value={detail.trade.pnlPct === null ? "N/A" : formatPercent(detail.trade.pnlPct)} />
    </div>
  )
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 font-medium text-slate-900">{value}</p>
    </div>
  )
}

function Section({
  label,
  icon: Icon,
  children,
}: {
  label: string
  icon: typeof Gauge
  children: ReactNode
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <Icon className="size-3.5" aria-hidden="true" />
        {label}
      </div>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-dashed border-slate-200 py-1 last:border-b-0">
      <span className="text-xs uppercase tracking-wide text-slate-500">{label}</span>
      <span className="max-w-[60%] truncate text-right text-slate-900">{value ?? "N/A"}</span>
    </div>
  )
}

function readValue(record: Record<string, unknown> | null, ...keys: string[]) {
  if (!record) {
    return null
  }
  for (const key of keys) {
    if (key in record) {
      const value = record[key]
      if (value === null || value === undefined) {
        return null
      }
      if (typeof value === "string") {
        return value
      }
      if (typeof value === "number" || typeof value === "boolean") {
        return String(value)
      }
      if (Array.isArray(value) || typeof value === "object") {
        return JSON.stringify(value)
      }
      return String(value)
    }
  }
  return null
}

function formatMaybeDate(value: unknown) {
  return typeof value === "string" && value.length > 0 ? formatDateTime(value) : "N/A"
}

function formatMaybeCurrency(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return formatCurrency(value)
  }
  if (typeof value === "string" && value.length > 0 && Number.isFinite(Number(value))) {
    return formatCurrency(Number(value))
  }
  return "N/A"
}

function formatMaybeText(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : "N/A"
}
