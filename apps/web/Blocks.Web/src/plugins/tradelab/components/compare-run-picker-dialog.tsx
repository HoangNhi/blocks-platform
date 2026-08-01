import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"

import type { TradeLabRunHistoryEntry } from "../types"
import { formatDateTime } from "../utils"

type CompareRunPickerDialogProps = {
  open: boolean
  baseRun: TradeLabRunHistoryEntry | null
  candidates: TradeLabRunHistoryEntry[]
  onSelectRun: (runId: string) => void
  onOpenChange: (open: boolean) => void
}

export function CompareRunPickerDialog({
  open,
  baseRun,
  candidates = [],
  onSelectRun,
  onOpenChange,
}: CompareRunPickerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Compare with another completed run</DialogTitle>
          <DialogDescription>
            Choose a completed run from the same strategy to enter compare mode.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          {baseRun ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">Run A</Badge>
                <strong className="text-slate-900">
                  {baseRun.symbol} · {baseRun.timeframe}
                </strong>
                <span className="text-slate-500">
                  {formatDateTime(baseRun.startAt)} → {formatDateTime(baseRun.endAt)}
                </span>
              </div>
            </div>
          ) : null}

          {candidates.length === 0 ? (
            <div className="grid gap-2 rounded-xl border border-dashed border-slate-200 p-6 text-sm text-slate-500">
              <strong className="text-slate-900">No other completed runs available.</strong>
              <span>Run history must contain at least one more completed run from the same strategy.</span>
            </div>
          ) : (
            <ScrollArea className="max-h-[360px] pr-3">
              <div className="grid gap-3">
                {candidates.map((run) => (
                  <button
                    key={run.id}
                    type="button"
                    onClick={() => onSelectRun(run.id)}
                    className="grid gap-2 rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-blue-300 hover:bg-blue-50/40"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">Completed</Badge>
                        <Badge variant="outline">{run.pipelineStatus}</Badge>
                        <strong className="text-slate-900">
                          {run.symbol} · {run.timeframe}
                        </strong>
                      </div>
                      <span className="text-xs text-slate-500">{formatDateTime(run.createdAt)}</span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
                      <span>
                        {formatDateTime(run.startAt)} → {formatDateTime(run.endAt)}
                      </span>
                      <span>Strategy {run.strategyVersionId}</span>
                    </div>
                    {run.errorMessage ? <span className="text-xs text-rose-600">{run.errorMessage}</span> : null}
                  </button>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
