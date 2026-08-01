import { AlertTriangle, Database, RefreshCw, Search } from "lucide-react"
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { createBrowserTokenStore } from "@/features/auth/token-store"
import { createApiClient } from "@/lib/api/client"

import { createTradeLabApi } from "../api/tradelab-api"
import { normalizeDatasetCoverageItem } from "../api/tradelab-normalizers"
import type { TradeLabCoverageHealth, TradeLabDatasetCoverageItem } from "../types"
import {
  buildDatasetFreshnessSignals,
  type DatasetFreshnessSignal,
  type DatasetFreshnessSignalTone,
} from "../utils/dataset-freshness-signals"
import { buildDatasetQualitySignals, type DatasetQualitySignalTone } from "../utils/dataset-quality-signals"

type DatasetCatalogPayload = {
  items: unknown[]
}

type DatasetCatalogPageProps = {
  loadCoverage?: () => Promise<DatasetCatalogPayload>
}

type DatasetCatalogQueryContext = {
  datasetKey: string
  symbol: string
  timeframe: string
  requestedStartAt: string
  requestedEndAt: string
}

type DatasetCatalogTargetContext = Pick<DatasetCatalogQueryContext, "requestedStartAt" | "requestedEndAt">

const tokenStore = createBrowserTokenStore()
const tradeLabApi = createTradeLabApi(
  createApiClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL ?? "/",
    getAccessToken: tokenStore.getAccessToken,
  }),
)

function defaultLoadCoverage() {
  return tradeLabApi.listDatasetCoverage()
}

const healthLabels: Record<TradeLabCoverageHealth, string> = {
  healthy: "healthy",
  incomplete: "incomplete",
  suspect: "suspect",
  blocked: "blocked",
}

const healthClassNames: Record<TradeLabCoverageHealth, string> = {
  healthy: "border-emerald-200 bg-emerald-50 text-emerald-700",
  incomplete: "border-amber-200 bg-amber-50 text-amber-700",
  suspect: "border-orange-200 bg-orange-50 text-orange-700",
  blocked: "border-rose-200 bg-rose-50 text-rose-700",
}

const qualitySignalClassNames: Record<DatasetQualitySignalTone, string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  danger: "border-rose-200 bg-rose-50 text-rose-700",
  info: "border-blue-200 bg-blue-50 text-blue-700",
}

const freshnessSignalClassNames: Record<DatasetFreshnessSignalTone, string> = {
  ok: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  danger: "border-rose-200 bg-rose-50 text-rose-700",
  info: "border-blue-200 bg-blue-50 text-blue-700",
}

const freshnessStatusLabels: Record<DatasetFreshnessSignal["status"], string> = {
  pass: "Pass",
  warning: "Warning",
  fail: "Fail",
  unknown: "Unknown",
}

function readDatasetCatalogQueryContext(
  search = typeof window === "undefined" ? "" : window.location.search,
): DatasetCatalogQueryContext {
  const params = new URLSearchParams(search)
  return {
    datasetKey: params.get("datasetKey")?.trim() ?? "",
    symbol: params.get("symbol")?.trim() ?? "",
    timeframe: params.get("timeframe")?.trim() ?? "",
    requestedStartAt: params.get("requestedStartAt")?.trim() ?? "",
    requestedEndAt: params.get("requestedEndAt")?.trim() ?? "",
  }
}

export function DatasetCatalogPage({ loadCoverage = defaultLoadCoverage }: DatasetCatalogPageProps) {
  const [items, setItems] = useState<TradeLabDatasetCoverageItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [selected, setSelected] = useState<TradeLabDatasetCoverageItem | null>(null)
  const [queryContext] = useState(() => readDatasetCatalogQueryContext())
  const [symbolFilter, setSymbolFilter] = useState(queryContext.symbol)
  const [timeframeFilter, setTimeframeFilter] = useState("")
  const [healthFilter, setHealthFilter] = useState("")
  const [datasetKeyFilter, setDatasetKeyFilter] = useState(queryContext.datasetKey)

  const refresh = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage(null)
    try {
      const payload = await loadCoverage()
      setItems((payload.items ?? []).map(normalizeDatasetCoverageItem))
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Dataset catalog could not be loaded.")
    } finally {
      setIsLoading(false)
    }
  }, [loadCoverage])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [refresh])

  const summary = useMemo(() => {
    return {
      total: items.length,
      healthy: items.filter((item) => item.healthStatus === "healthy").length,
      attention: items.filter((item) => item.healthStatus !== "healthy").length,
      gaps: items.reduce((total, item) => total + item.gapCount, 0),
    }
  }, [items])

  const timeframes = useMemo(
    () => Array.from(new Set(items.map((item) => item.timeframe))).sort((left, right) => left.localeCompare(right)),
    [items],
  )

  useEffect(() => {
    if (!queryContext.timeframe) return
    const timer = window.setTimeout(() => {
      setTimeframeFilter((current) => {
        if (current || !timeframes.includes(queryContext.timeframe)) {
          return current
        }
        return queryContext.timeframe
      })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [queryContext.timeframe, timeframes])

  const filteredItems = useMemo(() => {
    const symbol = symbolFilter.trim().toLowerCase()
    const timeframe = timeframeFilter.trim().toLowerCase()
    const health = healthFilter.trim().toLowerCase()
    const datasetKey = datasetKeyFilter.trim().toLowerCase()
    return items.filter((item) => {
      return (
        (!symbol || item.symbol.toLowerCase().includes(symbol)) &&
        (!timeframe || item.timeframe.toLowerCase() === timeframe) &&
        (!health || item.healthStatus.toLowerCase() === health) &&
        (!datasetKey || item.datasetKey.toLowerCase().includes(datasetKey))
      )
    })
  }, [datasetKeyFilter, healthFilter, items, symbolFilter, timeframeFilter])

  return (
    <div className="grid gap-4">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Database className="size-5 text-slate-600" aria-hidden="true" />
            <Badge variant="outline">TradeLab</Badge>
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">Dataset Catalog</h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">
            Read-only inventory of indexed market-data coverage. Refresh re-reads TradeLab storage only.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void refresh()} disabled={isLoading}>
          <RefreshCw className={isLoading ? "size-4 animate-spin" : "size-4"} aria-hidden="true" />
          Refresh dataset catalog
        </Button>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Dataset catalog summary">
        <SummaryMetric label="datasets" value={summary.total} />
        <SummaryMetric label="healthy" value={summary.healthy} />
        <SummaryMetric label="need attention" value={summary.attention} />
        <SummaryMetric label="total gaps" value={summary.gaps} />
      </section>

      <section className="grid gap-3 rounded-md border border-slate-200 bg-white p-3 shadow-sm" aria-label="Dataset catalog filters">
        <div className="grid gap-3 md:grid-cols-4">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Symbol filter
            <Input value={symbolFilter} onChange={(event) => setSymbolFilter(event.target.value)} placeholder="BTCUSDT" />
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Timeframe filter
            <select
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={timeframeFilter}
              onChange={(event) => setTimeframeFilter(event.target.value)}
            >
              <option value="">All timeframes</option>
              {timeframes.map((timeframe) => (
                <option key={timeframe} value={timeframe}>
                  {timeframe}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Health filter
            <select
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              value={healthFilter}
              onChange={(event) => setHealthFilter(event.target.value)}
            >
              <option value="">All health states</option>
              <option value="healthy">healthy</option>
              <option value="incomplete">incomplete</option>
              <option value="suspect">suspect</option>
              <option value="blocked">blocked</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Dataset key filter
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-slate-400" aria-hidden="true" />
              <Input
                className="pl-8"
                value={datasetKeyFilter}
                onChange={(event) => setDatasetKeyFilter(event.target.value)}
                placeholder="binance:BTCUSDT:1h"
              />
            </div>
          </label>
        </div>
      </section>

      {errorMessage ? (
        <Alert variant="destructive">
          <AlertTriangle className="size-4" />
          <AlertTitle>Dataset catalog failed to load</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      ) : null}

      <section className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm" aria-label="Dataset coverage table">
        {isLoading ? (
          <div className="grid gap-3 p-4">
            <p className="text-sm text-slate-600">Loading dataset catalog...</p>
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="grid min-h-40 place-items-center p-6 text-center">
            <div className="grid gap-2">
              <h2 className="text-base font-semibold text-slate-900">No datasets have been indexed yet.</h2>
              <p className="text-sm text-slate-600">
                Coverage rows appear here after TradeLab has indexed local market data.
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Dataset key</TableHead>
                  <TableHead>Exchange</TableHead>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Timeframe</TableHead>
                  <TableHead>Health</TableHead>
                  <TableHead>Covered start</TableHead>
                  <TableHead>Covered end</TableHead>
                  <TableHead className="text-right">Segments</TableHead>
                  <TableHead className="text-right">Gaps</TableHead>
                  <TableHead>Last checked</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item) => (
                  <TableRow key={item.id} className="cursor-pointer" onClick={() => setSelected(item)}>
                    <TableCell className="min-w-56 font-medium">
                      <Button
                        type="button"
                        variant="link"
                        className="h-auto p-0 text-left"
                        onClick={(event) => {
                          event.stopPropagation()
                          setSelected(item)
                        }}
                      >
                        Open details for {item.datasetKey}
                      </Button>
                    </TableCell>
                    <TableCell>{item.exchange}</TableCell>
                    <TableCell>{item.symbol}</TableCell>
                    <TableCell>{item.timeframe}</TableCell>
                    <TableCell>
                      <HealthBadge health={item.healthStatus} />
                    </TableCell>
                    <TableCell>{formatDate(item.coveredStartAt)}</TableCell>
                    <TableCell>{formatDate(item.coveredEndAt)}</TableCell>
                    <TableCell className="text-right tabular-nums">{item.segmentCount}</TableCell>
                    <TableCell className="text-right tabular-nums">{item.gapCount}</TableCell>
                    <TableCell>{formatDate(item.lastCheckedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <DatasetDetailSheet
        item={selected}
        targetContext={queryContext}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </div>
  )
}

function SummaryMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-2xl font-semibold tabular-nums text-slate-950">
        {value} {label}
      </div>
    </div>
  )
}

function HealthBadge({ health }: { health: TradeLabCoverageHealth }) {
  return (
    <Badge variant="outline" className={healthClassNames[health]}>
      {healthLabels[health]}
    </Badge>
  )
}

function DatasetDetailSheet({
  item,
  targetContext,
  onOpenChange,
}: {
  item: TradeLabDatasetCoverageItem | null
  targetContext: DatasetCatalogTargetContext
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={Boolean(item)} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Coverage details</SheetTitle>
          <SheetDescription>{item?.datasetKey ?? ""}</SheetDescription>
        </SheetHeader>
        {item ? (
          <ScrollArea className="h-[calc(100vh-7rem)] px-4 pb-6">
            <div className="grid gap-4">
              <div className="grid gap-2 text-sm">
                <DetailRow label="Exchange" value={item.exchange} />
                <DetailRow label="Symbol" value={item.symbol} />
                <DetailRow label="Timeframe" value={item.timeframe} />
                <DetailRow label="Health" value={<HealthBadge health={item.healthStatus} />} />
                <DetailRow label="Earliest open" value={formatDate(item.earliestOpenTime)} />
                <DetailRow label="Latest open" value={formatDate(item.latestOpenTime)} />
                <DetailRow label="Covered start" value={formatDate(item.coveredStartAt)} />
                <DetailRow label="Covered end" value={formatDate(item.coveredEndAt)} />
                <DetailRow label="Last checked" value={formatDate(item.lastCheckedAt)} />
              </div>
              <Separator />
              <QualitySignalsList item={item} />
              {hasTargetContext(targetContext) ? (
                <>
                  <Separator />
                  <TargetContextSummary targetContext={targetContext} />
                </>
              ) : null}
              <Separator />
              <FreshnessSignalsList item={item} requestedEndAt={targetContext.requestedEndAt} />
              <Separator />
              <section className="grid gap-2">
                <h3 className="text-sm font-semibold text-slate-900">Segments</h3>
                {item.segments.length ? (
                  <div className="grid gap-2">
                    {item.segments.map((segment) => (
                      <div key={segment.id} className="rounded-md border border-slate-200 p-3 text-sm">
                        <div className="font-medium text-slate-900">{segment.id}</div>
                        <div className="mt-2 grid gap-1 text-slate-600">
                          <span>Index: {segment.segmentIndex}</span>
                          <span>Start: {formatDate(segment.startAt)}</span>
                          <span>End: {formatDate(segment.endAt)}</span>
                          <span>Rows: {segment.rowCount}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-600">No active segments recorded.</p>
                )}
              </section>
              <Separator />
              <section className="grid gap-2">
                <h3 className="text-sm font-semibold text-slate-900">Metadata</h3>
                <pre className="overflow-x-auto rounded-md bg-slate-950 p-3 text-xs text-slate-50">
                  {JSON.stringify(item.metadata, null, 2)}
                </pre>
              </section>
              <Alert>
                <Database className="size-4" />
                <AlertTitle>Read-only catalog</AlertTitle>
                <AlertDescription>This view does not import data, call exchanges, or change runtime state.</AlertDescription>
              </Alert>
            </div>
          </ScrollArea>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

function QualitySignalsList({ item }: { item: TradeLabDatasetCoverageItem }) {
  const signals = buildDatasetQualitySignals(item)

  return (
    <section className="grid gap-2" aria-label="Quality signals">
      <h3 className="text-sm font-semibold text-slate-900">Quality signals</h3>
      <div className="grid gap-2">
        {signals.map((signal) => (
          <div key={signal.id} className="rounded-md border border-slate-200 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-slate-900">{signal.label}</span>
              <Badge variant="outline" className={qualitySignalClassNames[signal.tone]}>
                {signal.status}
              </Badge>
            </div>
            <p className="mt-2 leading-6 text-slate-600">{signal.description}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function TargetContextSummary({ targetContext }: { targetContext: DatasetCatalogTargetContext }) {
  return (
    <section className="grid gap-2" aria-label="Target context">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Target context</h3>
        <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
          Read-only
        </Badge>
      </div>
      <div className="grid gap-2 text-sm">
        <DetailRow label="Requested range" value={formatTargetRange(targetContext)} />
        <DetailRow label="Source" value="Strategy Lab link" />
      </div>
    </section>
  )
}

function hasTargetContext(targetContext: DatasetCatalogTargetContext) {
  return Boolean(targetContext.requestedStartAt || targetContext.requestedEndAt)
}

function formatTargetRange(targetContext: DatasetCatalogTargetContext) {
  return `${formatDate(targetContext.requestedStartAt)} - ${formatDate(targetContext.requestedEndAt)}`
}

function FreshnessSignalsList({
  item,
  requestedEndAt,
}: {
  item: TradeLabDatasetCoverageItem
  requestedEndAt?: string | null
}) {
  const signals = buildDatasetFreshnessSignals({
    coveredEndAt: item.coveredEndAt,
    latestOpenTime: item.latestOpenTime,
    lastCheckedAt: item.lastCheckedAt,
    gapCount: item.gapCount,
    segmentCount: item.segmentCount,
    requestedEndAt: requestedEndAt?.trim() ? requestedEndAt : null,
  })

  return (
    <section className="grid gap-2" aria-label="Freshness and gaps">
      <h3 className="text-sm font-semibold text-slate-900">Freshness & gaps</h3>
      <div className="grid gap-2">
        {signals.map((signal) => (
          <div key={signal.id} className="rounded-md border border-slate-200 p-3 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-slate-900">{signal.label}</span>
              <Badge variant="outline" className={freshnessSignalClassNames[signal.tone]}>
                {freshnessStatusLabels[signal.status]}
              </Badge>
            </div>
            <p className="mt-2 leading-6 text-slate-600">{signal.description}</p>
            <p className="mt-1 break-words text-xs font-medium text-slate-500">Reason: {signal.reason}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
      <span className="text-slate-500">{label}</span>
      <span className="min-w-0 break-words text-slate-900">{value}</span>
    </div>
  )
}

function formatDate(value: string | null) {
  if (!value) {
    return "N/A"
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toISOString().replace(".000Z", "Z")
}
