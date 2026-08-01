// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { AssistedLiveOrderDetailPanel } from "./assisted-live-order-detail-panel"

describe("AssistedLiveOrderDetailPanel", () => {
  it("renders read-only assisted live evidence", () => {
    render(
      <AssistedLiveOrderDetailPanel
        preview={{
          status: "allowed",
          allowed: true,
          reasonCode: "preview_allowed",
          safetyStatus: "assisted_live_order_preview_only",
          intentId: "intent-1",
          previewId: "preview-1",
          clientOrderId: "client-order-1",
          expiresAt: "2026-06-01T10:00:00Z",
          order: {
            environment: "binance_live",
            exchange: "binance",
            marketType: "spot",
            symbol: "BTCUSDT",
            side: "buy",
            orderType: "market",
            quantity: null,
            quoteQuantity: "25",
            estimatedNotional: null,
            estimatedFee: null,
          },
          sourceContext: null,
          credentialSnapshot: {},
          riskSnapshot: {},
          auditEventIds: ["event-1"],
          details: {},
        }}
        detail={{
          safetyStatus: "assisted_live_order_read_only",
          intent: {
            intentId: "intent-1",
            status: "previewed",
            reasonCode: "preview_allowed",
            clientOrderId: "client-order-1",
            environment: "binance_live",
            exchange: "binance",
            marketType: "spot",
            symbol: "BTCUSDT",
            side: "buy",
            orderType: "market",
            quantity: null,
            quoteQuantity: "25",
            strategyId: "strategy-1",
            strategyVersionId: "version-1",
            sourceRunId: null,
            credentialRefId: "credential-ref-1",
            latestPreviewId: "preview-1",
            reconciliationRequired: false,
            createdAt: null,
            updatedAt: null,
          },
          latestPreview: {
            previewId: "preview-1",
            previewKey: "preview-key-1",
            status: "allowed",
            reasonCode: "preview_allowed",
            symbol: "BTCUSDT",
            side: "buy",
            orderType: "market",
            quantity: null,
            quoteQuantity: "25",
            estimatedNotional: null,
            estimatedFee: null,
            riskSnapshot: { maxNotional: "100" },
            credentialSnapshot: { status: "stored_live_only" },
            sourceSnapshot: { source: "strategy_lab" },
            expiresAt: null,
            createdAt: null,
          },
          previews: [],
          events: [{
            eventId: "event-1",
            previewId: "preview-1",
            eventType: "preview_created",
            fromStatus: null,
            toStatus: "previewed",
            reasonCode: "preview_allowed",
            clientOrderId: "client-order-1",
            exchangeOrderId: null,
            actor: "local-user",
            metadata: {},
            createdAt: null,
          }],
          reconciliationAttempts: [{
            attemptId: "attempt-1",
            attemptNo: 1,
            status: "matched",
            trigger: "manual",
            reasonCode: "live_order_reconcile_binance_matched",
            exchangeOrderStatus: "FILLED",
          }],
        }}
      />,
    )

    expect(screen.getByText("Assisted Live Evidence")).toBeTruthy()
    expect(screen.getAllByText("client-order-1").length).toBeGreaterThan(0)
    expect(screen.getByText("Credential snapshot")).toBeTruthy()
    expect(screen.getByText("Lifecycle events")).toBeTruthy()
    expect(screen.getByText("Reconciliation attempts")).toBeTruthy()
    expect(screen.getByText("Journal bridge readiness")).toBeTruthy()
    expect(screen.getByText("Projection writes live execution evidence into the execution journal after terminal order evidence exists.")).toBeTruthy()
    expect(screen.getByText("live_order_reconcile_binance_matched")).toBeTruthy()
    expect(screen.queryByRole("button", { name: /submit/i })).toBeNull()
    expect(screen.queryByText(/api secret/i)).toBeNull()
    expect(screen.queryByText(/testnet/i)).toBeNull()
  })
})
