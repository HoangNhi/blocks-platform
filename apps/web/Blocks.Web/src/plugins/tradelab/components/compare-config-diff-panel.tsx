import { useState } from "react"
import { ChevronDown, FileCode2, GitCompareArrows } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

import type { TradeLabCompareConfigDiff } from "../types"

type CompareConfigDiffPanelProps = {
  configDiff: TradeLabCompareConfigDiff
  datasetMismatchWarning: string | null
}

export function CompareConfigDiffPanel({ configDiff, datasetMismatchWarning }: CompareConfigDiffPanelProps) {
  const [isSourceOpen, setIsSourceOpen] = useState(false)

  return (
    <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
      <CardHeader className="space-y-3 border-b border-slate-200 bg-slate-50/80">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="w-fit">
            <GitCompareArrows className="mr-1 size-3.5" aria-hidden="true" />
            Config / source diff
          </Badge>
          <Badge variant={configDiff.sourceHash.isMatch ? "secondary" : "destructive"} className="w-fit">
            Source hash {configDiff.sourceHash.isMatch ? "matches" : "differs"}
          </Badge>
        </div>
        <CardTitle className="text-lg">Configuration and source summary</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {datasetMismatchWarning ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {datasetMismatchWarning}
          </div>
        ) : null}

        <SummaryBlock title="Source identity" rows={[configDiff.sourceHash, configDiff.strategyVersion]} />
        <SummaryBlock title="Runtime config" rows={configDiff.runtimeConfigDiffs} />
        <SummaryBlock title="Risk config" rows={configDiff.riskConfigDiffs} />
        <SummaryBlock title="Dataset context" rows={configDiff.datasetContextDiffs} />

        <Collapsible open={isSourceOpen} onOpenChange={setIsSourceOpen}>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-900">Raw source diff</p>
                <p className="text-xs text-slate-500">Collapsed by default. Expand to inspect the underlying source code.</p>
              </div>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  <ChevronDown className={["mr-2 size-4 transition-transform", isSourceOpen ? "rotate-180" : ""].join(" ")} aria-hidden="true" />
                  {isSourceOpen ? "Hide" : "Show"}
                </Button>
              </CollapsibleTrigger>
            </div>
            <CollapsibleContent className="mt-3 grid gap-3 lg:grid-cols-2">
              <SourceBlock label="Run A source" source={configDiff.baseSourceCode} />
              <SourceBlock label="Run B source" source={configDiff.compareSourceCode} />
            </CollapsibleContent>
          </div>
        </Collapsible>
      </CardContent>
    </Card>
  )
}

function SummaryBlock({
  title,
  rows,
}: {
  title: string
  rows: Array<{ key: string; label: string; baseValue: string; compareValue: string; isMatch: boolean }>
}) {
  return (
    <div className="rounded-xl border border-slate-200">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-900">{title}</div>
      <Table>
        <TableHeader className="bg-white">
          <TableRow>
            <TableHead>Field</TableHead>
            <TableHead>Run A</TableHead>
            <TableHead>Run B</TableHead>
            <TableHead className="text-right">Match</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.key}>
              <TableCell className="font-medium text-slate-900">{row.label}</TableCell>
              <TableCell>{row.baseValue}</TableCell>
              <TableCell>{row.compareValue}</TableCell>
              <TableCell className="text-right">
                <Badge variant={row.isMatch ? "secondary" : "destructive"}>{row.isMatch ? "Same" : "Different"}</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function SourceBlock({ label, source }: { label: string; source: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <FileCode2 className="size-3.5" aria-hidden="true" />
        {label}
      </div>
      <pre className="max-h-[280px] overflow-auto rounded-lg bg-slate-950 p-3 text-xs leading-5 text-slate-100">
        <code>{source || "No source available."}</code>
      </pre>
    </div>
  )
}
