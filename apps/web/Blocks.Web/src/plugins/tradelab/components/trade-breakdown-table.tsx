import { ChevronRight, Clock3 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"

import type { TradeLabAnalyzedTrade } from "../types"
import { formatCurrency, formatDateTime, formatPercent } from "../utils"

type TradeBreakdownTableProps = {
  trades: TradeLabAnalyzedTrade[]
  selectedTradeId: string | null
  onSelectTrade: (tradeId: string) => void
}

export function TradeBreakdownTable({ trades, selectedTradeId, onSelectTrade }: TradeBreakdownTableProps) {
  return (
    <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
      <CardHeader className="space-y-2 border-b border-slate-200 bg-slate-50/80">
        <div className="flex items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Trade breakdown</CardTitle>
            <p className="mt-1 text-xs text-slate-500">Select a trade to sync the chart window, detail panel, and execution trace.</p>
          </div>
          <Badge variant="outline" className="font-normal">
            <Clock3 className="mr-1 size-3.5" aria-hidden="true" />
            {trades.length} trades
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {trades.length === 0 ? (
          <div className="grid gap-2 p-4 text-sm text-slate-500">
            <strong className="text-slate-900">No analyzed trades yet.</strong>
            <span>Completed runs with at least one closed trade will populate this table.</span>
          </div>
        ) : (
          <Table>
            <TableHeader className="bg-slate-50/70">
              <TableRow>
                <TableHead>Entry time</TableHead>
                <TableHead>Exit time</TableHead>
                <TableHead>Side</TableHead>
                <TableHead>PnL</TableHead>
                <TableHead>PnL %</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Open</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trades.map((trade) => {
                const selected = trade.id === selectedTradeId
                return (
                  <TableRow
                    key={trade.id}
                    data-state={selected ? "selected" : undefined}
                    className={cn("cursor-pointer", selected && "bg-blue-50/60 hover:bg-blue-50/80")}
                    tabIndex={0}
                    onClick={() => onSelectTrade(trade.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault()
                        onSelectTrade(trade.id)
                      }
                    }}
                  >
                    <TableCell className="font-medium text-slate-900">{formatDateTime(trade.entryTime)}</TableCell>
                    <TableCell>{trade.exitTime ? formatDateTime(trade.exitTime) : "Open"}</TableCell>
                    <TableCell>
                      <Badge variant={trade.side === "buy" ? "default" : "secondary"} className="capitalize">
                        {trade.side}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={cn(
                        trade.pnl === null
                          ? "text-slate-500"
                          : trade.pnl > 0
                            ? "font-medium text-emerald-600"
                            : trade.pnl < 0
                              ? "font-medium text-rose-600"
                              : "text-slate-700",
                      )}
                    >
                      {trade.pnl === null ? "N/A" : formatCurrency(trade.pnl)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        trade.pnlPct === null
                          ? "text-slate-500"
                          : trade.pnlPct > 0
                            ? "font-medium text-emerald-600"
                            : trade.pnlPct < 0
                              ? "font-medium text-rose-600"
                              : "text-slate-700",
                      )}
                    >
                      {trade.pnlPct === null ? "N/A" : formatPercent(trade.pnlPct)}
                    </TableCell>
                    <TableCell>{trade.durationSeconds === null ? "N/A" : formatDuration(trade.durationSeconds)}</TableCell>
                    <TableCell>
                      <Badge variant={trade.status === "closed" ? "default" : "secondary"}>{trade.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <ChevronRight className="ml-auto size-4 text-slate-400" aria-hidden="true" />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  if (minutes > 0) {
    return `${minutes}m`
  }
  return `${totalSeconds}s`
}
