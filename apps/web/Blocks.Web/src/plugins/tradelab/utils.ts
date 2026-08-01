import type { TradeLabValidationStatus, TradeLabLogLevel, TradeLabOrderStatus, TradeLabPreflightSourceSummary, TradeLabRunStatus } from "./types"

export function formatSourceSummary(items: TradeLabPreflightSourceSummary[]): string {
  return items.length > 0
    ? items.map((item) => `${item.source} (${item.rowCount})`).join(", ")
    : "No candles in requested range"
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatPercent(value: number) {
  return `${value.toFixed(2)}%`
}

export function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value))
}

export function validationTone(status: TradeLabValidationStatus) {
  if (status === "valid") return "success"
  if (status === "invalid") return "danger"
  return "warning"
}

export function runTone(status: TradeLabRunStatus) {
  if (status === "completed") return "success"
  if (status === "failed" || status === "cancelled") return "danger"
  if (status === "running" || status === "queued") return "info"
  return "neutral"
}

export function logTone(level: TradeLabLogLevel) {
  if (level === "error") return "danger"
  if (level === "warning") return "warning"
  if (level === "info") return "info"
  return "neutral"
}

export function orderTone(status: TradeLabOrderStatus) {
  if (status === "filled") return "success"
  if (status === "accepted") return "info"
  if (status === "rejected") return "danger"
  return "neutral"
}
