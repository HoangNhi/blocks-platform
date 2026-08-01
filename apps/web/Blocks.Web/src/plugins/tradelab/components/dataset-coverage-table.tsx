import { RefreshCw } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import type { TradeLabDatasetCoverageItem } from "../types"
import { formatDateTime } from "../utils"

export type DatasetCoverageTableProps = {
  items: TradeLabDatasetCoverageItem[]
  isLoading: boolean
  errorMessage: string | null
  selectedDatasetKey: string | null
  onSelectUniverse: (item: TradeLabDatasetCoverageItem) => void
  onRefresh: () => void
}

const healthTone: Record<TradeLabDatasetCoverageItem["healthStatus"], string> = {
  healthy: "bg-emerald-600 hover:bg-emerald-600",
  incomplete: "bg-amber-600 hover:bg-amber-600",
  suspect: "bg-orange-600 hover:bg-orange-600",
  blocked: "bg-rose-600 hover:bg-rose-600",
}

export function DatasetCoverageTable({
  items,
  isLoading,
  errorMessage,
  selectedDatasetKey,
  onSelectUniverse,
  onRefresh,
}: DatasetCoverageTableProps) {
  if (isLoading) {
    return <div className="rounded-md border border-slate-200 p-4 text-sm text-slate-600">Loading dataset coverage...</div>
  }

  if (errorMessage) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Dataset coverage failed</AlertTitle>
        <AlertDescription>{errorMessage}</AlertDescription>
      </Alert>
    )
  }

  return (
    <section className="grid gap-3" aria-label="Dataset coverage">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Dataset coverage</h3>
          <p className="text-xs text-slate-500">Pick symbol/timeframe before trial execution.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onRefresh}>
          <RefreshCw className="size-4" aria-hidden="true" />
          Refresh
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-md border border-dashed border-slate-300 p-4 text-sm text-slate-500">
          No dataset coverage found.
        </div>
      ) : (
        <ScrollArea className="w-full rounded-md border border-slate-200">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Exchange</TableHead>
                <TableHead>Symbol</TableHead>
                <TableHead>Timeframe</TableHead>
                <TableHead>Health</TableHead>
                <TableHead>Earliest</TableHead>
                <TableHead>Latest</TableHead>
                <TableHead>Coverage</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const selected = item.datasetKey === selectedDatasetKey
                return (
                  <TableRow key={item.id} data-state={selected ? "selected" : undefined}>
                    <TableCell>{item.exchange}</TableCell>
                    <TableCell className="font-medium text-slate-900">{item.symbol}</TableCell>
                    <TableCell>{item.timeframe}</TableCell>
                    <TableCell>
                      <Badge className={healthTone[item.healthStatus]}>{item.healthStatus}</Badge>
                    </TableCell>
                    <TableCell>{formatMaybeDate(item.earliestOpenTime)}</TableCell>
                    <TableCell>{formatMaybeDate(item.latestOpenTime)}</TableCell>
                    <TableCell>
                      <div className="grid gap-1 text-xs text-slate-600">
                        <span>{item.segmentCount} segments</span>
                        <span>{item.gapCount} gaps</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {selected ? <Badge variant="secondary">Selected</Badge> : null}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          aria-label={`Select ${item.symbol} ${item.timeframe}`}
                          onClick={() => onSelectUniverse(item)}
                        >
                          Select
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </ScrollArea>
      )}
    </section>
  )
}

function formatMaybeDate(value: string | null) {
  return value ? formatDateTime(value) : "N/A"
}
