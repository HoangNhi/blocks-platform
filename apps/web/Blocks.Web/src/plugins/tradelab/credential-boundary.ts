import type {
  TradeLabBotSummary,
  TradeLabCredentialBoundary,
  TradeLabCredentialBoundaryChecks,
  TradeLabCredentialBoundaryStatus,
} from "./types"

export const DEFAULT_CREDENTIAL_BOUNDARY_CHECKS: TradeLabCredentialBoundaryChecks = {
  readOnlyEnabled: false,
  tradingDisabled: false,
  withdrawDisabled: false,
  futuresMarginDisabled: false,
  ipRestricted: false,
}

const ALLOWED_CREDENTIAL_BOUNDARY_STATUSES: TradeLabCredentialBoundaryStatus[] = [
  "missing",
  "read_only_ready",
  "unsafe_permissions",
  "ip_not_restricted",
  "not_verified",
]

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function booleanValue(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback
}

function statusValue(value: unknown): TradeLabCredentialBoundaryStatus {
  return typeof value === "string" &&
    ALLOWED_CREDENTIAL_BOUNDARY_STATUSES.includes(value as TradeLabCredentialBoundaryStatus)
    ? (value as TradeLabCredentialBoundaryStatus)
    : "missing"
}

export function deriveCredentialBoundaryStatus(
  checks: TradeLabCredentialBoundaryChecks,
): TradeLabCredentialBoundaryStatus {
  if (!checks.readOnlyEnabled) {
    return "not_verified"
  }
  if (!checks.tradingDisabled || !checks.withdrawDisabled || !checks.futuresMarginDisabled) {
    return "unsafe_permissions"
  }
  if (!checks.ipRestricted) {
    return "ip_not_restricted"
  }
  return "read_only_ready"
}

export function normalizeCredentialBoundaryChecks(value: unknown): TradeLabCredentialBoundaryChecks {
  const record = asRecord(value)
  return {
    readOnlyEnabled: booleanValue(record.readOnlyEnabled),
    tradingDisabled: booleanValue(record.tradingDisabled),
    withdrawDisabled: booleanValue(record.withdrawDisabled),
    futuresMarginDisabled: booleanValue(record.futuresMarginDisabled),
    ipRestricted: booleanValue(record.ipRestricted),
  }
}

export function normalizeCredentialBoundaryFromBot(
  bot: TradeLabBotSummary | null,
): TradeLabCredentialBoundary {
  const rawBoundary = asRecord(bot?.metadata?.credentialBoundary)
  if (!bot || Object.keys(rawBoundary).length === 0) {
    return {
      exchange: "binance",
      status: "missing",
      checks: DEFAULT_CREDENTIAL_BOUNDARY_CHECKS,
      updatedAt: null,
    }
  }

  const checks = normalizeCredentialBoundaryChecks(rawBoundary.checks)
  const status = statusValue(rawBoundary.status)
  return {
    exchange: "binance",
    status: status === "missing" ? deriveCredentialBoundaryStatus(checks) : status,
    checks,
    updatedAt: typeof rawBoundary.updatedAt === "string" ? rawBoundary.updatedAt : null,
  }
}

export function buildCredentialBoundaryMetadata(
  checks: TradeLabCredentialBoundaryChecks,
  updatedAt = new Date().toISOString(),
) {
  return {
    credentialBoundary: {
      exchange: "binance",
      status: deriveCredentialBoundaryStatus(checks),
      checks,
      updatedAt,
    },
  }
}
