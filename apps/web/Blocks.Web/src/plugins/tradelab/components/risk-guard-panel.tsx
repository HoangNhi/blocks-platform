import type { TradeLabRiskConfig } from "../types"

type RiskGuardPanelProps = {
  value: TradeLabRiskConfig
  disabled?: boolean
  onChange: (nextValue: TradeLabRiskConfig) => void
}

function updateRiskConfig(
  value: TradeLabRiskConfig,
  key: keyof TradeLabRiskConfig,
  next: string,
): TradeLabRiskConfig {
  return { ...value, [key]: Number(next) || 0 }
}

export function RiskGuardPanel({ value, disabled = false, onChange }: RiskGuardPanelProps) {
  return (
    <div className={disabled ? "grid gap-3 opacity-80" : "grid gap-3"}>
      {[
        ["maxOrderPercent", "Max order %", value.maxOrderPercent],
        ["maxPositionPercent", "Max position %", value.maxPositionPercent],
        ["maxDrawdownPercent", "Max drawdown %", value.maxDrawdownPercent],
        ["minNotional", "Min notional", value.minNotional],
        ["stepSize", "Step size", value.stepSize],
        ["tickSize", "Tick size", value.tickSize],
      ].map(([key, label, currentValue]) => (
        <label key={key} className="grid gap-1.5">
          <span className="text-xs font-medium text-platform-muted">{label}</span>
          <input
            type="text"
            value={String(currentValue)}
            disabled={disabled}
            onChange={(event) =>
              onChange(updateRiskConfig(value, key as keyof TradeLabRiskConfig, event.target.value))
            }
            className="h-10 rounded-lg border border-platform-border bg-white px-3 text-sm text-platform-ink outline-none transition focus:border-blue-300 focus:ring-3 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50"
          />
        </label>
      ))}
    </div>
  )
}
