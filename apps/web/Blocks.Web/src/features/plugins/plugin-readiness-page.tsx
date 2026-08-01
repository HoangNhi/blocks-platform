import { PlugZap } from "lucide-react"

import { PageState } from "@/components/platform/page-state"

type PluginReadinessPageProps = {
  title: string
  description: string
}

export function PluginReadinessPage({ title, description }: PluginReadinessPageProps) {
  return <PageState icon={PlugZap} title={title} description={description} />
}
