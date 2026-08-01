import type { TradeLabPreflightResult, TradeLabRunPipeline } from "../types"
import {
  buildDatasetQualitySignals,
  type DatasetQualitySignal,
  type DatasetQualitySignalTone,
} from "./dataset-quality-signals"

export type DatasetReadinessGateStatus = "not_checked" | "ready" | "attention" | "blocked"

export type DatasetReadinessGateReason =
  | "runtime_error"
  | "pipeline_failed"
  | "preflight_blocked"
  | "coverage_blocked"
  | "missing_segments"
  | "preflight_needs_fill"
  | "preflight_needs_repair"
  | "quality_signal_danger"
  | "quality_signal_warning"
  | "ready"
  | "not_checked"

export type DatasetReadinessGate = {
  status: DatasetReadinessGateStatus
  label: string
  tone: DatasetQualitySignalTone
  reason: DatasetReadinessGateReason
  description: string
  signals: DatasetQualitySignal[]
}

type DatasetReadinessGateInput = {
  preflight: TradeLabPreflightResult | null
  pipeline: TradeLabRunPipeline | null
  runtimeErrorMessage?: string | null
}

const gateCopy: Record<
  DatasetReadinessGateReason,
  {
    status: DatasetReadinessGateStatus
    label: string
    tone: DatasetQualitySignalTone
    description: string
  }
> = {
  runtime_error: {
    status: "blocked",
    label: "Blocked",
    tone: "danger",
    description: "Runtime error blocks reliable dataset use.",
  },
  pipeline_failed: {
    status: "blocked",
    label: "Blocked",
    tone: "danger",
    description: "The latest run pipeline failed before dataset readiness could be trusted.",
  },
  preflight_blocked: {
    status: "blocked",
    label: "Blocked",
    tone: "danger",
    description: "Preflight blocked the current dataset target.",
  },
  coverage_blocked: {
    status: "blocked",
    label: "Blocked",
    tone: "danger",
    description: "Dataset coverage is blocked until the coverage issue is resolved.",
  },
  missing_segments: {
    status: "attention",
    label: "Attention",
    tone: "warning",
    description: "Dataset has missing windows before the current target can be treated as fully ready.",
  },
  preflight_needs_fill: {
    status: "attention",
    label: "Attention",
    tone: "warning",
    description: "Preflight found missing coverage that needs fill before the target is fully ready.",
  },
  preflight_needs_repair: {
    status: "attention",
    label: "Attention",
    tone: "warning",
    description: "Preflight found coverage that needs repair before relying on this target.",
  },
  quality_signal_danger: {
    status: "attention",
    label: "Attention",
    tone: "warning",
    description: "A dataset quality signal is blocked and needs attention before relying on this run.",
  },
  quality_signal_warning: {
    status: "attention",
    label: "Attention",
    tone: "warning",
    description: "Dataset quality signals need attention before relying on this run.",
  },
  ready: {
    status: "ready",
    label: "Ready",
    tone: "ok",
    description: "Dataset coverage and quality signals are ready for the current target.",
  },
  not_checked: {
    status: "not_checked",
    label: "Not checked",
    tone: "info",
    description: "Run preflight first.",
  },
}

export function buildDatasetReadinessGate({
  preflight,
  pipeline,
  runtimeErrorMessage = null,
}: DatasetReadinessGateInput): DatasetReadinessGate {
  const signals = preflight?.coverage ? buildDatasetQualitySignals(preflight.coverage) : []

  if (runtimeErrorMessage) return makeGate("runtime_error", signals)
  if (pipeline?.status === "failed") return makeGate("pipeline_failed", signals)
  if (preflight?.outcome === "blocked") return makeGate("preflight_blocked", signals)
  if (preflight?.coverage?.healthStatus === "blocked") return makeGate("coverage_blocked", signals)
  if (!preflight) return makeGate("not_checked", signals)
  if (preflight.missingSegments.length > 0) return makeGate("missing_segments", signals)
  if (preflight.outcome === "needs_fill") return makeGate("preflight_needs_fill", signals)
  if (preflight.outcome === "needs_repair") return makeGate("preflight_needs_repair", signals)
  if (signals.some((signal) => signal.tone === "danger")) return makeGate("quality_signal_danger", signals)
  if (signals.some((signal) => signal.tone === "warning")) return makeGate("quality_signal_warning", signals)
  return makeGate("ready", signals)
}

function makeGate(reason: DatasetReadinessGateReason, signals: DatasetQualitySignal[]): DatasetReadinessGate {
  return {
    ...gateCopy[reason],
    reason,
    signals,
  }
}
