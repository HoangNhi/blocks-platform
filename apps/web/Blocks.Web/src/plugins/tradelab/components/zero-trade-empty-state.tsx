import { Sparkles } from "lucide-react"

export function ZeroTradeEmptyState() {
  return (
    <div className="grid gap-3 rounded-xl border border-dashed border-platform-border bg-platform-surface-muted p-6 text-center">
      <span className="mx-auto grid size-12 place-items-center rounded-full bg-blue-50 text-blue-700">
        <Sparkles className="size-5" aria-hidden="true" />
      </span>
      <div>
        <h3 className="text-sm font-semibold text-platform-ink">
          Chiến lược không tạo ra tín hiệu nào
        </h3>
        <p className="mt-2 text-sm leading-6 text-platform-muted">
          Hãy kiểm tra lại điều kiện của bạn. Đây vẫn là một kết quả hợp lệ cho backtest.
        </p>
      </div>
    </div>
  )
}
