import type { BacktestPosition } from "../types"

type PositionsPanelProps = {
  positions: BacktestPosition[]
}

function statusClass(status: BacktestPosition["status"]): string {
  if (status === "LIQUIDATED") return "bg-red-50 text-red-700"
  if (status === "CLOSED") return "text-platform-muted"
  return "text-platform-ink"
}

function statusBadgeClass(status: BacktestPosition["status"]): string {
  if (status === "LIQUIDATED") return "inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700"
  if (status === "CLOSED") return "inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
  return "inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700"
}

function sideClass(side: "LONG" | "SHORT"): string {
  return side === "LONG"
    ? "font-semibold text-green-700"
    : "font-semibold text-red-700"
}

/**
 * Bảng hiển thị các vị thế futures trong một lần chạy backtest.
 * Các vị thế bị thanh lý (LIQUIDATED) được đánh dấu nổi bật bằng nền đỏ nhạt.
 */
export function PositionsPanel({ positions }: PositionsPanelProps) {
  if (!positions || positions.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-platform-muted">
        Không có vị thế nào trong lần chạy này.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-platform-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-platform-border bg-platform-surface-muted text-xs font-medium text-platform-muted">
            <th className="px-3 py-2 text-left">Ký hiệu</th>
            <th className="px-3 py-2 text-left">Hướng</th>
            <th className="px-3 py-2 text-right">Kích thước</th>
            <th className="px-3 py-2 text-right">Đòn bẩy</th>
            <th className="px-3 py-2 text-right">Margin mode</th>
            <th className="px-3 py-2 text-right">Funding</th>
            <th className="px-3 py-2 text-right">Max margin</th>
            <th className="px-3 py-2 text-right">Giá thanh lý</th>
            <th className="px-3 py-2 text-center">Trạng thái</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((pos) => (
            <tr key={pos.id} className={`border-b border-platform-border last:border-0 ${statusClass(pos.status)}`}>
              <td className="px-3 py-2 font-medium">{pos.symbol}</td>
              <td className={`px-3 py-2 ${sideClass(pos.side)}`}>{pos.side}</td>
              <td className="px-3 py-2 text-right">{pos.size}</td>
              <td className="px-3 py-2 text-right">{pos.leverage}x</td>
              <td className="px-3 py-2 text-right">{pos.marginMode ?? "CROSS"}</td>
              <td className="px-3 py-2 text-right">{(pos.fundingFeePaid ?? 0).toFixed(4)}</td>
              <td className="px-3 py-2 text-right">{pos.maxMarginUsed != null ? pos.maxMarginUsed.toFixed(4) : "—"}</td>
              <td className="px-3 py-2 text-right">{pos.liquidationPrice != null ? pos.liquidationPrice.toLocaleString() : "—"}</td>
              <td className="px-3 py-2 text-center">
                <span className={statusBadgeClass(pos.status)}>{pos.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
