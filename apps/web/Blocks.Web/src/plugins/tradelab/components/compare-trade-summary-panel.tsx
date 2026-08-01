import { GitCompareArrows } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

import type { TradeLabCompareTradeSummaryDiff } from "../types"
import { formatCurrency, formatPercent } from "../utils"

type CompareTradeSummaryPanelProps = {
  tradeSummaryDiffs: TradeLabCompareTradeSummaryDiff[]
}

export function CompareTradeSummaryPanel({ tradeSummaryDiffs }: CompareTradeSummaryPanelProps) {
  return (
    <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
      <CardHeader className="space-y-3 border-b border-slate-200 bg-slate-50/80">
        <Badge variant="outline" className="w-fit">
          <GitCompareArrows className="mr-1 size-3.5" aria-hidden="true" />
          Trade summary diff
        </Badge>
        <CardTitle className="text-lg">Behavioral summary</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader className="bg-slate-50/70">
            <TableRow>
              <TableHead>Field</TableHead>
              <TableHead>Run A</TableHead>
              <TableHead>Run B</TableHead>
              <TableHead className="text-right">Delta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tradeSummaryDiffs.map((item) => (
              <TableRow key={item.key}>
                <TableCell className="font-medium text-slate-900">{item.label}</TableCell>
                <TableCell>{formatValue(item.baseValue, item.format)}</TableCell>
                <TableCell>{formatValue(item.compareValue, item.format)}</TableCell>
                <TableCell
                  className={[
                    "text-right font-medium",
                    item.delta === null
                      ? "text-slate-500"
                      : item.delta > 0
                        ? "text-emerald-600"
                        : item.delta < 0
                          ? "text-rose-600"
                          : "text-slate-700",
                  ].join(" ")}
                >
                  {formatDelta(item.delta, item.format)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function formatValue(value: number | null, format: TradeLabCompareTradeSummaryDiff["format"]) {
  if (value === null) {
    return "N/A"
  }
  if (format === "currency") {
    return formatCurrency(value)
  }
  if (format === "percent") {
    return formatPercent(value)
  }
  return value.toFixed(2)
}

function formatDelta(delta: number | null, format: TradeLabCompareTradeSummaryDiff["format"]) {
  if (delta === null) {
    return "N/A"
  }
  const prefix = delta > 0 ? "+" : ""
  if (format === "currency") {
    return `${prefix}${formatCurrency(delta)}`
  }
  if (format === "percent") {
    return `${prefix}${formatPercent(delta)}`
  }
  return `${prefix}${delta.toFixed(2)}`
}
