import { LockKeyhole } from "lucide-react"

import { PageState } from "@/components/platform/page-state"

export function AccessDeniedPage() {
  return (
    <PageState
      icon={LockKeyhole}
      title="Truy cập bị từ chối"
      description="Bạn đã đăng nhập, nhưng tuyến này không khả dụng với quyền hiện tại."
      tone="danger"
    />
  )
}
