import { Construction } from "lucide-react"

import { PageState } from "@/components/platform/page-state"

type RouteStubPageProps = {
  title: string
  description: string
}

export function RouteStubPage({ title, description }: RouteStubPageProps) {
  return (
    <PageState
      icon={Construction}
      title={title}
      description={description || "Not connected yet."}
    />
  )
}
