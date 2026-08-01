import CodeMirror from "@uiw/react-codemirror"
import { python } from "@codemirror/lang-python"
import { EditorView } from "@codemirror/view"
import { GitBranchPlus, Play, ShieldCheck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import type { TradeLabStrategyValidationCheck } from "../types"

type StrategyCodeEditorProps = {
  sourceCode: string
  validationMessage: string | null
  validationCheck: TradeLabStrategyValidationCheck | null
  actionMessage?: string | null
  isCreateVersionDisabled?: boolean
  isRunDisabled?: boolean
  isRunningBacktest?: boolean
  isDraftDirty?: boolean
  isCheckingSyntax?: boolean
  runDisabledReason?: string | null
  onChange: (sourceCode: string) => void
  onCheckSyntax: () => void
  onCreateVersion: () => void
  onRunBacktest: () => void
}

export function StrategyCodeEditor({
  sourceCode,
  validationMessage,
  validationCheck,
  actionMessage,
  isCreateVersionDisabled = false,
  isRunDisabled = false,
  isRunningBacktest = false,
  isDraftDirty = false,
  isCheckingSyntax = false,
  runDisabledReason,
  onChange,
  onCheckSyntax,
  onCreateVersion,
  onRunBacktest,
}: StrategyCodeEditorProps) {
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-platform-muted">
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-1 font-medium text-blue-700">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            Python strategy
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-1">
            Backend-backed source editor
          </span>
          {isDraftDirty ? <Badge variant="secondary">Draft changed</Badge> : null}
          {validationCheck ? (
            <Badge className={validationCheck.validationStatus === "valid" ? "bg-emerald-600 hover:bg-emerald-600" : "bg-rose-600 hover:bg-rose-600"}>
              {validationCheck.validationStatus === "valid" ? "Validation valid" : "Validation invalid"}
            </Badge>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onCheckSyntax} disabled={isCheckingSyntax}>
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            {isCheckingSyntax ? "Checking..." : "Check syntax"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCreateVersion}
            disabled={isCreateVersionDisabled}
          >
            <GitBranchPlus className="size-3.5" aria-hidden="true" />
            Create version
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onRunBacktest}
            disabled={isRunDisabled || isRunningBacktest}
          >
            <Play className="size-3.5" aria-hidden="true" />
            {isRunningBacktest ? "Running..." : "Review settings"}
          </Button>
        </div>
      </div>

      {validationCheck?.validationMessage ? (
        <div className="rounded-lg border border-platform-border bg-platform-surface-muted px-3 py-2 text-xs text-platform-muted">
          {validationCheck.validationMessage}
          {validationCheck.line ? ` Line ${validationCheck.line}${validationCheck.column ? `, column ${validationCheck.column}` : ""}.` : ""}
        </div>
      ) : validationMessage ? (
        <div className="rounded-lg border border-platform-border bg-platform-surface-muted px-3 py-2 text-xs text-platform-muted">
          {validationMessage}
        </div>
      ) : null}

      {actionMessage ? (
        <div
          className={cn(
            "rounded-lg border px-3 py-2 text-xs",
            actionMessage.toLowerCase().includes("failed") ||
              actionMessage.toLowerCase().includes("error")
              ? "border-rose-200 bg-rose-50 text-rose-700"
              : "border-blue-200 bg-blue-50 text-blue-700",
          )}
        >
          {actionMessage}
        </div>
      ) : null}

      {runDisabledReason ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          {runDisabledReason}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-platform-border bg-[#0f172a] shadow-sm">
        <CodeMirror
          value={sourceCode}
          height="480px"
          theme="light"
          extensions={[python(), EditorView.lineWrapping]}
          onChange={onChange}
          basicSetup={{
            lineNumbers: true,
            foldGutter: false,
            highlightActiveLine: true,
            highlightSelectionMatches: true,
            autocompletion: true,
          }}
        />
      </div>
    </div>
  )
}
