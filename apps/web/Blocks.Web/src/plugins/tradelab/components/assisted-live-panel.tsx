import { Ban, CheckCircle2, Eye, LoaderCircle, RefreshCw, RotateCw, Search, ShieldCheck, XCircle } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"

import type {
  TradeLabLiveOrderIntent,
  TradeLabLiveOrderList,
  TradeLabLiveOrderOperationResult,
  TradeLabLiveOrderPreviewResult,
} from "../types"

type AssistedLivePanelProps = {
  side: "buy" | "sell"
  sizeMode: "base" | "quote"
  amount: string
  credentialRefId: string
  symbol: string
  preview?: TradeLabLiveOrderPreviewResult | null
  previewError?: string | null
  list?: TradeLabLiveOrderList | null
  listError?: string | null
  sourceReady: boolean
  sourceReadyLabel?: string
  previewDisabledReason?: string | null
  submitResult?: TradeLabLiveOrderOperationResult | null
  submitError?: string | null
  cancelResult?: TradeLabLiveOrderOperationResult | null
  cancelError?: string | null
  reconcileResult?: TradeLabLiveOrderOperationResult | null
  reconcileError?: string | null
  isPreviewLoading?: boolean
  isListLoading?: boolean
  isSubmitting?: boolean
  isCancelling?: boolean
  isReconciling?: boolean
  canConfirmSubmit?: boolean
  canCancel?: boolean
  canReconcile?: boolean
  selectedIntent?: TradeLabLiveOrderIntent | null
  onSideChange?: (value: "buy" | "sell") => void
  onSizeModeChange?: (value: "base" | "quote") => void
  onAmountChange?: (value: string) => void
  onCredentialRefIdChange?: (value: string) => void
  onPreview?: () => void
  onConfirmSubmit?: () => void
  onCancelOrder?: () => void
  onReconcile?: () => void
  onRefreshList?: () => void
  onLoadDetail?: (orderId: string) => void
}

export function AssistedLivePanel({
  side,
  sizeMode,
  amount,
  credentialRefId,
  symbol,
  preview = null,
  previewError = null,
  list = null,
  listError = null,
  sourceReady,
  sourceReadyLabel,
  previewDisabledReason = null,
  submitResult = null,
  submitError = null,
  cancelResult = null,
  cancelError = null,
  reconcileResult = null,
  reconcileError = null,
  isPreviewLoading = false,
  isListLoading = false,
  isSubmitting = false,
  isCancelling = false,
  isReconciling = false,
  canConfirmSubmit = false,
  canCancel = false,
  canReconcile = false,
  selectedIntent = null,
  onSideChange,
  onSizeModeChange,
  onAmountChange,
  onCredentialRefIdChange,
  onPreview,
  onConfirmSubmit,
  onCancelOrder,
  onReconcile,
  onRefreshList,
  onLoadDetail,
}: AssistedLivePanelProps) {
  const canPreview = !previewDisabledReason && !isPreviewLoading
  const sourceLabel = sourceReadyLabel ?? (sourceReady ? "Completed source" : "Completed-run required")

  return (
    <Card>
      <CardHeader className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4 text-sky-600" aria-hidden="true" />
              Assisted Live
            </CardTitle>
            <p className="mt-1 text-xs text-slate-500">Binance Spot Live order readiness.</p>
          </div>
          <Badge variant={sourceReady ? "default" : "secondary"}>{sourceLabel}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <Eye className="size-4" aria-hidden="true" />
          <AlertTitle>Completed-run required</AlertTitle>
          <AlertDescription>
            Assisted live preview, submit, cancel, and reconcile stay tiny-risk and explicit-confirm. No raw API key or secret is entered here.
          </AlertDescription>
        </Alert>

        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <label className="text-xs font-medium text-slate-700" htmlFor="live-credential-ref">
              Credential reference ID
            </label>
            <Input
              id="live-credential-ref"
              value={credentialRefId}
              onChange={(event) => onCredentialRefIdChange?.(event.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-slate-700">Side</label>
              <Select value={side} onValueChange={(value) => onSideChange?.(value as "buy" | "sell")}>
                <SelectTrigger aria-label="Live order side">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="buy">Buy</SelectItem>
                  <SelectItem value="sell">Sell</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-medium text-slate-700">Size</label>
              <Select value={sizeMode} onValueChange={(value) => onSizeModeChange?.(value as "base" | "quote")}>
                <SelectTrigger aria-label="Live order size mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="quote">Quote</SelectItem>
                  <SelectItem value="base">Base</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <label className="text-xs font-medium text-slate-700" htmlFor="live-order-amount">
              Amount ({sizeMode === "quote" ? "USDT" : symbol.replace(/USDT$/i, "") || "base"})
            </label>
            <Input
              id="live-order-amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => onAmountChange?.(event.target.value)}
              placeholder={sizeMode === "quote" ? "25" : "0.001"}
            />
          </div>

          <Button type="button" onClick={onPreview} disabled={!canPreview} className="w-full">
            {isPreviewLoading ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <Search className="mr-2 size-4" />}
            Preview live order
          </Button>
          {previewDisabledReason ? <p className="text-xs text-slate-500">{previewDisabledReason}</p> : null}
        </div>

        {previewError ? <p className="break-words text-xs text-rose-600">{previewError}</p> : null}
        {preview ? (
          <div className="rounded-md border p-3 text-xs">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-slate-700">Latest preview</span>
              <Badge variant={preview.allowed ? "default" : "secondary"}>{preview.status || preview.reasonCode}</Badge>
            </div>
            <p className="mt-2 break-all text-slate-600">clientOrderId: {preview.clientOrderId ?? "-"}</p>
            <p className="mt-1 break-all text-slate-600">intentId: {preview.intentId ?? "-"}</p>
          </div>
        ) : null}

        <div className="grid gap-2">
          <ConfirmActionDialog
            triggerLabel="Confirm submit"
            title="Confirm Binance Spot Live submit"
            description="Binance Spot Live only. This submits the previewed live order with explicit confirmation and does not expose raw credentials."
            confirmLabel="Submit live order"
            disabled={!canConfirmSubmit}
            loading={isSubmitting}
            icon="submit"
            onConfirm={onConfirmSubmit}
          />
          <ConfirmActionDialog
            triggerLabel="Cancel"
            title="Cancel Binance Spot Live order"
            description="Binance Spot Live only. This requests cancellation for the selected live order and does not touch testnet state."
            confirmLabel="Cancel live order"
            disabled={!canCancel}
            loading={isCancelling}
            icon="cancel"
            onConfirm={onCancelOrder}
          />
          <ConfirmActionDialog
            triggerLabel="Reconcile"
            title="Reconcile Binance Spot Live order"
            description="Binance Spot Live only. This reads exchange evidence for the selected live order and updates local evidence."
            confirmLabel="Reconcile live order"
            disabled={!canReconcile}
            loading={isReconciling}
            icon="reconcile"
            onConfirm={onReconcile}
          />
          {selectedIntent ? <p className="break-all text-xs text-slate-500">selectedIntent: {selectedIntent.intentId}</p> : null}
        </div>

        <OperationResult label="Submit" result={submitResult} error={submitError} />
        <OperationResult label="Cancel" result={cancelResult} error={cancelError} />
        <OperationResult label="Reconcile" result={reconcileResult} error={reconcileError} />

        <Separator />

        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-slate-800">Recent previews</h3>
          <Button type="button" variant="ghost" size="sm" onClick={onRefreshList} disabled={isListLoading}>
            {isListLoading ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
          </Button>
        </div>
        {listError ? <p className="break-words text-xs text-rose-600">{listError}</p> : null}
        {isListLoading ? <Skeleton className="h-16 w-full" /> : null}
        <div className="grid gap-2">
          {(list?.items ?? []).slice(0, 5).map((item) => (
            <button
              key={item.intent.intentId}
              type="button"
              className="rounded-md border p-2 text-left text-xs hover:bg-slate-50"
              onClick={() => onLoadDetail?.(item.intent.intentId)}
            >
              <span className="font-medium text-slate-800">{item.intent.symbol} {item.intent.side}</span>
              <span className="block break-all text-slate-500">{item.intent.clientOrderId}</span>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function ConfirmActionDialog({
  triggerLabel,
  title,
  description,
  confirmLabel,
  disabled,
  loading,
  icon,
  onConfirm,
}: {
  triggerLabel: string
  title: string
  description: string
  confirmLabel: string
  disabled: boolean
  loading: boolean
  icon: "submit" | "cancel" | "reconcile"
  onConfirm?: () => void
}) {
  const Icon = icon === "submit" ? CheckCircle2 : icon === "cancel" ? XCircle : RotateCw

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant={icon === "submit" ? "default" : "outline"} disabled={disabled} className="w-full justify-start">
          {loading ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <Icon className="mr-2 size-4" />}
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" onClick={onConfirm} disabled={loading}>
            {loading ? <LoaderCircle className="mr-2 size-4 animate-spin" /> : <Ban className="mr-2 size-4" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function OperationResult({
  label,
  result,
  error,
}: {
  label: string
  result?: TradeLabLiveOrderOperationResult | null
  error?: string | null
}) {
  if (!result && !error) return null
  return (
    <div className="rounded-md border p-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-slate-700">{label}</span>
        {result ? <Badge variant="outline">{result.status}</Badge> : null}
      </div>
      {result ? <p className="mt-2 break-all text-slate-600">reason: {result.reasonCode}</p> : null}
      {error ? <p className="mt-2 break-words text-rose-600">{error}</p> : null}
    </div>
  )
}
