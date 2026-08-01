import { KeyRound } from "lucide-react"

import { Checkbox } from "@/components/ui/checkbox"

import type { TradeLabCredentialBoundaryChecks } from "../types"

type CredentialBoundaryPanelProps = {
  checks: TradeLabCredentialBoundaryChecks
  onChecksChange: (checks: TradeLabCredentialBoundaryChecks) => void
}

const CHECK_ITEMS: Array<{
  key: keyof TradeLabCredentialBoundaryChecks
  label: string
  description: string
}> = [
  {
    key: "readOnlyEnabled",
    label: "Read-only enabled",
    description: "Exchange key has read permission for future readiness checks.",
  },
  {
    key: "tradingDisabled",
    label: "Trading disabled",
    description: "Spot, margin, and order placement permissions stay off.",
  },
  {
    key: "withdrawDisabled",
    label: "Withdraw disabled",
    description: "Withdraw and transfer permissions stay off.",
  },
  {
    key: "futuresMarginDisabled",
    label: "Futures/Margin disabled",
    description: "Futures, margin loan, repayment, and transfer permissions stay off.",
  },
  {
    key: "ipRestricted",
    label: "IP restricted",
    description: "Key is limited to trusted IPs where possible.",
  },
]

export function CredentialBoundaryPanel({ checks, onChecksChange }: CredentialBoundaryPanelProps) {
  return (
    <section
      aria-label="Credential boundary controls"
      className="rounded-xl border border-platform-border bg-platform-surface p-3"
    >
      <div className="flex items-start gap-2">
        <KeyRound className="mt-0.5 size-4 text-platform-muted" aria-hidden="true" />
        <div>
          <p className="text-sm font-semibold text-platform-ink">Credential boundary</p>
          <p className="mt-1 text-xs leading-5 text-platform-muted">
            Manual readiness only. Do not enter Binance API keys or secrets in TradeLab.
          </p>
        </div>
      </div>

      <div className="mt-3 grid gap-2">
        {CHECK_ITEMS.map((item) => (
          <label
            key={item.key}
            className="grid grid-cols-[auto_1fr] items-start gap-2 rounded-lg border border-platform-border bg-platform-surface-muted px-3 py-2"
          >
            <Checkbox
              checked={checks[item.key]}
              onCheckedChange={(checked) =>
                onChecksChange({
                  ...checks,
                  [item.key]: checked === true,
                })
              }
              aria-label={item.label}
            />
            <span>
              <span className="block text-sm font-medium text-platform-ink">{item.label}</span>
              <span className="mt-0.5 block text-xs text-platform-muted">{item.description}</span>
            </span>
          </label>
        ))}
      </div>
    </section>
  )
}
