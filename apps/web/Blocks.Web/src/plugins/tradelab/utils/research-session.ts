import type { TradeLabRiskConfig, TradeLabRuntimeConfig } from "../types"

export type ResearchPhase = "in_sample" | "validation" | "oos" | "stress"
export type ResearchDecision = "unreviewed" | "keep" | "drop" | "candidate"
export type OosStatus = "not_started" | "locked" | "evaluated" | "contaminated"

export type DateRange = {
  startAt: string
  endAt: string
}

export type ResearchTrialResult = {
  totalReturnPct: number | null
  monthlyReturnPct: number | null
  maxDrawdownPct: number | null
  profitFactor: number | null
  tradeCount: number
  averageTradePct: number | null
}

export type ResearchTrial = {
  id: string
  trialNumber: number
  phase: ResearchPhase
  hypothesis: string
  strategyFamily: string
  runtime: TradeLabRuntimeConfig
  risk: TradeLabRiskConfig
  strategyVersionLabel: string
  configHash: string
  runId: string | null
  result: ResearchTrialResult | null
  decision: ResearchDecision
  decisionReason: string
  createdAt: string
}

export type ResearchSession = {
  id: string
  strategyId: string
  strategyName: string
  createdAt: string
  updatedAt: string
  splits: {
    inSample: DateRange
    validation: DateRange
    oos: DateRange
  }
  oos: {
    status: OosStatus
    lockedTrialNumber: number | null
    lockedConfigHash: string | null
    startAt: string
    endAt: string
  }
  trials: ResearchTrial[]
}

export type AddResearchTrialInput = Omit<ResearchTrial, "id" | "trialNumber" | "decision" | "decisionReason" | "createdAt">

export function createResearchSession(input: { strategyId: string; strategyName: string }): ResearchSession {
  const now = new Date().toISOString()

  return {
    id: `research-${input.strategyId}-${Date.now()}`,
    strategyId: input.strategyId,
    strategyName: input.strategyName,
    createdAt: now,
    updatedAt: now,
    splits: {
      inSample: { startAt: "", endAt: "" },
      validation: { startAt: "", endAt: "" },
      oos: { startAt: "", endAt: "" },
    },
    oos: {
      status: "not_started",
      lockedTrialNumber: null,
      lockedConfigHash: null,
      startAt: "",
      endAt: "",
    },
    trials: [],
  }
}

export function addResearchTrial(session: ResearchSession, input: AddResearchTrialInput): ResearchSession {
  const now = new Date().toISOString()
  const trialNumber = session.trials.length + 1
  const nextTrial: ResearchTrial = {
    ...input,
    id: `trial-${session.id}-${trialNumber}`,
    trialNumber,
    decision: "unreviewed",
    decisionReason: "",
    createdAt: now,
  }

  return { ...session, updatedAt: now, trials: [...session.trials, nextTrial] }
}

export function updateTrialDecision(
  session: ResearchSession,
  trialNumber: number,
  decision: ResearchDecision,
  decisionReason: string,
): ResearchSession {
  const now = new Date().toISOString()

  return {
    ...session,
    updatedAt: now,
    trials: session.trials.map((trial) =>
      trial.trialNumber === trialNumber ? { ...trial, decision, decisionReason } : trial,
    ),
  }
}

export function promoteTrial(
  session: ResearchSession,
  trialNumber: number,
  phase: Exclude<ResearchPhase, "in_sample">,
): ResearchSession {
  const updated = {
    ...session,
    trials: session.trials.map((trial) =>
      trial.trialNumber === trialNumber ? { ...trial, phase } : trial,
    ),
  }

  return updateTrialDecision(updated, trialNumber, "candidate", `Promoted to ${phase.replace("_", " ")}.`)
}

export function lockOosCandidate(
  session: ResearchSession,
  input: { trialNumber: number; configHash: string; startAt: string; endAt: string },
): ResearchSession {
  const now = new Date().toISOString()

  return {
    ...session,
    updatedAt: now,
    oos: {
      status: "locked",
      lockedTrialNumber: input.trialNumber,
      lockedConfigHash: input.configHash,
      startAt: input.startAt,
      endAt: input.endAt,
    },
  }
}

export function contaminateOosIfConfigChanged(session: ResearchSession, currentConfigHash: string): ResearchSession {
  if (session.oos.status !== "evaluated" || session.oos.lockedConfigHash === currentConfigHash) {
    return session
  }

  return {
    ...session,
    updatedAt: new Date().toISOString(),
    oos: { ...session.oos, status: "contaminated" },
  }
}

export function filterResearchTrials(
  trials: ResearchTrial[],
  filters: { phase?: ResearchPhase | "all"; decision?: ResearchDecision | "all" },
) {
  return trials.filter((trial) => {
    if (filters.phase && filters.phase !== "all" && trial.phase !== filters.phase) return false
    if (filters.decision && filters.decision !== "all" && trial.decision !== filters.decision) return false
    return true
  })
}
