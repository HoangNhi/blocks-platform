import type { TradeLabMode } from "./types"

export const TRADELAB_EXECUTION_MODE_NOT_ENABLED_REASON = "execution_mode_not_enabled"

export type TradeLabExecutionModeOption = {
  mode: TradeLabMode
  label: string
  description: string
  disabled: boolean
  disabledReason: string | null
}

export const TRADELAB_EXECUTION_MODE_OPTIONS: TradeLabExecutionModeOption[] = [
  {
    mode: "backtest",
    label: "Backtest",
    description: "Research run against historical candles.",
    disabled: false,
    disabledReason: null,
  },
  {
    mode: "paper",
    label: "Paper",
    description: "Simulated forward execution mode.",
    disabled: true,
    disabledReason: "Paper chưa được bật trong Phase 4 Foundation.",
  },
  {
    mode: "live",
    label: "Live",
    description: "Real exchange execution mode.",
    disabled: true,
    disabledReason: "Live chưa được bật trong Phase 4 Foundation.",
  },
]
