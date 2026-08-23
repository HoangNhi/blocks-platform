import { Navigate, Outlet, useLocation } from "react-router"
import { ShieldCheck } from "lucide-react"

import { PageState } from "@/components/platform/page-state"

import { useAuth } from "./auth-context"

export function ProtectedRoute() {
  const location = useLocation()
  const { session, status } = useAuth()

  if (status === "loading") {
    return (
      <PageState
        icon={ShieldCheck}
        title="Đang kiểm tra phiên"
        description="Đang xác minh trạng thái xác thực trước khi mở nền tảng."
      />
    )
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <Outlet />
}
