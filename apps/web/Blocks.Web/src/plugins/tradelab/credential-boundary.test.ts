import { describe, expect, it } from "vitest"

import {
  DEFAULT_CREDENTIAL_BOUNDARY_CHECKS,
  buildCredentialBoundaryMetadata,
  deriveCredentialBoundaryStatus,
  normalizeCredentialBoundaryFromBot,
} from "./credential-boundary"
import type { TradeLabBotSummary } from "./types"

function botWithMetadata(metadata: Record<string, unknown>): TradeLabBotSummary {
  return {
    id: "bot-1",
    strategyId: "strategy-1",
    strategyVersionId: "version-1",
    name: "Paper draft",
    mode: "paper",
    status: "draft",
    symbol: "BTCUSDT",
    timeframe: "1h",
    runtimeConfig: {
      exchange: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      startAt: "",
      endAt: "",
      initialEquity: 1000,
      feeBps: 0,
      slippageBps: 0,
    },
    riskConfig: {
      maxOrderPercent: 10,
      maxPositionPercent: 100,
      maxDrawdownPercent: 15,
      minNotional: 10,
      stepSize: 0.001,
      tickSize: 0.01,
    },
    metadata,
    createdAt: "2026-05-16T00:00:00Z",
  }
}

describe("TradeLab credential boundary", () => {
  it("derives readiness status from manual checks", () => {
    expect(deriveCredentialBoundaryStatus(DEFAULT_CREDENTIAL_BOUNDARY_CHECKS)).toBe("not_verified")
    expect(
      deriveCredentialBoundaryStatus({
        readOnlyEnabled: true,
        tradingDisabled: false,
        withdrawDisabled: true,
        futuresMarginDisabled: true,
        ipRestricted: true,
      }),
    ).toBe("unsafe_permissions")
    expect(
      deriveCredentialBoundaryStatus({
        readOnlyEnabled: true,
        tradingDisabled: true,
        withdrawDisabled: true,
        futuresMarginDisabled: true,
        ipRestricted: false,
      }),
    ).toBe("ip_not_restricted")
    expect(
      deriveCredentialBoundaryStatus({
        readOnlyEnabled: true,
        tradingDisabled: true,
        withdrawDisabled: true,
        futuresMarginDisabled: true,
        ipRestricted: true,
      }),
    ).toBe("read_only_ready")
  })

  it("normalizes missing credential boundary", () => {
    expect(normalizeCredentialBoundaryFromBot(null)).toEqual({
      exchange: "binance",
      status: "missing",
      checks: DEFAULT_CREDENTIAL_BOUNDARY_CHECKS,
      updatedAt: null,
    })
    expect(normalizeCredentialBoundaryFromBot(botWithMetadata({})).status).toBe("missing")
  })

  it("normalizes credential boundary metadata from paper draft", () => {
    expect(
      normalizeCredentialBoundaryFromBot(
        botWithMetadata({
          credentialBoundary: {
            exchange: "binance",
            status: "read_only_ready",
            checks: {
              readOnlyEnabled: true,
              tradingDisabled: true,
              withdrawDisabled: true,
              futuresMarginDisabled: true,
              ipRestricted: true,
            },
            updatedAt: "2026-05-16T00:00:00Z",
          },
        }),
      ),
    ).toEqual({
      exchange: "binance",
      status: "read_only_ready",
      checks: {
        readOnlyEnabled: true,
        tradingDisabled: true,
        withdrawDisabled: true,
        futuresMarginDisabled: true,
        ipRestricted: true,
      },
      updatedAt: "2026-05-16T00:00:00Z",
    })
  })

  it("builds metadata payload without secret-like fields", () => {
    const metadata = buildCredentialBoundaryMetadata(
      {
        readOnlyEnabled: true,
        tradingDisabled: true,
        withdrawDisabled: true,
        futuresMarginDisabled: true,
        ipRestricted: true,
      },
      "2026-05-16T00:00:00Z",
    )

    expect(metadata).toEqual({
      credentialBoundary: {
        exchange: "binance",
        status: "read_only_ready",
        checks: {
          readOnlyEnabled: true,
          tradingDisabled: true,
          withdrawDisabled: true,
          futuresMarginDisabled: true,
          ipRestricted: true,
        },
        updatedAt: "2026-05-16T00:00:00Z",
      },
    })
    expect(JSON.stringify(metadata)).not.toMatch(/apiKey|secret|apiSecret|privateKey|passphrase/i)
  })
})
