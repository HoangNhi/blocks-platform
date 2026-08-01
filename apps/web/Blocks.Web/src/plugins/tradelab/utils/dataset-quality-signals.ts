import type { TradeLabCoverageHealth } from "../types"

export type DatasetQualitySignalTone = "ok" | "warning" | "danger" | "info"

export type DatasetQualitySignal = {
  id: "health" | "coverageRange" | "gapsSegments" | "metadataSafety"
  label: string
  status: string
  tone: DatasetQualitySignalTone
  description: string
}

export type DatasetQualitySignalCoverageInput = {
  healthStatus: TradeLabCoverageHealth | string
  coveredStartAt: string | null
  coveredEndAt: string | null
  segmentCount: number
  gapCount: number
}

type HealthSignalCopy = {
  status: string
  tone: DatasetQualitySignalTone
  description: string
}

const healthSignalCopy: Record<string, HealthSignalCopy> = {
  healthy: {
    status: "Healthy",
    tone: "ok",
    description: "Dataset coverage is healthy for indexed candles.",
  },
  incomplete: {
    status: "Incomplete",
    tone: "warning",
    description: "Dataset has incomplete coverage and may need more indexed candles before some runs.",
  },
  suspect: {
    status: "Suspect",
    tone: "warning",
    description: "Dataset integrity needs attention before relying on the full coverage range.",
  },
  blocked: {
    status: "Blocked",
    tone: "danger",
    description: "Dataset is blocked for current usage until the coverage issue is resolved.",
  },
}

export function buildDatasetQualitySignals(item: DatasetQualitySignalCoverageInput): DatasetQualitySignal[] {
  return [
    buildHealthSignal(item.healthStatus),
    buildCoverageRangeSignal(item),
    buildGapsSegmentsSignal(item),
    {
      id: "metadataSafety",
      label: "Metadata safety",
      status: "Sanitized",
      tone: "info",
      description: "Catalog metadata is sanitized and read-only; this view does not expose credential secrets.",
    },
  ]
}

function buildHealthSignal(healthStatus: string): DatasetQualitySignal {
  const copy = healthSignalCopy[healthStatus] ?? {
    status: "Unknown",
    tone: "warning" as const,
    description: `Unknown dataset health '${healthStatus}' was returned by the API.`,
  }

  return {
    id: "health",
    label: "Health",
    ...copy,
  }
}

function buildCoverageRangeSignal(item: DatasetQualitySignalCoverageInput): DatasetQualitySignal {
  const start = formatSignalDate(item.coveredStartAt)
  const end = formatSignalDate(item.coveredEndAt)

  if (!item.coveredStartAt || !item.coveredEndAt) {
    return {
      id: "coverageRange",
      label: "Coverage range",
      status: "Range incomplete",
      tone: "warning",
      description: `Coverage range is missing start or end timestamps (${start} to ${end}).`,
    }
  }

  return {
    id: "coverageRange",
    label: "Coverage range",
    status: "Range indexed",
    tone: "ok",
    description: `Coverage range is indexed from ${start} to ${end}.`,
  }
}

function buildGapsSegmentsSignal(item: DatasetQualitySignalCoverageInput): DatasetQualitySignal {
  if (item.segmentCount <= 0) {
    return {
      id: "gapsSegments",
      label: "Gaps and segments",
      status: "No segments",
      tone: "warning",
      description: `No active coverage segments are recorded; gaps: ${item.gapCount}.`,
    }
  }

  if (item.gapCount > 0) {
    return {
      id: "gapsSegments",
      label: "Gaps and segments",
      status: "Gaps present",
      tone: "warning",
      description: `${item.gapCount} gaps across ${item.segmentCount} active segments.`,
    }
  }

  return {
    id: "gapsSegments",
    label: "Gaps and segments",
    status: "Continuous",
    tone: "ok",
    description: `No gaps recorded across ${item.segmentCount} active segment${item.segmentCount === 1 ? "" : "s"}.`,
  }
}

function formatSignalDate(value: string | null) {
  if (!value) return "N/A"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toISOString().replace(".000Z", "Z")
}
