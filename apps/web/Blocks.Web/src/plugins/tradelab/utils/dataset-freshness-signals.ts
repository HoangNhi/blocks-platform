export type DatasetFreshnessSignalStatus = "pass" | "warning" | "fail" | "unknown"

export type DatasetFreshnessSignalTone = "ok" | "warning" | "danger" | "info"

export type DatasetFreshnessSignalReason =
  | "fresh"
  | "slightly_stale"
  | "stale"
  | "missing_freshness_timestamps"
  | "recently_checked"
  | "check_stale"
  | "missing_last_checked_at"
  | "no_gaps"
  | "few_gaps"
  | "many_gaps"
  | "missing_gap_counts"
  | "coverage_end_available"
  | "missing_coverage_end"

export type DatasetFreshnessSignal = {
  id: "freshness" | "check_age" | "gap_severity" | "coverage_end"
  label: string
  status: DatasetFreshnessSignalStatus
  tone: DatasetFreshnessSignalTone
  reason: DatasetFreshnessSignalReason
  description: string
}

export type DatasetFreshnessSignalInput = {
  coveredEndAt?: string | null
  latestOpenTime?: string | null
  lastCheckedAt?: string | null
  gapCount?: number | null
  segmentCount?: number | null
  requestedEndAt?: string | null
  now?: Date
}

const FRESHNESS_NEAR_MS = 60 * 1000
const FRESHNESS_WARNING_MS = 24 * 60 * 60 * 1000
const CHECK_AGE_STALE_MS = 10 * 60 * 1000
const MANY_GAPS_THRESHOLD = 5
const HIGH_GAP_RATIO = 0.5

export function buildDatasetFreshnessSignals(input: DatasetFreshnessSignalInput): DatasetFreshnessSignal[] {
  return [
    buildFreshnessSignal(input),
    buildCheckAgeSignal(input),
    buildGapSeveritySignal(input),
    buildCoverageEndSignal(input),
  ]
}

function buildFreshnessSignal(input: DatasetFreshnessSignalInput): DatasetFreshnessSignal {
  const coverageEnd = parseDate(input.coveredEndAt) ?? parseDate(input.latestOpenTime)
  const requestedEnd = parseDate(input.requestedEndAt)

  if (!coverageEnd || !requestedEnd) {
    return {
      id: "freshness",
      label: "Freshness",
      status: "unknown",
      tone: "info",
      reason: "missing_freshness_timestamps",
      description: "Freshness cannot be derived without both a coverage end and requested end timestamp.",
    }
  }

  const lagMs = requestedEnd.getTime() - coverageEnd.getTime()

  if (lagMs <= FRESHNESS_NEAR_MS) {
    return {
      id: "freshness",
      label: "Freshness",
      status: "pass",
      tone: "ok",
      reason: "fresh",
      description: `Coverage reaches the requested end (${formatIso(coverageEnd)} vs ${formatIso(requestedEnd)}).`,
    }
  }

  if (lagMs <= FRESHNESS_WARNING_MS) {
    return {
      id: "freshness",
      label: "Freshness",
      status: "warning",
      tone: "warning",
      reason: "slightly_stale",
      description: `Coverage is behind the requested end by ${formatDuration(lagMs)}.`,
    }
  }

  return {
    id: "freshness",
    label: "Freshness",
    status: "fail",
    tone: "danger",
    reason: "stale",
    description: `Coverage is behind the requested end by ${formatDuration(lagMs)}.`,
  }
}

function buildCheckAgeSignal(input: DatasetFreshnessSignalInput): DatasetFreshnessSignal {
  const checkedAt = parseDate(input.lastCheckedAt)

  if (!checkedAt) {
    return {
      id: "check_age",
      label: "Check age",
      status: "unknown",
      tone: "info",
      reason: "missing_last_checked_at",
      description: "Last checked timestamp is not available for this dataset snapshot.",
    }
  }

  const now = input.now ?? new Date()
  const ageMs = Math.max(0, now.getTime() - checkedAt.getTime())

  if (ageMs <= CHECK_AGE_STALE_MS) {
    return {
      id: "check_age",
      label: "Check age",
      status: "pass",
      tone: "ok",
      reason: "recently_checked",
      description: `Dataset was checked ${formatDuration(ageMs)} ago.`,
    }
  }

  return {
    id: "check_age",
    label: "Check age",
    status: "warning",
    tone: "warning",
    reason: "check_stale",
    description: `Dataset was last checked ${formatDuration(ageMs)} ago.`,
  }
}

function buildGapSeveritySignal(input: DatasetFreshnessSignalInput): DatasetFreshnessSignal {
  const gapCount = input.gapCount
  const segmentCount = input.segmentCount

  if (gapCount === null || gapCount === undefined || !Number.isFinite(gapCount)) {
    return {
      id: "gap_severity",
      label: "Gap severity",
      status: "unknown",
      tone: "info",
      reason: "missing_gap_counts",
      description: "Gap count is not available for this dataset snapshot.",
    }
  }

  if (gapCount <= 0) {
    return {
      id: "gap_severity",
      label: "Gap severity",
      status: "pass",
      tone: "ok",
      reason: "no_gaps",
      description: "No coverage gaps are recorded for this dataset snapshot.",
    }
  }

  const hasSegmentContext = segmentCount !== null && segmentCount !== undefined && Number.isFinite(segmentCount) && segmentCount > 0
  const gapRatio = hasSegmentContext ? gapCount / segmentCount : 0

  if (gapCount >= MANY_GAPS_THRESHOLD || gapRatio >= HIGH_GAP_RATIO) {
    return {
      id: "gap_severity",
      label: "Gap severity",
      status: "fail",
      tone: "danger",
      reason: "many_gaps",
      description: hasSegmentContext
        ? `${gapCount} gaps across ${segmentCount} active segments require attention before trusting this dataset.`
        : `${gapCount} gaps are recorded; segment context is not available.`,
    }
  }

  return {
    id: "gap_severity",
    label: "Gap severity",
    status: "warning",
    tone: "warning",
    reason: "few_gaps",
    description: hasSegmentContext
      ? `${gapCount} gaps across ${segmentCount} active segments need attention.`
      : `${gapCount} gaps are recorded; segment context is not available.`,
  }
}

function buildCoverageEndSignal(input: DatasetFreshnessSignalInput): DatasetFreshnessSignal {
  const coverageEnd = parseDate(input.coveredEndAt) ?? parseDate(input.latestOpenTime)

  if (!coverageEnd) {
    return {
      id: "coverage_end",
      label: "Coverage end",
      status: "unknown",
      tone: "info",
      reason: "missing_coverage_end",
      description: "No coverage end or latest open timestamp is available.",
    }
  }

  return {
    id: "coverage_end",
    label: "Coverage end",
    status: "pass",
    tone: "ok",
    reason: "coverage_end_available",
    description: `Latest available dataset timestamp is ${formatIso(coverageEnd)}.`,
  }
}

function parseDate(value?: string | null) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date
}

function formatIso(value: Date) {
  return value.toISOString().replace(".000Z", "Z")
}

function formatDuration(ms: number) {
  const safeMs = Math.max(0, ms)
  const minutes = Math.ceil(safeMs / (60 * 1000))

  if (minutes <= 1) return "1 minute"
  if (minutes < 60) return `${minutes} minutes`

  const hours = Math.ceil(minutes / 60)
  if (hours <= 1) return "1 hour"
  if (hours < 24) return `${hours} hours`

  const days = Math.ceil(hours / 24)
  return days === 1 ? "1 day" : `${days} days`
}
