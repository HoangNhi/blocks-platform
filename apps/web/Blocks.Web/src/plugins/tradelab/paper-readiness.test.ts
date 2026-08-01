import { describe, expect, it } from "vitest"

import {
  buildTradeLabPaperReadinessItems,
  getTradeLabPaperReadinessSummary,
} from "./paper-readiness"

describe("TradeLab paper readiness", () => {
  it("marks current frontend-ready items as ready and keeps unsupported paper systems locked", () => {
    const items = buildTradeLabPaperReadinessItems({
      validationStatus: "valid",
      isDraftDirty: false,
      isConfigDirty: false,
      hasPaperDraft: true,
      credentialBoundaryStatus: "read_only_ready",
    })

    expect(getTradeLabPaperReadinessSummary()).toBe("Locked")
    expect(items).toEqual([
      {
        id: "strategy-version-valid",
        label: "Strategy version valid",
        status: "Ready",
        description: "Current version passed syntax validation.",
      },
      {
        id: "draft-saved-versioned",
        label: "Draft saved/versioned",
        status: "Ready",
        description: "No unversioned source changes are pending.",
      },
      {
        id: "runtime-risk-config-saved",
        label: "Runtime/risk config saved",
        status: "Ready",
        description: "Runtime and risk settings have no unsaved changes.",
      },
      {
        id: "paper-draft-boundary",
        label: "Paper draft boundary",
        status: "Ready",
        description: "Paper draft is saved without runtime execution.",
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
        status: "Ready",
        description: "Read-only credential boundary is declared without storing secrets.",
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
    ])
  })

  it("marks editable current-state items as missing when the strategy is not ready", () => {
    const items = buildTradeLabPaperReadinessItems({
      validationStatus: "invalid",
      isDraftDirty: true,
      isConfigDirty: true,
      hasPaperDraft: false,
      credentialBoundaryStatus: "missing",
    })

    expect(items.slice(0, 4)).toEqual([
      {
        id: "strategy-version-valid",
        label: "Strategy version valid",
        status: "Missing",
        description: "Fix syntax validation before paper readiness can pass.",
      },
      {
        id: "draft-saved-versioned",
        label: "Draft saved/versioned",
        status: "Missing",
        description: "Create a version from current source changes.",
      },
      {
        id: "runtime-risk-config-saved",
        label: "Runtime/risk config saved",
        status: "Missing",
        description: "Save runtime and risk settings before readiness can pass.",
      },
      {
        id: "paper-draft-boundary",
        label: "Paper draft boundary",
        status: "Missing",
        description: "Save a paper draft before readiness can pass.",
      },
    ])
  })

  it("maps credential boundary warning and unsafe states", () => {
    const ipWarning = buildTradeLabPaperReadinessItems({
      validationStatus: "valid",
      isDraftDirty: false,
      isConfigDirty: false,
      hasPaperDraft: true,
      credentialBoundaryStatus: "ip_not_restricted",
    }).find((item) => item.id === "credential-boundary")

    const unsafe = buildTradeLabPaperReadinessItems({
      validationStatus: "valid",
      isDraftDirty: false,
      isConfigDirty: false,
      hasPaperDraft: true,
      credentialBoundaryStatus: "unsafe_permissions",
    }).find((item) => item.id === "credential-boundary")

    expect(ipWarning).toEqual({
      id: "credential-boundary",
      label: "Credential boundary",
      status: "Warning",
      description: "Restrict the exchange key to trusted IPs before paper readiness can pass.",
    })
    expect(unsafe).toEqual({
      id: "credential-boundary",
      label: "Credential boundary",
      status: "Missing",
      description: "Disable trading, withdrawal, futures, and margin permissions before paper readiness can pass.",
    })
  })
})
