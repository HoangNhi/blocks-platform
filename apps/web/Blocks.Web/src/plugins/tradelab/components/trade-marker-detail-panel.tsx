import { Eye, MessageSquareText } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import type { TradeLabTradeDetail } from "../types"
import { formatDateTime } from "../utils"

type TradeMarkerDetailPanelProps = {
  trade: TradeLabTradeDetail | null
}

export function TradeMarkerDetailPanel({ trade }: TradeMarkerDetailPanelProps) {
  if (!trade) {
    return (
      <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Selected trade</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-slate-500">
          Click a buy or sell marker on the chart to inspect the marker context for that trade.
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
      <CardHeader className="space-y-2 border-b border-slate-200 bg-slate-50/80">
        <div className="flex items-center gap-2">
          <Badge className="bg-slate-700 hover:bg-slate-700">{trade.marker.kind}</Badge>
          <Badge variant="outline">{trade.marker.side}</Badge>
        </div>
        <CardTitle className="flex items-center gap-2 text-base">
          <Eye className="size-4 text-slate-600" aria-hidden="true" />
          Trade detail
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 p-4 text-sm">
        <Field label="Timestamp" value={formatDateTime(trade.marker.timestamp)} />
        <Field label="Price" value={trade.marker.price === null ? "N/A" : trade.marker.price.toFixed(4)} />
        <Field label="Quantity" value={trade.marker.quantity === null ? "N/A" : trade.marker.quantity.toFixed(4)} />
        <Field label="Order id" value={trade.marker.tradeOrderId ?? "N/A"} />
        <Field label="Signal id" value={trade.marker.strategySignalId ?? "N/A"} />
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <MessageSquareText className="size-3.5" aria-hidden="true" />
            Marker note
          </div>
          <p className="text-sm text-slate-700">{trade.marker.message ?? "No note attached to this marker."}</p>
        </div>
      </CardContent>
    </Card>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-slate-900">{value}</span>
    </div>
  )
}
