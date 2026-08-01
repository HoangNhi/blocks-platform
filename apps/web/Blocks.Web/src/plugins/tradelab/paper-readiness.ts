import type { TradeLabCredentialBoundaryStatus, TradeLabValidationStatus } from "./types"

export type TradeLabPaperReadinessStatus = "Ready" | "Missing" | "Warning" | "Not available yet"
export type TradeLabPaperReadinessSummary = "Locked"

export type TradeLabPaperReadinessInput = {
  validationStatus: TradeLabValidationStatus
  isDraftDirty: boolean
  isConfigDirty: boolean
  hasPaperDraft: boolean
  credentialBoundaryStatus: TradeLabCredentialBoundaryStatus
}

export type TradeLabPaperReadinessItem = {
  id:
    | "strategy-version-valid"
    | "draft-saved-versioned"
    | "runtime-risk-config-saved"
    | "dataset-preflight-ready"
    | "paper-draft-boundary"
    | "credential-boundary"
    | "runtime-safety"
    | "audit-order-simulation"
  label: string
  status: TradeLabPaperReadinessStatus
  description: string
}

function buildCredentialBoundaryReadiness(
  status: TradeLabCredentialBoundaryStatus,
): Pick<TradeLabPaperReadinessItem, "status" | "description"> {
  if (status === "read_only_ready") {
    return {
      status: "Ready",
      description: "Read-only credential boundary is declared without storing secrets.",
    }
  }

  if (status === "ip_not_restricted") {
    return {
      status: "Warning",
      description: "Restrict the exchange key to trusted IPs before paper readiness can pass.",
    }
  }

  if (status === "unsafe_permissions") {
    return {
      status: "Missing",
      description: "Disable trading, withdrawal, futures, and margin permissions before paper readiness can pass.",
    }
  }

  return {
    status: "Missing",
    description: "Confirm read-only credential boundary without entering key or secret.",
  }
}

export function buildTradeLabPaperReadinessItems({
  validationStatus,
  isDraftDirty,
  isConfigDirty,
  hasPaperDraft,
  credentialBoundaryStatus,
}: TradeLabPaperReadinessInput): TradeLabPaperReadinessItem[] {
  return [
    {
      id: "strategy-version-valid",
      label: "Strategy version valid",
      status: validationStatus === "valid" ? "Ready" : "Missing",
      description:
        validationStatus === "valid"
          ? "Current version passed syntax validation."
          : "Fix syntax validation before paper readiness can pass.",
    },
    {
      id: "draft-saved-versioned",
      label: "Draft saved/versioned",
      status: isDraftDirty ? "Missing" : "Ready",
      description: isDraftDirty
        ? "Create a version from current source changes."
        : "No unversioned source changes are pending.",
    },
    {
      id: "runtime-risk-config-saved",
      label: "Runtime/risk config saved",
      status: isConfigDirty ? "Missing" : "Ready",
      description: isConfigDirty
        ? "Save runtime and risk settings before readiness can pass."
        : "Runtime and risk settings have no unsaved changes.",
    },
    {
      id: "paper-draft-boundary",
      label: "Paper draft boundary",
      status: hasPaperDraft ? "Ready" : "Missing",
      description: hasPaperDraft
        ? "Paper draft is saved without runtime execution."
        : "Save a paper draft before readiness can pass.",
    },
    {
      id: "dataset-preflight-ready",
      label: "Dataset preflight ready",
      status: "Not available yet",
      description: "Phase 4.2 does not run a paper-specific preflight.",
    },
    {
      id: "credential-boundary",
      label: "Credential boundary",
      ...buildCredentialBoundaryReadiness(credentialBoundaryStatus),
    },
    {
      id: "runtime-safety",
      label: "Runtime safety",
      status: "Ready",
      description: "Runtime safety contract is defined; paper execution remains locked.",
    },
    {
      id: "audit-order-simulation",
      label: "Audit/order simulation",
      status: "Not available yet",
      description: "Order simulation and audit flow are not designed yet.",
    },
  ]
}

export function getTradeLabPaperReadinessSummary(): TradeLabPaperReadinessSummary {
  return "Locked"
}
