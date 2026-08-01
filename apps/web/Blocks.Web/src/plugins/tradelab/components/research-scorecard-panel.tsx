import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"

import type { ScorecardVerdict } from "../utils/research-run-readiness"

type ResearchScorecardPanelProps = {
  verdict: ScorecardVerdict
}

export function ResearchScorecardPanel({ verdict }: ResearchScorecardPanelProps) {
  const failed = verdict.verdict === "Failed"

  return (
    <Alert variant={failed ? "destructive" : "default"} aria-label="Research scorecard">
      <AlertTitle className="flex flex-wrap items-center gap-2">
        Basic scorecard
        <Badge variant={failed ? "destructive" : "secondary"}>{verdict.verdict}</Badge>
      </AlertTitle>
      <AlertDescription className="grid gap-1">
        {verdict.reasons.map((reason) => <span key={reason}>{reason}</span>)}
      </AlertDescription>
    </Alert>
  )
}
