import { type TradeLabRuntimeConfig, type MarketType } from "../types"


type RuntimeConfigPanelProps = {
  value: TradeLabRuntimeConfig
  disabled?: boolean
  onChange: (nextValue: TradeLabRuntimeConfig) => void
}

function updateRuntimeConfig(
  value: TradeLabRuntimeConfig,
  key: keyof TradeLabRuntimeConfig,
  next: string | number,
): TradeLabRuntimeConfig {
  if (key === "initialEquity" || key === "feeBps" || key === "slippageBps" || key === "defaultLeverage") {
    return { ...value, [key]: Number(next) || 0 }
  }
  return { ...value, [key]: next }
}

export function RuntimeConfigPanel({ value, disabled = false, onChange }: RuntimeConfigPanelProps) {
  const marketType = value.marketType ?? "SPOT"
  const defaultLeverage = value.defaultLeverage ?? 1

  return (
    <div className={disabled ? "grid gap-3 opacity-80" : "grid gap-3"}>
      {/* Trường cấu hình cơ bản */}
      {[
        ["exchange", "Exchange", value.exchange],
        ["symbol", "Symbol", value.symbol],
        ["timeframe", "Timeframe", value.timeframe],
        ["startAt", "Start date", value.startAt],
        ["endAt", "End date", value.endAt],
        ["initialEquity", "Initial equity", String(value.initialEquity)],
        ["feeBps", "Fee bps", String(value.feeBps)],
        ["slippageBps", "Slippage bps", String(value.slippageBps)],
      ].map(([key, label, currentValue]) => (
        <label key={key} className="grid gap-1.5">
          <span className="text-xs font-medium text-platform-muted">{label}</span>
          <input
            type="text"
            value={currentValue}
            disabled={disabled}
            onChange={(event) =>
              onChange(updateRuntimeConfig(value, key as keyof TradeLabRuntimeConfig, event.target.value))
            }
            className="h-10 rounded-lg border border-platform-border bg-white px-3 text-sm text-platform-ink outline-none transition focus:border-blue-300 focus:ring-3 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50"
          />
        </label>
      ))}

      {/* Loại thị trường */}
      <label className="grid gap-1.5">
        <span className="text-xs font-medium text-platform-muted">Market Type</span>
        <select
          id="runtime-config-market-type"
          value={marketType}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...value,
              marketType: event.target.value as MarketType,
              defaultLeverage: event.target.value === "SPOT" ? undefined : (defaultLeverage || 1),
            })
          }
          className="h-10 rounded-lg border border-platform-border bg-white px-3 text-sm text-platform-ink outline-none transition focus:border-blue-300 focus:ring-3 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-50"
        >
          <option value="SPOT">Spot</option>
          <option value="USD_M_FUTURES">USDⓈ-M Futures</option>
        </select>
      </label>

      {/* Đòn bẩy mặc định - chỉ hiển thị khi chọn Futures */}
      {marketType === "USD_M_FUTURES" && (
        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-platform-muted">
            Default Leverage ({defaultLeverage}x)
          </span>
          <input
            id="runtime-config-default-leverage"
            type="range"
            min={1}
            max={125}
            step={1}
            value={defaultLeverage}
            disabled={disabled}
            onChange={(event) =>
              onChange(updateRuntimeConfig(value, "defaultLeverage", Number(event.target.value)))
            }
            className="w-full accent-blue-500 disabled:cursor-not-allowed"
          />
          <div className="flex justify-between text-xs text-platform-muted">
            <span>1x</span>
            <span>125x</span>
          </div>
        </label>
      )}
    </div>
  )
}
