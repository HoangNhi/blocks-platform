export type FuturesEvidenceCapture = {
  fixtureName: string
  expectedDefaultLeverage: number
  startHttpStatus: number
  runHttpStatus: number
  analysisHttpStatus: number
  startRequestBody: unknown
  startResponseBody: unknown
  runPayload: unknown
  analysisPayload: unknown
  screenshotPaths: string[]
}

export type FuturesEvidenceSummary = {
  pass: boolean
  fixtureName: string
  runId: string
  finalRunStatus: string | null
  finalPipelineStatus: string | null
  persistedRuntimeConfig: Record<string, unknown>
  datasetContext: Record<string, unknown>
  positionsCount: number
  hasFuturesSummary: boolean
  totalFundingFeePaid: number
  futuresSummary: Record<string, unknown> | null
  issues: string[]
  startHttpStatus: number
  runHttpStatus: number
  analysisHttpStatus: number
  expectedDefaultLeverage: number
  startRequestBody: Record<string, unknown>
  screenshotPaths: string[]
}

function asRecord(value: unknown): Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function pick(record: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (record[key] !== undefined) {
      return record[key]
    }
  }
  return undefined
}

function envelopeData(payload: unknown): Record<string, unknown> {
  const record = asRecord(payload)
  const nested = pick(record, "Data", "data")
  return nested !== undefined ? asRecord(nested) : record
}

function text(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function nullableText(value: unknown): string | null {
  const normalized = text(value).trim()
  return normalized.length > 0 ? normalized : null
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

export function buildFuturesEvidenceSummary(capture: FuturesEvidenceCapture): FuturesEvidenceSummary {
  const startData = envelopeData(capture.startResponseBody)
  const runData = envelopeData(capture.runPayload)
  const analysisData = envelopeData(capture.analysisPayload)

  const startRun = asRecord(pick(startData, "run"))
  const runId = text(pick(startRun, "id")) || text(pick(runData, "id"))
  const finalRunStatus = nullableText(pick(runData, "status"))
  const finalPipelineStatus = nullableText(pick(runData, "pipeline_status", "pipelineStatus"))
  const persistedRuntimeConfig = asRecord(pick(runData, "runtimeConfig", "runtime_config"))
  const datasetContext = asRecord(pick(analysisData, "datasetContext", "dataset_context"))
  const positions = asArray(pick(analysisData, "positions"))
  const futuresSummaryRecord = pick(analysisData, "futuresSummary", "futures_summary")
  const futuresSummary = Object.keys(asRecord(futuresSummaryRecord)).length > 0 ? asRecord(futuresSummaryRecord) : null
  const totalFundingFeePaid =
    numberValue(pick(analysisData, "totalFundingFeePaid", "total_funding_fee_paid")) ||
    numberValue(pick(asRecord(futuresSummary), "totalFundingFeePaid", "total_funding_fee_paid"))

  const issues: string[] = []

  if (![200, 201].includes(capture.startHttpStatus)) {
    issues.push(`start backtest response returned HTTP ${capture.startHttpStatus} (expected 200 or 201)`)
  }
  if (capture.runHttpStatus !== 200) {
    issues.push(`run detail response returned HTTP ${capture.runHttpStatus}`)
  }
  if (capture.analysisHttpStatus !== 200) {
    issues.push(`run analysis response returned HTTP ${capture.analysisHttpStatus}`)
  }
  if (!runId) {
    issues.push("missing run id in start response or run detail payload")
  }
  if (finalRunStatus !== "completed") {
    issues.push(`final run status is not completed: ${finalRunStatus ?? "missing"}`)
  }
  if (finalPipelineStatus !== "completed") {
    issues.push(`final pipeline status is not completed: ${finalPipelineStatus ?? "missing"}`)
  }
  if (text(pick(persistedRuntimeConfig, "marketType")) !== "USD_M_FUTURES") {
    issues.push("persisted runtimeConfig.marketType is not USD_M_FUTURES")
  }
  const persistedDefaultLeverage = numberValue(pick(persistedRuntimeConfig, "defaultLeverage"))
  if (persistedDefaultLeverage < 1) {
    issues.push("persisted runtimeConfig.defaultLeverage is missing or invalid")
  } else if (persistedDefaultLeverage !== capture.expectedDefaultLeverage) {
    issues.push(
      `persisted runtimeConfig.defaultLeverage ${persistedDefaultLeverage} does not match expected ${capture.expectedDefaultLeverage}`,
    )
  }
  if (positions.length === 0 && futuresSummary == null) {
    issues.push("analysis payload does not expose futures positions or futures summary")
  }

  return {
    pass: issues.length === 0,
    fixtureName: capture.fixtureName,
    runId,
    finalRunStatus,
    finalPipelineStatus,
    persistedRuntimeConfig,
    datasetContext,
    positionsCount: positions.length,
    hasFuturesSummary: futuresSummary != null,
    totalFundingFeePaid,
    futuresSummary,
    issues,
    startHttpStatus: capture.startHttpStatus,
    runHttpStatus: capture.runHttpStatus,
    analysisHttpStatus: capture.analysisHttpStatus,
    expectedDefaultLeverage: capture.expectedDefaultLeverage,
    startRequestBody: asRecord(capture.startRequestBody),
    screenshotPaths: capture.screenshotPaths,
  }
}
