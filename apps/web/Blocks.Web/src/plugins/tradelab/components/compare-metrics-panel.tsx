import { ArrowDownRight, ArrowUpRight, Scale } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

import type { TradeLabCompareMetricDiff } from "../types"
import { formatCurrency, formatPercent } from "../utils"

type CompareMetricsPanelProps = {
  metricDiffs: TradeLabCompareMetricDiff[]
}

export function CompareMetricsPanel({ metricDiffs }: CompareMetricsPanelProps) {
  const improved = metricDiffs.filter((item) => (item.delta ?? 0) > 0).length
  const worsened = metricDiffs.filter((item) => (item.delta ?? 0) < 0).length

  return (
    <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
      <CardHeader className="space-y-3 border-b border-slate-200 bg-slate-50/80">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="w-fit">
            <Scale className="mr-1 size-3.5" aria-hidden="true" />
            Metrics diff
          </Badge>
          <Badge variant="secondary" className="w-fit">
            <ArrowUpRight className="mr-1 size-3.5" aria-hidden="true" />
            {improved} improved
          </Badge>
          <Badge variant="secondary" className="w-fit">
            <ArrowDownRight className="mr-1 size-3.5" aria-hidden="true" />
            {worsened} worsened
          </Badge>
        </div>
        <CardTitle className="text-lg">Metrics comparison</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader className="bg-slate-50/70">
            <TableRow>
              <TableHead>Metric</TableHead>
              <TableHead>Run A</TableHead>
              <TableHead>Run B</TableHead>
              <TableHead className="text-right">Delta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {metricDiffs.map((metric) => (
              <TableRow key={metric.key}>
                <TableCell className="font-medium text-slate-900">{metric.label}</TableCell>
                <TableCell>{formatValue(metric.baseValue, metric.format)}</TableCell>
                <TableCell>{formatValue(metric.compareValue, metric.format)}</TableCell>
                <TableCell
                  className={[
                    "text-right font-medium",
                    metric.delta === null
                      ? "text-slate-500"
                      : metric.delta > 0
                        ? "text-emerald-600"
                        : metric.delta < 0
                          ? "text-rose-600"
                          : "text-slate-700",
                  ].join(" ")}
                >
                  {formatDelta(metric.delta, metric.format)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

function formatValue(value: number | null, format: TradeLabCompareMetricDiff["format"]) {
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

function formatDelta(delta: number | null, format: TradeLabCompareMetricDiff["format"]) {
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
