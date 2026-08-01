import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"

import type { AuditLogDetailModel } from "../types"

type AuditLogDetailDialogProps = {
  open: boolean
  value: AuditLogDetailModel | null
  onOpenChange: (open: boolean) => void
}

function valueOrDash(value: string | null | undefined) {
  return value && value.trim() ? value : "-"
}

function JsonSection({
  title,
  value,
}: {
  title: string
  value: string | null | undefined
}) {
  return (
    <div className="grid gap-2 rounded-xl border p-4">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <ScrollArea className="max-h-56 rounded-lg border bg-muted/20">
        <pre className="whitespace-pre-wrap break-words p-3 text-sm text-foreground">
          {valueOrDash(value)}
        </pre>
      </ScrollArea>
    </div>
  )
}

export function AuditLogDetailDialog({
  open,
  value,
  onOpenChange,
}: AuditLogDetailDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-1.5rem)] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Chi tiết nhật ký</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Thông tin chỉ đọc của bản ghi nhật ký hệ thống.
          </p>
        </DialogHeader>

        <div className="grid gap-4 px-6 py-5">
          <div className="grid gap-3 rounded-xl border bg-muted/20 p-4 md:grid-cols-2">
            <div className="grid gap-1">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                Hành động
              </span>
              <strong>{valueOrDash(value?.action)}</strong>
            </div>
            <div className="grid gap-1">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                Người dùng
              </span>
              <strong>{valueOrDash(value?.userName)}</strong>
            </div>
            <div className="grid gap-1">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                Tài nguyên
              </span>
              <strong>{valueOrDash(value?.entityName)}</strong>
            </div>
            <div className="grid gap-1">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                Dịch vụ
              </span>
              <strong>{valueOrDash(value?.serviceName ?? "System")}</strong>
            </div>
            <div className="grid gap-1">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                Thời gian
              </span>
              <strong>
                {value?.createdAt ? new Date(value.createdAt).toLocaleString() : "-"}
              </strong>
            </div>
            <div className="grid gap-1">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                Kết quả
              </span>
              <Badge
                variant="secondary"
                className={
                  value?.isSuccess
                    ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-50"
                    : "bg-rose-50 text-rose-700 hover:bg-rose-50"
                }
              >
                {value?.isSuccess ? "Thành công" : "Thất bại"}
              </Badge>
            </div>
          </div>

          <div className="grid gap-4">
            <JsonSection title="Giá trị cũ" value={value?.oldValues} />
            <JsonSection title="Giá trị mới" value={value?.newValues} />
            <JsonSection title="IP" value={value?.ipAddress} />
            <JsonSection title="Thông báo lỗi" value={value?.errorMessage} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
