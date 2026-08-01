import { BookOpenCheck, Plus, Trash2 } from "lucide-react"
import type { FormEvent } from "react"
import { useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

import type {
  TradeLabExecutionJournalEntry,
  TradeLabExecutionJournalEntryRequest,
  TradeLabExecutionJournalList,
  TradeLabRunAnalysis,
} from "../types"

type ExecutionJournalPanelProps = {
  analysis: TradeLabRunAnalysis | null
  journal: TradeLabExecutionJournalList | null
  isLoading: boolean
  isSaving: boolean
  error: string | null
  onCreate: (runId: string, request: TradeLabExecutionJournalEntryRequest) => Promise<unknown>
  onUpdate: (entryId: string, request: TradeLabExecutionJournalEntryRequest) => Promise<unknown>
  onDelete: (entry: TradeLabExecutionJournalEntry) => Promise<unknown>
}

export function ExecutionJournalPanel({
  analysis,
  journal,
  isLoading,
  isSaving,
  error,
  onCreate,
  onDelete,
}: ExecutionJournalPanelProps) {
  const canCreate = analysis?.run.status === "completed"
  const entries = journal?.items ?? []
  const [open, setOpen] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!analysis?.run.id) {
      return
    }

    const form = new FormData(event.currentTarget)
    const entryPrice = formNumber(form, "entryPrice")
    const exitPrice = formNumber(form, "exitPrice")
    const quantity = formNumber(form, "quantity")
    const fee = formNumber(form, "fee")
    await onCreate(analysis.run.id, {
      confirmManualEntryOnly: true,
      source: "strategy_lab",
      side: String(form.get("side") || "long"),
      plannedSnapshot: { plannedEntryPrice: entryPrice },
      disciplineStatus: String(form.get("disciplineStatus") || "not_recorded"),
      notes: String(form.get("notes") || ""),
      fills: [
        { fillRole: "entry", side: "buy", price: entryPrice, quantity, fee },
        { fillRole: "exit", side: "sell", price: exitPrice, quantity, fee },
      ].filter((fill) => fill.price > 0 && fill.quantity > 0),
    })
    setOpen(false)
  }

  return (
    <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
      <CardHeader className="space-y-3 border-b border-slate-200 bg-slate-50/80">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpenCheck className="size-4 text-indigo-700" aria-hidden="true" />
            Execution journal
          </CardTitle>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button type="button" size="sm" disabled={!canCreate || isSaving}>
                <Plus className="mr-2 size-4" aria-hidden="true" />
                Add journal entry
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add journal entry</DialogTitle>
              </DialogHeader>
              <form className="grid gap-3" onSubmit={handleSubmit}>
                <Field>
                  <FieldLabel htmlFor="journal-side">Side</FieldLabel>
                  <Select name="side" defaultValue="long">
                    <SelectTrigger id="journal-side">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="long">Long</SelectItem>
                      <SelectItem value="short">Short</SelectItem>
                      <SelectItem value="flat_or_watch">Flat/watch</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="entry-price">Entry price</FieldLabel>
                  <Input id="entry-price" name="entryPrice" type="number" step="any" min="0" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="exit-price">Exit price</FieldLabel>
                  <Input id="exit-price" name="exitPrice" type="number" step="any" min="0" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="quantity">Quantity</FieldLabel>
                  <Input id="quantity" name="quantity" type="number" step="any" min="0" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="fee">Fee</FieldLabel>
                  <Input id="fee" name="fee" type="number" step="any" min="0" defaultValue="0" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="discipline-status">Discipline</FieldLabel>
                  <Select name="disciplineStatus" defaultValue="not_recorded">
                    <SelectTrigger id="discipline-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="followed_plan">Followed plan</SelectItem>
                      <SelectItem value="partial_deviation">Partial deviation</SelectItem>
                      <SelectItem value="broke_plan">Broke plan</SelectItem>
                      <SelectItem value="not_recorded">Not recorded</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor="journal-notes">Notes</FieldLabel>
                  <Input id="journal-notes" name="notes" />
                </Field>
                <Button type="submit" disabled={isSaving}>Save journal entry</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 p-4 text-sm">
        {!canCreate ? <p className="text-slate-600">Load a completed run to record observed execution evidence.</p> : null}
        {error ? <p className="rounded-md border border-rose-200 bg-rose-50 p-3 text-rose-700">{error}</p> : null}
        {isLoading ? <p className="text-slate-600">Loading execution journal...</p> : null}
        {canCreate && !isLoading && entries.length === 0 ? (
          <p className="text-slate-600">No execution journal entries recorded yet.</p>
        ) : null}
        {entries.length ? <ExecutionJournalTable entries={entries} onDelete={onDelete} /> : null}
      </CardContent>
    </Card>
  )
}

function ExecutionJournalTable({
  entries,
  onDelete,
}: {
  entries: TradeLabExecutionJournalEntry[]
  onDelete: (entry: TradeLabExecutionJournalEntry) => Promise<unknown>
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Outcome</TableHead>
          <TableHead>Entry</TableHead>
          <TableHead>Exit</TableHead>
          <TableHead>PnL</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.entryId}>
            <TableCell>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{entry.outcomeStatus}</Badge>
                <Badge variant="secondary">{journalSourceLabel(entry)}</Badge>
              </div>
            </TableCell>
            <TableCell>{formatNumber(entry.comparisonSummary.averageEntryPrice)}</TableCell>
            <TableCell>{formatNumber(entry.comparisonSummary.averageExitPrice)}</TableCell>
            <TableCell>{formatNumber(entry.comparisonSummary.realizedNetPnl)}</TableCell>
            <TableCell className="text-right">
              <Button type="button" size="icon" variant="ghost" onClick={() => void onDelete(entry)}>
                <Trash2 className="size-4" aria-hidden="true" />
                <span className="sr-only">Delete journal entry</span>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function journalSourceLabel(entry: TradeLabExecutionJournalEntry) {
  if (entry.plannedSnapshot?.source === "assisted_live_order") {
    return "Assisted live"
  }
  if (entry.plannedSnapshot?.source === "assisted_testnet_order") {
    return "Assisted testnet"
  }
  return "Manual"
}

function formNumber(form: FormData, key: string) {
  const value = Number(form.get(key) || 0)
  return Number.isFinite(value) ? value : 0
}

function formatNumber(value: number | null) {
  return value === null ? "N/A" : value.toLocaleString(undefined, { maximumFractionDigits: 4 })
}
