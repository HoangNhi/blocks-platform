// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { AssistedTestnetPanel } from "./assisted-testnet-panel"

describe("AssistedTestnetPanel", () => {
  const preview = {
    status: "allowed",
    allowed: true,
    reasonCode: "preview_allowed",
    safetyStatus: "assisted_testnet_order_preview_only",
    intentId: "intent-1",
    previewId: "preview-1",
    clientOrderId: "client-order-1",
    expiresAt: null,
    order: null,
    sourceContext: null,
    credentialSnapshot: {},
    riskSnapshot: {},
    auditEventIds: [],
    details: {},
  }

  const selectedIntent = {
    intentId: "intent-1",
    status: "submitted",
    reasonCode: "testnet_order_submit_binance_accepted",
    clientOrderId: "client-order-1",
    environment: "binance_testnet",
    exchange: "binance",
    marketType: "spot",
    symbol: "BTCUSDT",
    side: "buy",
    orderType: "market",
    quantity: null,
    quoteQuantity: "25",
    strategyId: "strategy-1",
    strategyVersionId: "version-1",
    sourceRunId: "run-1",
    credentialRefId: "credential-ref-1",
    latestPreviewId: "preview-1",
    reconciliationRequired: false,
    createdAt: null,
    updatedAt: null,
  }

  it("renders operational controls without live or secret surfaces", async () => {
    const user = userEvent.setup()
    const onPreview = vi.fn()

    render(
      <AssistedTestnetPanel
        side="buy"
        sizeMode="quote"
        amount="25"
        credentialRefId="credential-ref-1"
        symbol="BTCUSDT"
        sourceReady
        sourceReadyLabel="Completed-run required"
        preview={preview}
        list={{ safetyStatus: "assisted_testnet_order_list_read_only", items: [] }}
        onPreview={onPreview}
      />,
    )

    expect(screen.getByText("Assisted Testnet")).toBeTruthy()
    expect(screen.getAllByText("Completed-run required").length).toBeGreaterThan(0)
    expect(screen.queryByText(/api secret/i)).toBeNull()
    expect(screen.queryByText(/live trading/i)).toBeNull()

    await user.click(screen.getByRole("button", { name: /preview testnet order/i }))
    expect(onPreview).toHaveBeenCalledTimes(1)
  })

  it("confirms submit, cancel, and reconcile through explicit dialogs", async () => {
    const user = userEvent.setup()
    const onConfirmSubmit = vi.fn()
    const onCancelOrder = vi.fn()
    const onReconcile = vi.fn()

    render(
      <AssistedTestnetPanel
        side="buy"
        sizeMode="quote"
        amount="25"
        credentialRefId="credential-ref-1"
        symbol="BTCUSDT"
        sourceReady
        sourceReadyLabel="Completed source"
        preview={preview}
        selectedIntent={selectedIntent}
        canConfirmSubmit
        canCancel
        canReconcile
        list={{ safetyStatus: "assisted_testnet_order_list_read_only", items: [] }}
        onConfirmSubmit={onConfirmSubmit}
        onCancelOrder={onCancelOrder}
        onReconcile={onReconcile}
      />,
    )

    await user.click(screen.getByRole("button", { name: /confirm submit/i }))
    const dialog = screen.getByRole("dialog")
    expect(dialog).toBeTruthy()
    expect(within(dialog).getByText(/Binance Spot Testnet only/i)).toBeTruthy()
    await user.click(screen.getByRole("button", { name: /submit testnet order/i }))
    expect(onConfirmSubmit).toHaveBeenCalledTimes(1)

    await user.keyboard("{Escape}")
    await user.click(screen.getByRole("button", { name: /^cancel$/i }))
    await user.click(screen.getByRole("button", { name: /cancel testnet order/i }))
    expect(onCancelOrder).toHaveBeenCalledTimes(1)

    await user.keyboard("{Escape}")
    await user.click(screen.getByRole("button", { name: /^reconcile$/i }))
    await user.click(screen.getByRole("button", { name: /reconcile testnet order/i }))
    expect(onReconcile).toHaveBeenCalledTimes(1)
  })
})
