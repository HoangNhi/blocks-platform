// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  api: {
    listStrategyGroups: vi.fn(),
    listStrategies: vi.fn(),
    getStrategy: vi.fn(),
    updateStrategy: vi.fn(),
    listStrategyVersions: vi.fn(),
    createStrategyVersion: vi.fn(),
    listBots: vi.fn(),
    listDatasetCoverage: vi.fn(),
    createBot: vi.fn(),
    preflightBotBacktest: vi.fn(),
    startBotBacktest: vi.fn(),
    listBotRuns: vi.fn(),
    getBotRun: vi.fn(),
    getBotRunAnalysis: vi.fn(),
    getBotRunPipeline: vi.fn(),
    getStrategyJobVisibility: vi.fn(),
    getDatasetLocalFillAudit: vi.fn(),
    getDatasetFillJobVisibility: vi.fn(),
    getFillSchedulerStatus: vi.fn(),
    getPaperSchedulerStatus: vi.fn(),
    previewDatasetFill: vi.fn(),
    previewPaperSession: vi.fn(),
    getPaperKillSwitchStatus: vi.fn(),
    startPaperSession: vi.fn(),
    getPaperSessionDetail: vi.fn(),
    listPaperSessions: vi.fn(),
    runPaperSessionLocal: vi.fn(),
    cancelPaperSessionLocal: vi.fn(),
    retryPaperSessionLocal: vi.fn(),
    getPaperSessionResumeReadiness: vi.fn(),
    resumePaperSessionLocal: vi.fn(),
    previewTestnetOrder: vi.fn(),
    confirmSubmitTestnetOrder: vi.fn(),
    cancelTestnetOrder: vi.fn(),
    reconcileTestnetOrder: vi.fn(),
    projectTestnetOrderToJournal: vi.fn(),
    getTestnetOrderDetail: vi.fn(),
    listTestnetOrders: vi.fn(),
    fillDatasetLocal: vi.fn(),
    getBotRunChart: vi.fn(),
    getBotRunLogs: vi.fn(),
    getBotRunOrders: vi.fn(),
    getBotRunResult: vi.fn(),
    getBotRunTradeDetail: vi.fn(),
    getBenchmarkChecks: vi.fn(),
    startBenchmarkRepeat: vi.fn(),
    createManualSignalPackage: vi.fn(),
    createResearchRobustnessGate: vi.fn(),
    runBotBacktest: vi.fn(),
    validateStrategySource: vi.fn(),
  },
}))

vi.mock("@/features/auth/token-store", () => ({
  createBrowserTokenStore: () => ({
    getAccessToken: () => null,
  }),
}))

vi.mock("@/lib/api/client", () => ({
  createApiClient: () => ({
    request: vi.fn(),
  }),
}))

vi.mock("./tradelab-api", () => ({
  createTradeLabApi: () => mocks.api,
}))

import { ApiError } from "@/lib/api/api-error"
import { useTradeLabWorkspace } from "./tradelab-hooks"

function HookHarness() {
  const workspace = useTradeLabWorkspace()

  return (
    <div>
      <div data-testid="current-version">
        {workspace.currentVersion?.id ?? "none"}|{workspace.currentVersion?.versionNumber ?? "none"}
      </div>
      <div data-testid="selected-group">{workspace.selectedGroupId ?? "none"}</div>
      <div data-testid="selected-strategy">{workspace.selectedStrategyId ?? "none"}</div>
      <div data-testid="draft-source">{workspace.draftSource}</div>
      <div data-testid="analysis-trades">{workspace.runAnalysis?.trades.length ?? 0}</div>
      <div>{workspace.runAnalysis ? `run:${workspace.runAnalysis.run.id}` : "run:none"}</div>
      <div>{workspace.manualSignalPackage ? `manual-signal:${workspace.manualSignalPackage.sourceRunId}` : "manual-signal:none"}</div>
      <div data-testid="manual-signal-error">{workspace.manualSignalPackageError ?? "none"}</div>
      <div data-testid="manual-signal-loading">{String(workspace.isCreatingManualSignalPackage)}</div>
      <div>{workspace.researchRobustnessGate ? `robustness:${workspace.researchRobustnessGate.sourceRunId}` : "robustness:none"}</div>
      <div data-testid="robustness-error">{workspace.researchRobustnessGateError ?? "none"}</div>
      <div data-testid="robustness-loading">{String(workspace.isCreatingResearchRobustnessGate)}</div>
      <div data-testid="selected-analyzed-trade">{workspace.selectedAnalyzedTrade?.id ?? "none"}</div>
      <div data-testid="selected-execution-trade">{workspace.selectedTradeExecutionDetail?.trade.id ?? "none"}</div>
      <div data-testid="draft-dirty">{String(workspace.isDraftDirty)}</div>
      <div data-testid="config-dirty">{String(workspace.isConfigDirty)}</div>
      <div data-testid="run-disabled-reason">{workspace.runDisabledReason ?? "none"}</div>
      <div data-testid="validation-check">
        {workspace.validationCheck
          ? `${workspace.validationCheck.validationStatus}|${workspace.validationCheck.validationMessage ?? "none"}`
          : "none"}
      </div>
      <div data-testid="run-version">{workspace.runVersion?.id ?? "none"}</div>
      <div data-testid="paper-draft">{workspace.paperDraftBot?.id ?? "none"}</div>
      <div data-testid="job-visibility">
        {workspace.jobVisibility
          ? `${workspace.jobVisibility.strategyId}|${workspace.jobVisibility.active.length}|${workspace.jobVisibility.recent.length}`
          : "none"}
      </div>
      <div data-testid="job-visibility-loading">{String(workspace.isJobVisibilityLoading)}</div>
      <div data-testid="job-visibility-error">{workspace.jobVisibilityError ?? "none"}</div>
      <div data-testid="dataset-coverage">{workspace.datasetCoverage.map((item) => `${item.exchange}|${item.symbol}|${item.timeframe}|${item.gapCount}`).join(",") || "none"}</div>
      <div data-testid="dataset-coverage-error">{workspace.datasetCoverageError ?? "none"}</div>
      <div data-testid="dataset-coverage-loading">{String(workspace.isDatasetCoverageLoading)}</div>
      <div data-testid="dataset-fill-preview">
        {workspace.datasetFillPreview
          ? `${workspace.datasetFillPreview.datasetKey}|${workspace.datasetFillPreview.coverageStatus}|${workspace.datasetFillPreview.safetyStatus}`
          : "none"}
      </div>
      <div data-testid="dataset-fill-preview-error">{workspace.datasetFillPreviewError ?? "none"}</div>
      <div data-testid="dataset-fill-preview-loading">{String(workspace.isPreviewingDatasetFill)}</div>
      <div data-testid="paper-session-preview">
        {workspace.paperSessionPreview
          ? `${workspace.paperSessionPreview.previewStatus}|${workspace.paperSessionPreview.reasonCode}|${workspace.paperSessionPreview.datasetContext.datasetKey}`
          : "none"}
      </div>
      <div data-testid="paper-session-preview-error">{workspace.paperSessionPreviewError ?? "none"}</div>
      <div data-testid="paper-session-preview-loading">{String(workspace.isPaperSessionPreviewLoading)}</div>
      <div data-testid="paper-session-detail-input">{workspace.paperSessionDetailInput}</div>
      <div data-testid="paper-session-detail">{workspace.paperSessionDetail?.session.sessionId ?? "none"}</div>
      <div data-testid="paper-session-detail-error">{workspace.paperSessionDetailError ?? "none"}</div>
      <div data-testid="paper-session-detail-loading">{String(workspace.isPaperSessionDetailLoading)}</div>
      <div data-testid="paper-session-resume-readiness">
        {workspace.paperSessionResumeReadiness
          ? `${workspace.paperSessionResumeReadiness.allowed}|${workspace.paperSessionResumeReadiness.reasonCode}|${workspace.paperSessionResumeReadiness.checkpointSource}`
          : "none"}
      </div>
      <div data-testid="paper-session-resume-readiness-error">{workspace.paperSessionResumeReadinessError ?? "none"}</div>
      <div data-testid="paper-session-resume-readiness-loading">{String(workspace.isPaperSessionResumeReadinessLoading)}</div>
      <div data-testid="paper-session-resume-local">
        {workspace.paperSessionResumeLocalResult
          ? `${workspace.paperSessionResumeLocalResult.status}|${workspace.paperSessionResumeLocalResult.reasonCode}|${
              workspace.paperSessionResumeLocalResult.sourceSessionId ?? "none"
            }|${workspace.paperSessionResumeLocalResult.resumeSessionId ?? "none"}`
          : "none"}
      </div>
      <div data-testid="paper-session-resume-local-error">{workspace.paperSessionResumeLocalError ?? "none"}</div>
      <div data-testid="paper-session-resume-local-loading">{String(workspace.isResumingPaperSessionLocal)}</div>
      <div data-testid="paper-session-can-resume-local">{String(workspace.canResumePaperSessionLocal)}</div>
      <div data-testid="paper-session-resume-local-disabled-reason">
        {workspace.paperSessionResumeLocalDisabledReason ?? "none"}
      </div>
      <div data-testid="paper-session-observability">
        {workspace.paperSessionObservability
          ? `${workspace.paperSessionObservability.safetyStatus}|${workspace.paperSessionObservability.items.length}|${
              workspace.paperSessionObservability.items[0]?.sessionId ?? "none"
            }`
          : "none"}
      </div>
      <div data-testid="paper-session-observability-error">{workspace.paperSessionObservabilityError ?? "none"}</div>
      <div data-testid="paper-session-observability-loading">{String(workspace.isPaperSessionObservabilityLoading)}</div>
      <div data-testid="paper-kill-switch-enabled">{String(workspace.paperKillSwitchStatus?.enabled ?? false)}</div>
      <div>{workspace.paperKillSwitchDisabledReason ?? ""}</div>
      <div data-testid="paper-session-start">
        {workspace.paperSessionStartResult
          ? `${workspace.paperSessionStartResult.status}|${workspace.paperSessionStartResult.reasonCode}|${
              workspace.paperSessionStartResult.sessionId ?? "none"
            }`
          : "none"}
      </div>
      <div data-testid="paper-session-start-error">{workspace.paperSessionStartError ?? "none"}</div>
      <div data-testid="paper-session-start-loading">{String(workspace.isStartingPaperSession)}</div>
      <div data-testid="paper-session-can-start">{String(workspace.canStartPaperSession)}</div>
      <div data-testid="paper-session-start-disabled-reason">{workspace.paperSessionStartDisabledReason ?? "none"}</div>
      <div data-testid="paper-session-run-local">
        {workspace.paperSessionRunLocalResult
          ? `${workspace.paperSessionRunLocalResult.status}|${workspace.paperSessionRunLocalResult.reasonCode}|${
              workspace.paperSessionRunLocalResult.sessionId ?? "none"
            }|${workspace.paperSessionRunLocalResult.candlesProcessed}`
          : "none"}
      </div>
      <div data-testid="paper-session-run-local-error">{workspace.paperSessionRunLocalError ?? "none"}</div>
      <div data-testid="paper-session-run-local-loading">{String(workspace.isRunningPaperSessionLocal)}</div>
      <div data-testid="paper-session-can-run-local">{String(workspace.canRunPaperSessionLocal)}</div>
      <div data-testid="paper-session-run-local-disabled-reason">
        {workspace.paperSessionRunLocalDisabledReason ?? "none"}
      </div>
      <div data-testid="paper-session-cancel-local">
        {workspace.paperSessionCancelLocalResult
          ? `${workspace.paperSessionCancelLocalResult.status}|${workspace.paperSessionCancelLocalResult.reasonCode}|${
              workspace.paperSessionCancelLocalResult.sessionId ?? "none"
            }|${workspace.paperSessionCancelLocalResult.currentStatus ?? "none"}`
          : "none"}
      </div>
      <div data-testid="paper-session-cancel-local-error">{workspace.paperSessionCancelLocalError ?? "none"}</div>
      <div data-testid="paper-session-cancel-local-loading">{String(workspace.isCancellingPaperSessionLocal)}</div>
      <div data-testid="paper-session-can-cancel-local">{String(workspace.canCancelPaperSessionLocal)}</div>
      <div data-testid="paper-session-cancel-local-disabled-reason">
        {workspace.paperSessionCancelLocalDisabledReason ?? "none"}
      </div>
      <div data-testid="paper-session-retry-local">
        {workspace.paperSessionRetryLocalResult
          ? `${workspace.paperSessionRetryLocalResult.status}|${workspace.paperSessionRetryLocalResult.reasonCode}|${
              workspace.paperSessionRetryLocalResult.sourceSessionId ?? "none"
            }|${workspace.paperSessionRetryLocalResult.retrySessionId ?? "none"}`
          : "none"}
      </div>
      <div data-testid="paper-session-retry-local-error">{workspace.paperSessionRetryLocalError ?? "none"}</div>
      <div data-testid="paper-session-retry-local-loading">{String(workspace.isRetryingPaperSessionLocal)}</div>
      <div data-testid="paper-session-can-retry-local">{String(workspace.canRetryPaperSessionLocal)}</div>
      <div data-testid="paper-session-retry-local-disabled-reason">
        {workspace.paperSessionRetryLocalDisabledReason ?? "none"}
      </div>
      <div data-testid="paper-session-setup-reason">
        {workspace.paperSessionPreviewSetupReason
          ? `${workspace.paperSessionPreviewSetupReason.code}|${workspace.paperSessionPreviewSetupReason.message}`
          : "none"}
      </div>
      <div data-testid="dataset-local-fill-loading">{String(workspace.isFillingDatasetLocal)}</div>
      <div data-testid="dataset-local-fill-error">{workspace.datasetLocalFillError ?? "none"}</div>
      <div data-testid="dataset-local-fill-result">{workspace.datasetLocalFillResult?.status ?? "none"}</div>
      <div data-testid="local-fill-audit">
        {workspace.localFillAudit
          ? `${workspace.localFillAudit.datasetKey}|${workspace.localFillAudit.items.length}|${
              workspace.localFillAudit.items[0]?.status ?? "none"
            }`
          : "none"}
      </div>
      <div data-testid="local-fill-audit-loading">{String(workspace.isLocalFillAuditLoading)}</div>
      <div data-testid="local-fill-audit-error">{workspace.localFillAuditError ?? "none"}</div>
      <div data-testid="fill-job-visibility">
        {workspace.fillJobVisibility
          ? `${workspace.fillJobVisibility.datasetKey}|${workspace.fillJobVisibility.active.length}|${workspace.fillJobVisibility.recent.length}`
          : "none"}
      </div>
      <div data-testid="fill-job-visibility-loading">{String(workspace.isFillJobVisibilityLoading)}</div>
      <div data-testid="fill-job-visibility-error">{workspace.fillJobVisibilityError ?? "none"}</div>
      <div data-testid="fill-scheduler-status">
        {workspace.fillSchedulerStatus
          ? `${workspace.fillSchedulerStatus.lastTickStatus}|${workspace.fillSchedulerStatus.workerId}|${workspace.fillSchedulerStatus.consecutiveFailureCount}`
          : "none"}
      </div>
      <div data-testid="fill-scheduler-status-loading">{String(workspace.isFillSchedulerStatusLoading)}</div>
      <div data-testid="fill-scheduler-status-error">{workspace.fillSchedulerStatusError ?? "none"}</div>
      <div data-testid="paper-scheduler-status">
        {workspace.paperSchedulerStatus
          ? `${workspace.paperSchedulerStatus.lastTickStatus}|${workspace.paperSchedulerStatus.workerId}|${workspace.paperSchedulerStatus.consecutiveFailureCount}`
          : "none"}
      </div>
      <div data-testid="paper-scheduler-status-loading">{String(workspace.isPaperSchedulerStatusLoading)}</div>
      <div data-testid="paper-scheduler-status-error">{workspace.paperSchedulerStatusError ?? "none"}</div>
      <div data-testid="dataset-local-fill-confirmed">{String(workspace.isDatasetLocalFillConfirmed)}</div>
      <div data-testid="credential-boundary">{workspace.credentialBoundary.status}</div>
      <div data-testid="compare-candidates">{workspace.compareCandidates.length}</div>
      <div data-testid="compare-mode">
        {workspace.compareMode
          ? `${workspace.compareMode.baseRunId}|${workspace.compareMode.compareRunId}|${
              workspace.compareMode.datasetMismatchWarning ?? "none"
            }`
          : "none"}
      </div>
      <div data-testid="testnet-preview-can">{String(workspace.canPreviewTestnetOrder)}</div>
      <div data-testid="testnet-preview-disabled-reason">{workspace.testnetOrderPreviewDisabledReason ?? "none"}</div>
      <div data-testid="testnet-submit-can">{String(workspace.canConfirmSubmitTestnetOrder)}</div>
      <div data-testid="testnet-cancel-can">{String(workspace.canCancelTestnetOrder)}</div>
      <div data-testid="testnet-reconcile-can">{String(workspace.canReconcileTestnetOrder)}</div>
      <div data-testid="testnet-preview-result">{workspace.testnetOrderPreview?.status ?? "none"}</div>
      <div data-testid="testnet-detail-status">{workspace.testnetOrderDetail?.intent.status ?? "none"}</div>
      <div data-testid="testnet-submit-result">{workspace.testnetOrderSubmitResult?.status ?? "none"}</div>
      <div data-testid="testnet-submit-error">{workspace.testnetOrderSubmitError ?? "none"}</div>
      <div data-testid="testnet-cancel-result">{workspace.testnetOrderCancelResult?.status ?? "none"}</div>
      <div data-testid="testnet-cancel-error">{workspace.testnetOrderCancelError ?? "none"}</div>
      <div data-testid="testnet-reconcile-result">{workspace.testnetOrderReconcileResult?.status ?? "none"}</div>
      <div data-testid="testnet-reconcile-error">{workspace.testnetOrderReconcileError ?? "none"}</div>
      <div data-testid="testnet-project-can">{String(workspace.canProjectTestnetOrderToJournal)}</div>
      <div data-testid="testnet-project-result">{workspace.testnetOrderJournalProjectionResult?.status ?? "none"}</div>
      <div data-testid="testnet-project-error">{workspace.testnetOrderJournalProjectionError ?? "none"}</div>
      <button type="button" onClick={() => void workspace.reopenRun("run-1")}>
        Open run
      </button>
      <button type="button" onClick={() => workspace.setDraftSource("print('changed')")}>
        Edit source
      </button>
      <button type="button" onClick={() => void workspace.checkSyntax()}>
        Check syntax
      </button>
      <button type="button" onClick={() => void workspace.runBacktest()}>
        Run backtest
      </button>
      <button type="button" onClick={() => void workspace.savePaperDraft()}>
        Save paper draft
      </button>
      <button
        type="button"
        onClick={() =>
          workspace.setDraftCredentialBoundaryChecks({
            readOnlyEnabled: true,
            tradingDisabled: true,
            withdrawDisabled: true,
            futuresMarginDisabled: true,
            ipRestricted: true,
          })
        }
      >
        Mark credential ready
      </button>
      <button type="button" onClick={() => workspace.openComparePicker("run-1")}>
        Compare run
      </button>
      <button type="button" onClick={() => void workspace.refreshJobVisibility(workspace.selectedStrategyId ?? undefined)}>
        Refresh jobs
      </button>
      <button type="button" onClick={() => void workspace.refreshLocalFillAudit()}>
        Refresh local fill audit
      </button>
      <button type="button" onClick={() => void workspace.refreshFillJobVisibility()}>
        Refresh fill job visibility
      </button>
      <button type="button" onClick={() => void workspace.refreshFillSchedulerStatus()}>
        Refresh scheduler status
      </button>
      <button type="button" onClick={() => void workspace.refreshPaperSchedulerStatus()}>
        Refresh paper scheduler status
      </button>
      <button type="button" onClick={() => void workspace.createManualSignalPackage()}>
        create-manual-signal
      </button>
      <button type="button" onClick={() => void workspace.createResearchRobustnessGate()}>
        Create robustness gate
      </button>
      <button type="button" onClick={() => void workspace.previewDatasetFillPlan()}>
        Preview fill
      </button>
      <button type="button" onClick={() => void workspace.refreshPaperSessionPreview()}>
        Refresh paper preview
      </button>
      <button type="button" onClick={() => workspace.setPaperSessionDetailInput("paper-session-1")}>
        Set paper session detail id
      </button>
      <button type="button" onClick={() => workspace.setPaperSessionDetailInput("   ")}>
        Set blank paper session detail id
      </button>
      <button type="button" onClick={() => workspace.setPaperSessionDetailInput("paper-session-2")}>
        Set other paper session detail id
      </button>
      <button type="button" onClick={() => void workspace.loadPaperSessionDetail()}>
        Load paper session detail
      </button>
      <button type="button" onClick={() => void workspace.refreshPaperSessionObservability()}>
        Refresh paper sessions
      </button>
      <button type="button" onClick={() => void workspace.loadPaperSessionDetailFromSummary("paper-session-1")}>
        Load paper session detail from summary
      </button>
      <button type="button" onClick={() => void workspace.startPaperSessionFromPreview()}>
        Start paper session
      </button>
      <button type="button" onClick={() => void workspace.runPaperSessionLocal()}>
        Run local paper session
      </button>
      <button type="button" onClick={() => void workspace.cancelPaperSessionLocal()}>
        Cancel local paper session
      </button>
      <button type="button" onClick={() => void workspace.retryPaperSessionLocal()}>
        Retry local paper session
      </button>
      <button type="button" onClick={() => void workspace.resumePaperSessionLocal()}>
        Resume local paper session
      </button>
      <button
        type="button"
        onClick={() =>
          workspace.setDraftRuntimeConfig({
            ...workspace.draftRuntimeConfig,
            symbol: "ETHUSDT",
          })
        }
      >
        Change paper runtime context
      </button>
      <button
        type="button"
        onClick={() =>
          workspace.setDraftRuntimeConfig({
            ...workspace.draftRuntimeConfig,
            marketType: "USD_M_FUTURES",
            defaultLeverage: 10,
          })
        }
      >
        Enable futures runtime
      </button>
      <button type="button" onClick={() => workspace.setIsDatasetLocalFillConfirmed(true)}>
        Confirm local fill checkbox
      </button>
      <button type="button" onClick={() => void workspace.confirmDatasetLocalFill()}>
        Confirm local fill
      </button>
      <button type="button" onClick={() => workspace.selectStrategy("strategy-2")}>
        Select strategy 2
      </button>
      <button type="button" onClick={() => void workspace.chooseCompareRun("run-2")}>
        Pick run 2
      </button>
      <button type="button" onClick={workspace.exitCompareMode}>
        Exit compare
      </button>
      <button type="button" onClick={() => workspace.setTestnetCredentialRefId("credential-ref-1")}>
        Set testnet credential
      </button>
      <button type="button" onClick={() => workspace.setTestnetOrderAmount("25")}>
        Set testnet amount
      </button>
      <button type="button" onClick={() => void workspace.previewTestnetOrder()}>
        Preview testnet order
      </button>
      <button type="button" onClick={() => void workspace.confirmSubmitTestnetOrder()}>
        Confirm submit testnet order
      </button>
      <button type="button" onClick={() => void workspace.cancelTestnetOrder()}>
        Cancel testnet order
      </button>
      <button type="button" onClick={() => void workspace.reconcileTestnetOrder()}>
        Reconcile testnet order
      </button>
      <button type="button" onClick={() => void workspace.projectTestnetOrderToJournal()}>
        Project testnet order
      </button>
    </div>
  )
}

describe("useTradeLabWorkspace", () => {
  beforeEach(() => {
    vi.useRealTimers()
    for (const fn of Object.values(mocks.api)) {
      fn.mockReset()
    }

    mocks.api.listStrategyGroups.mockResolvedValue({
      items: [
        {
          id: "group-1",
          name: "Momentum",
          slug: "momentum",
          description: "Momentum strategies",
          metadata: {},
        },
      ],
    })
    mocks.api.listStrategies.mockResolvedValue({
      items: [
        {
          id: "strategy-1",
          strategy_group_id: "group-1",
          name: "Supertrend",
          slug: "supertrend",
          description: "Trend follower",
          status: "active",
          current_version_id: "version-2",
          runtime_config: {
            exchange: "binance",
            symbol: "BTCUSDT",
            timeframe: "1h",
            start_at: "2026-01-01T00:00:00Z",
            end_at: "2026-01-02T00:00:00Z",
            initial_equity: 1000,
            fee_bps: 0,
            slippage_bps: 0,
          },
          risk_config: {
            max_order_percent: 10,
            max_position_percent: 100,
            max_drawdown_percent: 15,
            min_notional: 10,
            step_size: 0.001,
            tick_size: 0.01,
          },
          versions: [
            {
              id: "version-1",
              strategy_id: "strategy-1",
              version_number: 1,
              validation_status: "valid",
              validation_message: null,
              source_code: "print('v1')",
              source_hash: "hash-1",
              created_at: "2026-01-01T00:00:00Z",
            },
            {
              id: "version-2",
              strategy_id: "strategy-1",
              version_number: 2,
              validation_status: "valid",
              validation_message: null,
              source_code: "print('v2')",
              source_hash: "hash-2",
              created_at: "2026-01-02T00:00:00Z",
            },
          ],
        },
      ],
    })
    mocks.api.getStrategy.mockResolvedValue({
      id: "strategy-1",
      strategy_group_id: "group-1",
      name: "Supertrend",
      slug: "supertrend",
      description: "Trend follower",
      status: "active",
      current_version_id: "version-2",
      runtime_config: {
        exchange: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        start_at: "2026-01-01T00:00:00Z",
        end_at: "2026-01-02T00:00:00Z",
        initial_equity: 1000,
        fee_bps: 0,
        slippage_bps: 0,
      },
      risk_config: {
        max_order_percent: 10,
        max_position_percent: 100,
        max_drawdown_percent: 15,
        min_notional: 10,
        step_size: 0.001,
        tick_size: 0.01,
      },
      metadata: {},
      versions: [
        {
          id: "version-1",
          strategy_id: "strategy-1",
          version_number: 1,
          validation_status: "valid",
          validation_message: null,
          source_code: "print('v1')",
          source_hash: "hash-1",
          created_at: "2026-01-01T00:00:00Z",
        },
        {
          id: "version-2",
          strategy_id: "strategy-1",
          version_number: 2,
          validation_status: "valid",
          validation_message: null,
          source_code: "print('v2')",
          source_hash: "hash-2",
          created_at: "2026-01-02T00:00:00Z",
        },
      ],
      version_count: 2,
    })
    mocks.api.listBots.mockResolvedValue({ items: [] })
    mocks.api.listDatasetCoverage.mockResolvedValue({
      items: [
        {
          id: "coverage-1",
          dataset_key: "binance:BTCUSDT:1h",
          exchange: "binance",
          symbol: "BTCUSDT",
          timeframe: "1h",
          health_status: "healthy",
          earliest_open_time: "2026-01-01T00:00:00Z",
          latest_open_time: "2026-01-02T00:00:00Z",
          covered_start_at: "2026-01-01T00:00:00Z",
          covered_end_at: "2026-01-02T00:00:00Z",
          segment_count: 1,
          gap_count: 0,
          last_checked_at: "2026-01-02T00:00:00Z",
          metadata: {},
          segments: [],
        },
      ],
    })
    mocks.api.getBenchmarkChecks.mockResolvedValue({ latest: null, items: [] })
    mocks.api.getStrategyJobVisibility.mockResolvedValue({
      strategy_id: "strategy-1",
      stale_threshold_minutes: 10,
      active: [],
      recent: [],
    })
    mocks.api.getDatasetLocalFillAudit.mockResolvedValue({
      dataset_key: "binance:BTCUSDT:1h",
      exchange: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      safety_status: "read_only",
      items: [],
    })
    mocks.api.getDatasetFillJobVisibility.mockResolvedValue({
      dataset_key: "binance:BTCUSDT:1h",
      exchange: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      safety_status: "read_only",
      active: [],
      recent: [],
    })
    mocks.api.getFillSchedulerStatus.mockResolvedValue({
      enabled: false,
      running: false,
      worker_id: "trade-lab-local-scheduler",
      interval_seconds: 60,
      last_tick_started_at: null,
      last_tick_completed_at: null,
      last_tick_status: "disabled",
      last_skip_reason: "dataset_fill_scheduler_disabled",
      last_reason_code: null,
      last_job_id: null,
      last_dataset_key: null,
      stale_jobs_marked: 0,
      consecutive_failure_count: 0,
      safety_status: "read_only_scheduler_visibility",
    })
    mocks.api.getPaperSchedulerStatus.mockResolvedValue({
      enabled: false,
      running: false,
      worker_id: "tradelab-local-paper-scheduler",
      interval_seconds: 60,
      last_tick_started_at: null,
      last_tick_completed_at: null,
      last_tick_status: "disabled",
      last_skip_reason: "paper_scheduler_disabled",
      last_reason_code: "paper_scheduler_disabled",
      last_session_id: null,
      candles_processed: 0,
      orders_created: 0,
      fills_created: 0,
      snapshots_created: 0,
      consecutive_failure_count: 0,
      safety_status: "read_only_paper_scheduler_visibility",
    })
    mocks.api.getPaperKillSwitchStatus.mockResolvedValue({
      enabled: false,
      reasonCode: "paper_kill_switch_status_read",
      safetyStatus: "read_only_paper_kill_switch_status",
      source: "config",
      updatedAt: null,
      updatedBy: null,
      details: { environment: "local", localDevOnly: true },
    })
    mocks.api.getPaperSessionResumeReadiness.mockResolvedValue({
      session_id: "paper-session-1",
      status: "cancelled",
      reason_code: "paper_local_resume_readiness_ready",
      allowed: true,
      safety_status: "read_only_paper_resume_readiness",
      checkpoint: null,
      checkpoint_source: "persisted",
      artifact_identity_status: "ready",
      resume_mode: "same_session",
      attempt_no: 1,
      blocking_reasons: [],
      details: {},
    })
    mocks.api.resumePaperSessionLocal.mockResolvedValue({
      status: "queued",
      reason_code: "paper_local_resume_queued",
      safety_status: "local_dev_paper_resume",
      source_session_id: "paper-session-1",
      resume_session_id: "paper-session-1",
      source_status: "cancelled",
      resume_status: "queued",
      idempotency_key: "paper-resume:paper-session-1:strategy-lab-resume:paper-session-1:1",
      resume_cursor: {
        last_processed_candle_id: "candle-1",
        next_candle_open_time: "2026-01-01T01:00:00Z",
        attempt_no: 1,
      },
      details: {},
    })
    mocks.api.previewTestnetOrder.mockResolvedValue({
      status: "allowed",
      allowed: true,
      reason_code: "testnet_order_preview_allowed",
      safety_status: "assisted_testnet_order_preview_only",
      intent_id: "intent-1",
      preview_id: "preview-1",
      client_order_id: "client-order-1",
      expires_at: "2026-06-01T10:00:00Z",
      order: {
        environment: "binance_testnet",
        exchange: "binance",
        market_type: "spot",
        symbol: "BTCUSDT",
        side: "buy",
        order_type: "market",
        quantity: null,
        quote_quantity: "25",
      },
      credential_snapshot: {},
      risk_snapshot: {},
      audit_event_ids: ["event-preview"],
      details: {},
    })
    mocks.api.confirmSubmitTestnetOrder.mockResolvedValue({
      status: "submitted",
      reason_code: "testnet_order_submit_binance_accepted",
      safety_status: "assisted_testnet_real_submit_testnet_only",
      intent_id: "intent-1",
      preview_id: "preview-1",
      client_order_id: "client-order-1",
      exchange_order_id: "exchange-1",
      intent_status: "submitted",
      submit_snapshot: {},
      audit_event_ids: ["event-submit"],
      details: {},
    })
    mocks.api.cancelTestnetOrder.mockResolvedValue({
      status: "cancelled",
      reason_code: "testnet_order_cancel_binance_accepted",
      safety_status: "assisted_testnet_cancel_testnet_only",
      intent_id: "intent-1",
      client_order_id: "client-order-1",
      exchange_order_id: "exchange-1",
      intent_status: "cancelled",
      cancel_snapshot: {},
      audit_event_ids: ["event-cancel"],
      details: {},
    })
    mocks.api.reconcileTestnetOrder.mockResolvedValue({
      status: "reconciled",
      reason_code: "testnet_order_reconcile_binance_matched",
      safety_status: "assisted_testnet_reconcile_testnet_only",
      intent_id: "intent-1",
      client_order_id: "client-order-1",
      exchange_order_id: "exchange-1",
      intent_status: "reconciled",
      reconciliation_attempt_id: "attempt-1",
      reconcile_snapshot: {},
      audit_event_ids: ["event-reconcile"],
      details: {},
    })
    mocks.api.projectTestnetOrderToJournal.mockResolvedValue({
      status: "journal_projected",
      reason_code: "testnet_order_journal_projection_created",
      safety_status: "assisted_testnet_execution_journal_projection",
      semantic_status_code: 200,
      should_commit: true,
      intent_id: "intent-1",
      journal_entry_id: "entry-1",
      client_order_id: "client-order-1",
      intent_status: "journal_projected",
      audit_event_ids: ["event-project"],
      details: {},
    })
    mocks.api.getTestnetOrderDetail.mockResolvedValue({
      safety_status: "assisted_testnet_order_read_only",
      intent: {
        intent_id: "intent-1",
        intent_key: "intent-key-1",
        status: "submitted",
        reason_code: "testnet_order_submit_binance_accepted",
        client_order_id: "client-order-1",
        environment: "binance_testnet",
        exchange: "binance",
        market_type: "spot",
        symbol: "BTCUSDT",
        side: "buy",
        order_type: "market",
        quantity: null,
        quote_quantity: "25",
        strategy_id: "strategy-1",
        strategy_version_id: "version-2",
        source_run_id: "run-1",
        credential_ref_id: "credential-ref-1",
        latest_preview_id: "preview-1",
        reconciliation_required: false,
      },
      latest_preview: null,
      previews: [],
      events: [],
      reconciliation_attempts: [],
    })
    mocks.api.listTestnetOrders.mockResolvedValue({
      safety_status: "assisted_testnet_order_list_read_only",
      items: [],
    })
    mocks.api.listPaperSessions.mockResolvedValue({
      safety_status: "read_only_paper_session_observability",
      has_more: false,
      items: [],
    })
    mocks.api.previewDatasetFill.mockResolvedValue({
      preview_id: "preview-1",
      generated_at: "2026-05-17T00:00:00Z",
      request_fingerprint: "fingerprint-1",
      dataset_key: "binance:BTCUSDT:1h",
      exchange: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      requested_range: {
        start_at: "2026-01-01T00:00:00Z",
        end_at: "2026-01-02T00:00:00Z",
      },
      coverage_status: "partial",
      gap_count: 1,
      estimated_rows: 24,
      blocked_reasons: [],
      safety_status: "preview_only",
      missing_ranges: [],
      active_job_id: null,
      active_job_type: null,
    })
    mocks.api.startPaperSession.mockResolvedValue({
      session_id: "paper-session-started",
      status: "queued",
      allowed: true,
      reason_code: "paper_session_queued",
      safety_status: "paper_start_accepted",
      request_fingerprint: "paper-start:fingerprint",
      idempotency_key: "strategy-lab:test-key",
      failed_gates: [],
      warnings: [],
      details: {},
      dataset_context: {
        dataset_key: "binance:BTCUSDT:1h",
        exchange: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        start_at: "2026-01-01T00:00:00Z",
        end_at: "2026-01-02T00:00:00Z",
      },
      gate_context: {},
      audit_event_ids: ["audit-queued"],
    })
    mocks.api.fillDatasetLocal.mockResolvedValue({
      job_id: "job-1",
      dataset_key: "binance:BTCUSDT:1h",
      status: "completed",
      safety_status: "local_dev_fill_only",
      requested_range: {
        start_at: "2026-01-01T00:00:00Z",
        end_at: "2026-01-02T00:00:00Z",
      },
      ranges_filled: [],
      rows_fetched: 2,
      rows_inserted: 2,
      rows_skipped_existing: 0,
      blocked_reasons: [],
      preview_id: "preview-1",
      request_fingerprint: "fingerprint-1",
    })
    mocks.api.listBotRuns.mockResolvedValue({
      items: [
        {
          id: "run-1",
          bot_id: "bot-1",
          strategy_id: "strategy-1",
          strategy_version_id: "version-1",
          run_type: "backtest",
          status: "completed",
          pipeline_status: "completed",
          exchange: "binance",
          symbol: "BTCUSDT",
          timeframe: "1h",
          start_at: "2026-01-01T00:00:00Z",
          end_at: "2026-01-02T00:00:00Z",
          started_at: "2026-01-03T00:00:00Z",
          finished_at: "2026-01-03T00:05:00Z",
          data_job_id: null,
          error_message: null,
          created_at: "2026-01-03T00:00:00Z",
          created_by: "codex",
          snapshot: null,
        },
        {
          id: "run-2",
          bot_id: "bot-1",
          strategy_id: "strategy-1",
          strategy_version_id: "version-1",
          run_type: "backtest",
          status: "completed",
          pipeline_status: "completed",
          exchange: "binance",
          symbol: "ETHUSDT",
          timeframe: "4h",
          start_at: "2026-01-05T00:00:00Z",
          end_at: "2026-01-06T00:00:00Z",
          started_at: "2026-01-06T00:00:00Z",
          finished_at: "2026-01-06T00:02:00Z",
          data_job_id: null,
          error_message: null,
          created_at: "2026-01-06T00:00:00Z",
          created_by: "codex",
          snapshot: null,
        },
        {
          id: "run-3",
          bot_id: "bot-1",
          strategy_id: "strategy-1",
          strategy_version_id: "version-1",
          run_type: "backtest",
          status: "running",
          pipeline_status: "running",
          exchange: "binance",
          symbol: "BTCUSDT",
          timeframe: "1h",
          start_at: "2026-01-07T00:00:00Z",
          end_at: "2026-01-08T00:00:00Z",
          started_at: "2026-01-08T00:00:00Z",
          finished_at: null,
          data_job_id: null,
          error_message: null,
          created_at: "2026-01-08T00:00:00Z",
          created_by: "codex",
          snapshot: null,
        },
        {
          id: "run-4",
          bot_id: "bot-2",
          strategy_id: "strategy-2",
          strategy_version_id: "version-9",
          run_type: "backtest",
          status: "completed",
          pipeline_status: "completed",
          exchange: "binance",
          symbol: "BTCUSDT",
          timeframe: "1h",
          start_at: "2026-01-09T00:00:00Z",
          end_at: "2026-01-10T00:00:00Z",
          started_at: "2026-01-10T00:00:00Z",
          finished_at: "2026-01-10T00:02:00Z",
          data_job_id: null,
          error_message: null,
          created_at: "2026-01-10T00:00:00Z",
          created_by: "codex",
          snapshot: null,
        },
      ],
    })
    mocks.api.getBotRunAnalysis.mockResolvedValue({
      run: {
        id: "run-1",
        bot_id: "bot-1",
        strategy_id: "strategy-1",
        strategy_version_id: "version-1",
        status: "completed",
        pipeline_status: "completed",
        started_at: "2026-01-03T00:00:00Z",
        finished_at: "2026-01-03T00:05:00Z",
        error_message: null,
        stop_reason: null,
        snapshot: {
          source_snapshot: { sourceCode: "print('snapshot-v1')", strategyVersionId: "version-1" },
          dataset_context: {
            exchange: "binance",
            symbol: "BTCUSDT",
            timeframe: "1h",
            requestedStartAt: "2026-01-01T00:00:00Z",
            requestedEndAt: "2026-01-02T00:00:00Z",
          },
          pipeline_context: {},
        },
      },
      result: {
        id: "result-1",
        bot_run_id: "run-1",
        initial_equity: 1000,
        final_equity: 1100,
        total_return_pct: 10,
        max_drawdown_pct: 5,
        profit_factor: 1.5,
        win_rate_pct: 50,
        total_trades: 1,
        metrics: {
          initial_equity: 1000,
          final_equity: 1100,
          total_return_pct: 10,
          max_drawdown_pct: 5,
          profit_factor: 1.5,
          win_rate_pct: 50,
          total_trades: 1,
          closed_trades: 1,
        },
        equity_curve: [],
        created_at: "2026-01-03T00:05:00Z",
      },
      snapshot: {
        source_snapshot: {
          sourceCode: "print('snapshot-v1')",
          strategyVersionId: "version-1",
        },
        dataset_context: {
          exchange: "binance",
          symbol: "BTCUSDT",
          timeframe: "1h",
          requestedStartAt: "2026-01-01T00:00:00Z",
          requestedEndAt: "2026-01-02T00:00:00Z",
          sourceHash: "hash-1",
          strategyVersionId: "version-1",
        },
        pipeline_context: {},
      },
      runtime_config: {
        exchange: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        startAt: "2026-01-01T00:00:00Z",
        endAt: "2026-01-02T00:00:00Z",
        initialEquity: 1000,
        feeBps: 0,
        slippageBps: 0,
      },
      risk_config: {
        maxOrderPercent: 10,
        maxPositionPercent: 100,
        maxDrawdownPercent: 15,
        minNotional: 10,
        stepSize: 0.001,
        tickSize: 0.01,
      },
      dataset_context: {
        dataset_key: "binance:BTCUSDT:1h",
        exchange: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        requested_start_at: "2026-01-01T00:00:00Z",
        requested_end_at: "2026-01-02T00:00:00Z",
        source_hash: "hash-1",
        strategy_version_id: "version-1",
        coverage: null,
      },
      trade_summary: {
        total_trades: 1,
        closed_trades: 1,
        open_trades: 0,
        winning_trades: 1,
        losing_trades: 0,
        break_even_trades: 0,
        realized_pnl: 10,
        average_pnl: 10,
        average_pnl_pct: 1,
        average_duration_seconds: 3600,
        win_rate_pct: 100,
        profit_factor: 2,
      },
      trades: [
        {
          id: "trade-1",
          entry_order_id: "entry-1",
          exit_order_id: "exit-1",
          entry_time: "2026-01-01T01:00:00Z",
          exit_time: "2026-01-01T02:00:00Z",
          side: "buy",
          status: "closed",
          entry_price: 100,
          exit_price: 110,
          quantity: 1,
          pnl: 10,
          pnl_pct: 10,
          duration_seconds: 3600,
          entry_signal_id: "signal-1",
          exit_signal_id: "signal-2",
          entry_reason: "Entry",
          exit_reason: "Exit",
        },
      ],
    })
    mocks.api.getBotRunTradeDetail.mockResolvedValue({
      trade: {
        id: "trade-1",
        entry_order_id: "entry-1",
        exit_order_id: "exit-1",
        entry_time: "2026-01-01T01:00:00Z",
        exit_time: "2026-01-01T02:00:00Z",
        side: "buy",
        status: "closed",
        entry_price: 100,
        exit_price: 110,
        quantity: 1,
        pnl: 10,
        pnl_pct: 10,
        duration_seconds: 3600,
        entry_signal_id: "signal-1",
        exit_signal_id: "signal-2",
        entry_reason: "Entry",
        exit_reason: "Exit",
      },
      entry_order: {
        id: "entry-1",
        created_at: "2026-01-01T01:00:00Z",
        side: "buy",
        order_type: "market",
        status: "filled",
        fill_price: 100,
        fill_qty: 1,
        fill_notional: 100,
        fee_amount: 0,
        reason: "Entry",
        payload: {},
      },
      exit_order: {
        id: "exit-1",
        created_at: "2026-01-01T02:00:00Z",
        side: "sell",
        order_type: "market",
        status: "filled",
        fill_price: 110,
        fill_qty: 1,
        fill_notional: 110,
        fee_amount: 0,
        reason: "Exit",
        payload: {},
      },
      entry_signal: {
        id: "signal-1",
        signal_type: "entry",
        candle_open_time: "2026-01-01T01:00:00Z",
      },
      exit_signal: {
        id: "signal-2",
        signal_type: "exit",
        candle_open_time: "2026-01-01T02:00:00Z",
      },
      logs: [
        {
          id: "log-1",
          created_at: "2026-01-01T01:00:00Z",
          level: "info",
          event_type: "TRADE_OPENED",
          message: "Trade opened.",
          payload: {},
        },
      ],
    })
    mocks.api.getBotRun.mockResolvedValue({
      id: "run-1",
      bot_id: "bot-1",
      strategy_id: "strategy-1",
      strategy_version_id: "version-1",
      status: "completed",
      pipeline_status: "completed",
      started_at: "2026-01-03T00:00:00Z",
      finished_at: "2026-01-03T00:05:00Z",
      error_message: null,
      stop_reason: null,
      snapshot: {
        source_snapshot: {
          sourceCode: "print('snapshot-v1')",
          strategyVersionId: "version-1",
        },
        dataset_context: {
          exchange: "binance",
          symbol: "BTCUSDT",
          timeframe: "1h",
          requestedStartAt: "2026-01-01T00:00:00Z",
          requestedEndAt: "2026-01-02T00:00:00Z",
        },
        pipeline_context: {},
      },
      result: {
        metrics: {
          initial_equity: 1000,
          final_equity: 1100,
          total_return_pct: 10,
          max_drawdown_pct: 5,
          profit_factor: 1.5,
          win_rate_pct: 50,
          total_trades: 2,
          closed_trades: 2,
        },
        equity_curve: [],
      },
      pipeline: {
        run: {
          id: "run-1",
          bot_id: "bot-1",
          strategy_id: "strategy-1",
          strategy_version_id: "version-1",
          run_type: "backtest",
          status: "completed",
          pipeline_status: "completed",
          exchange: "binance",
          symbol: "BTCUSDT",
          timeframe: "1h",
          start_at: "2026-01-01T00:00:00Z",
          end_at: "2026-01-02T00:00:00Z",
          started_at: "2026-01-03T00:00:00Z",
          finished_at: "2026-01-03T00:05:00Z",
          data_job_id: null,
          error_message: null,
          created_at: "2026-01-03T00:00:00Z",
          created_by: "codex",
          snapshot: null,
        },
        preflight: null,
        data_job: null,
        backtest_job: {},
        status: "completed",
        message: "Completed",
      },
    })
    mocks.api.getBotRunPipeline.mockResolvedValue({
      run: {
        id: "run-1",
        bot_id: "bot-1",
        strategy_id: "strategy-1",
        strategy_version_id: "version-1",
        run_type: "backtest",
        status: "completed",
        pipeline_status: "completed",
        exchange: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        start_at: "2026-01-01T00:00:00Z",
        end_at: "2026-01-02T00:00:00Z",
        started_at: "2026-01-03T00:00:00Z",
        finished_at: "2026-01-03T00:05:00Z",
        data_job_id: null,
        error_message: null,
        created_at: "2026-01-03T00:00:00Z",
        created_by: "codex",
        snapshot: null,
      },
      preflight: null,
      data_job: null,
      backtest_job: {},
      status: "completed",
      message: "Completed",
    })
    mocks.api.getBotRunChart.mockResolvedValue({
      candles: [],
      markers: [],
      equity_curve: [],
      selected_trade: null,
    })
    mocks.api.getBotRunLogs.mockResolvedValue({ items: [] })
    mocks.api.getBotRunOrders.mockResolvedValue({ items: [] })
    mocks.api.getBotRunResult.mockResolvedValue({
      metrics: {
        initial_equity: 1000,
        final_equity: 1100,
        total_return_pct: 10,
        max_drawdown_pct: 5,
        profit_factor: 1.5,
        win_rate_pct: 50,
        total_trades: 2,
        closed_trades: 2,
      },
      equity_curve: [],
    })
    mocks.api.getBotRunAnalysis.mockResolvedValue({
      run: {
        id: "run-1",
        bot_id: "bot-1",
        strategy_id: "strategy-1",
        strategy_version_id: "version-1",
        status: "completed",
        pipeline_status: "completed",
        started_at: "2026-01-03T00:00:00Z",
        finished_at: "2026-01-03T00:05:00Z",
        error_message: null,
        stop_reason: null,
        snapshot: {
          source_snapshot: {
            sourceCode: "print('snapshot-v1')",
            strategyVersionId: "version-1",
          },
          dataset_context: {
            exchange: "binance",
            symbol: "BTCUSDT",
            timeframe: "1h",
            requestedStartAt: "2026-01-01T00:00:00Z",
            requestedEndAt: "2026-01-02T00:00:00Z",
            sourceHash: "hash-1",
            strategyVersionId: "version-1",
          },
          pipeline_context: {},
        },
      },
      result: {
        id: "result-1",
        bot_run_id: "run-1",
        initial_equity: 1000,
        final_equity: 1100,
        total_return_pct: 10,
        max_drawdown_pct: 5,
        profit_factor: 1.5,
        win_rate_pct: 50,
        total_trades: 1,
        metrics: {
          initial_equity: 1000,
          final_equity: 1100,
          total_return_pct: 10,
          max_drawdown_pct: 5,
          profit_factor: 1.5,
          win_rate_pct: 50,
          total_trades: 1,
          closed_trades: 1,
        },
        equity_curve: [],
        created_at: "2026-01-03T00:05:00Z",
      },
      snapshot: {
        source_snapshot: {
          sourceCode: "print('snapshot-v1')",
          strategyVersionId: "version-1",
        },
        dataset_context: {
          exchange: "binance",
          symbol: "BTCUSDT",
          timeframe: "1h",
          requestedStartAt: "2026-01-01T00:00:00Z",
          requestedEndAt: "2026-01-02T00:00:00Z",
          sourceHash: "hash-1",
          strategyVersionId: "version-1",
        },
        pipeline_context: {},
      },
      runtime_config: {
        exchange: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        startAt: "2026-01-01T00:00:00Z",
        endAt: "2026-01-02T00:00:00Z",
        initialEquity: 1000,
        feeBps: 0,
        slippageBps: 0,
      },
      risk_config: {
        maxOrderPercent: 10,
        maxPositionPercent: 100,
        maxDrawdownPercent: 15,
        minNotional: 10,
        stepSize: 0.001,
        tickSize: 0.01,
      },
      dataset_context: {
        dataset_key: "binance:BTCUSDT:1h",
        exchange: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        requested_start_at: "2026-01-01T00:00:00Z",
        requested_end_at: "2026-01-02T00:00:00Z",
        source_hash: "hash-1",
        strategy_version_id: "version-1",
        coverage: null,
      },
      trade_summary: {
        total_trades: 1,
        closed_trades: 1,
        open_trades: 0,
        winning_trades: 1,
        losing_trades: 0,
        break_even_trades: 0,
        realized_pnl: 10,
        average_pnl: 10,
        average_pnl_pct: 1,
        average_duration_seconds: 3600,
        win_rate_pct: 100,
        profit_factor: 2,
      },
      trades: [
        {
          id: "trade-1",
          entry_order_id: "entry-1",
          exit_order_id: "exit-1",
          entry_time: "2026-01-01T01:00:00Z",
          exit_time: "2026-01-01T02:00:00Z",
          side: "buy",
          status: "closed",
          entry_price: 100,
          exit_price: 110,
          quantity: 1,
          pnl: 10,
          pnl_pct: 10,
          duration_seconds: 3600,
          entry_signal_id: "signal-1",
          exit_signal_id: "signal-2",
          entry_reason: "Entry",
          exit_reason: "Exit",
        },
      ],
    })
    mocks.api.getBotRunTradeDetail.mockResolvedValue({
      trade: {
        id: "trade-1",
        entry_order_id: "entry-1",
        exit_order_id: "exit-1",
        entry_time: "2026-01-01T01:00:00Z",
        exit_time: "2026-01-01T02:00:00Z",
        side: "buy",
        status: "closed",
        entry_price: 100,
        exit_price: 110,
        quantity: 1,
        pnl: 10,
        pnl_pct: 10,
        duration_seconds: 3600,
        entry_signal_id: "signal-1",
        exit_signal_id: "signal-2",
        entry_reason: "Entry",
        exit_reason: "Exit",
      },
      entry_order: {
        id: "entry-1",
        created_at: "2026-01-01T01:00:00Z",
        side: "buy",
        order_type: "market",
        status: "filled",
        fill_price: 100,
        fill_qty: 1,
        fill_notional: 100,
        fee_amount: 0,
        reason: "Entry",
        payload: {},
      },
      exit_order: {
        id: "exit-1",
        created_at: "2026-01-01T02:00:00Z",
        side: "sell",
        order_type: "market",
        status: "filled",
        fill_price: 110,
        fill_qty: 1,
        fill_notional: 110,
        fee_amount: 0,
        reason: "Exit",
        payload: {},
      },
      entry_signal: {
        id: "signal-1",
        signal_type: "entry",
        candle_open_time: "2026-01-01T01:00:00Z",
      },
      exit_signal: {
        id: "signal-2",
        signal_type: "exit",
        candle_open_time: "2026-01-01T02:00:00Z",
      },
      logs: [
        {
          id: "log-1",
          created_at: "2026-01-01T01:00:00Z",
          level: "info",
          event_type: "TRADE_OPENED",
          message: "Trade opened.",
          payload: {},
        },
      ],
    })
  })

  it("selects the baseline or workbench group before metadata test groups", async () => {
    mocks.api.listStrategyGroups.mockResolvedValueOnce({
      items: [
        {
          id: "group-test",
          name: "Generated Test",
          slug: "generated-test",
          description: "Debug fixture",
          metadata: { visibility: "test" },
        },
        {
          id: "group-baseline",
          name: "TradeLab Baseline",
          slug: "tradelab-baseline",
          description: "Functional smoke baseline",
          metadata: { visibility: "workbench", isBaseline: true },
        },
      ],
    })
    mocks.api.listStrategies.mockResolvedValueOnce({
      items: [
        {
          id: "strategy-baseline",
          strategy_group_id: "group-baseline",
          name: "TradeLab Baseline SMA 9/21",
          slug: "tradelab-baseline-sma-9-21",
          description: "Functional smoke baseline",
          status: "active",
          current_version_id: "version-2",
          runtime_config: {
            exchange: "binance",
            symbol: "BTCUSDT",
            timeframe: "1h",
            start_at: "2026-01-01T00:00:00Z",
            end_at: "2026-01-07T00:00:00Z",
            initial_equity: 1000,
            fee_bps: 10,
            slippage_bps: 1,
          },
          risk_config: {
            max_order_percent: 25,
            max_position_percent: 100,
            max_drawdown_percent: 25,
            min_notional: 10,
            step_size: 0.001,
            tick_size: 0.01,
          },
        },
      ],
    })

    render(<HookHarness />)

    await waitFor(() => {
      expect(screen.getByTestId("selected-group").textContent).toBe("group-baseline")
    })
    expect(screen.getByTestId("selected-strategy").textContent).toBe("strategy-baseline")
    expect(mocks.api.listStrategies.mock.calls[0]).toEqual([])
  })

  it("loads and manually refreshes strategy job visibility", async () => {
    const user = userEvent.setup()
    mocks.api.getStrategyJobVisibility.mockResolvedValue({
      strategy_id: "strategy-1",
      stale_threshold_minutes: 10,
      active: [
        {
          run: {
            id: "run-active",
            strategy_id: "strategy-1",
            strategy_version_id: "version-2",
            status: "queued",
            pipeline_status: "waiting_for_data",
            exchange: "binance",
            symbol: "BTCUSDT",
            timeframe: "1h",
            start_at: "2026-01-01T00:00:00Z",
            end_at: "2026-01-02T00:00:00Z",
            created_at: "2026-01-01T00:00:00Z",
          },
          status: "waiting_for_data",
          is_stale: false,
          stale_reason: null,
          last_activity_at: "2026-01-01T00:00:00Z",
        },
      ],
      recent: [],
    })

    render(<HookHarness />)

    await waitFor(() => {
      expect(screen.getByTestId("job-visibility").textContent).toBe("strategy-1|1|0")
    })
    expect(mocks.api.getStrategyJobVisibility).toHaveBeenCalledWith("strategy-1", { limit: 5 })

    await user.click(screen.getByRole("button", { name: "Refresh jobs" }))
    await waitFor(() => {
      expect(mocks.api.getStrategyJobVisibility).toHaveBeenCalledTimes(2)
    })
  })

  it("previews dataset fill plan without starting mutation actions", async () => {
    const user = userEvent.setup()
    render(<HookHarness />)

    await waitFor(() => {
      expect(screen.getByTestId("selected-strategy").textContent).toBe("strategy-1")
    })

    await user.click(screen.getByRole("button", { name: "Preview fill" }))

    await waitFor(() => {
      expect(screen.getByTestId("dataset-fill-preview").textContent).toBe(
        "binance:BTCUSDT:1h|partial|preview_only",
      )
    })
    expect(screen.getByTestId("dataset-fill-preview-error").textContent).toBe("none")
    expect(mocks.api.previewDatasetFill).toHaveBeenCalledWith({
      strategy_id: "strategy-1",
      exchange: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      requested_start_at: "2026-01-01T00:00:00Z",
      requested_end_at: "2026-01-02T00:00:00Z",
      source: "strategy_lab",
    })
    expect(mocks.api.preflightBotBacktest).not.toHaveBeenCalled()
    expect(mocks.api.startBotBacktest).not.toHaveBeenCalled()
    expect(mocks.api.createBot).not.toHaveBeenCalled()
  })

  it("confirms local dataset fill from current preview and refreshes read state", async () => {
    const user = userEvent.setup()
    mocks.api.previewDatasetFill.mockResolvedValueOnce({
      preview_id: "preview-1",
      generated_at: "2026-05-18T00:00:00Z",
      request_fingerprint: "fingerprint-1",
      dataset_key: "binance:BTCUSDT:1h",
      exchange: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      requested_range: {
        start_at: "2026-01-01T00:00:00Z",
        end_at: "2026-01-07T00:00:00Z",
      },
      coverage_status: "partial",
      gap_count: 1,
      estimated_rows: 24,
      blocked_reasons: [],
      safety_status: "preview_only",
      missing_ranges: [{ start_at: "2026-01-01T00:00:00Z", end_at: "2026-01-01T02:00:00Z", kind: "head" }],
      active_job_id: null,
      active_job_type: null,
    })
    mocks.api.fillDatasetLocal.mockResolvedValueOnce({
      job_id: "job-1",
      dataset_key: "binance:BTCUSDT:1h",
      status: "completed",
      safety_status: "local_dev_fill_only",
      requested_range: {
        start_at: "2026-01-01T00:00:00Z",
        end_at: "2026-01-07T00:00:00Z",
      },
      ranges_filled: [
        {
          start_at: "2026-01-01T00:00:00Z",
          end_at: "2026-01-01T02:00:00Z",
          kind: "head",
          rows_fetched: 3,
          rows_inserted: 3,
          rows_skipped_existing: 0,
        },
      ],
      rows_fetched: 3,
      rows_inserted: 3,
      rows_skipped_existing: 0,
      blocked_reasons: [],
      preview_id: "preview-1",
      request_fingerprint: "fingerprint-1",
    })
    mocks.api.preflightBotBacktest.mockResolvedValueOnce({
      dataset_key: "binance:BTCUSDT:1h",
      exchange: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      requested_start_at: "2026-01-01T00:00:00Z",
      requested_end_at: "2026-01-07T00:00:00Z",
      outcome: "ready",
      action: null,
      reasons: [],
      coverage: null,
      missing_segments: [],
      repair_start_at: null,
      repair_end_at: null,
      active_job_id: null,
      active_job_type: null,
      source_blocked: false,
    })

    render(<HookHarness />)

    await waitFor(() => {
      expect(screen.getByTestId("selected-strategy").textContent).toBe("strategy-1")
    })
    await user.click(screen.getByRole("button", { name: "Preview fill" }))
    await waitFor(() => expect(mocks.api.previewDatasetFill).toHaveBeenCalledTimes(1))
    await user.click(screen.getByRole("button", { name: "Confirm local fill checkbox" }))
    await user.click(screen.getByRole("button", { name: "Confirm local fill" }))

    await waitFor(() => expect(mocks.api.fillDatasetLocal).toHaveBeenCalledTimes(1))
    expect(mocks.api.fillDatasetLocal).toHaveBeenCalledWith({
      strategy_id: "strategy-1",
      exchange: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      requested_start_at: "2026-01-01T00:00:00Z",
      requested_end_at: "2026-01-07T00:00:00Z",
      preview_id: "preview-1",
      request_fingerprint: "fingerprint-1",
      confirm_local_fill: true,
      source: "strategy_lab",
    })
    expect(mocks.api.startBotBacktest).not.toHaveBeenCalled()
    expect(mocks.api.runBotBacktest).not.toHaveBeenCalled()
  })

  it("keeps preview visible and resets confirmation when local fill provider fails", async () => {
    const user = userEvent.setup()
    mocks.api.previewDatasetFill.mockResolvedValueOnce({
      preview_id: "preview-1",
      generated_at: "2026-05-18T00:00:00Z",
      request_fingerprint: "fingerprint-1",
      dataset_key: "binance:BTCUSDT:1h",
      exchange: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      requested_range: {
        start_at: "2026-01-01T00:00:00Z",
        end_at: "2026-01-07T00:00:00Z",
      },
      coverage_status: "partial",
      gap_count: 1,
      estimated_rows: 24,
      blocked_reasons: [],
      safety_status: "preview_only",
      missing_ranges: [{ start_at: "2026-01-01T00:00:00Z", end_at: "2026-01-01T02:00:00Z", kind: "head" }],
      active_job_id: null,
      active_job_type: null,
    })
    mocks.api.fillDatasetLocal.mockRejectedValueOnce(
      new ApiError("Binance public klines rate limit was reached.", 400, {
        reasonCode: "dataset_fill_provider_rate_limited",
        providerStatus: "429",
      }),
    )

    render(<HookHarness />)

    await waitFor(() => {
      expect(screen.getByTestId("selected-strategy").textContent).toBe("strategy-1")
    })
    await user.click(screen.getByRole("button", { name: "Preview fill" }))
    await waitFor(() => expect(screen.getByTestId("dataset-fill-preview").textContent).toBe("binance:BTCUSDT:1h|partial|preview_only"))
    await user.click(screen.getByRole("button", { name: "Confirm local fill checkbox" }))
    expect(screen.getByTestId("dataset-local-fill-confirmed").textContent).toBe("true")
    await user.click(screen.getByRole("button", { name: "Confirm local fill" }))

    await waitFor(() => {
      expect(screen.getByTestId("dataset-local-fill-error").textContent).toBe(
        "Binance public klines rate limit was reached. (dataset_fill_provider_rate_limited, providerStatus=429)",
      )
    })
    expect(screen.getByTestId("dataset-fill-preview").textContent).toBe("binance:BTCUSDT:1h|partial|preview_only")
    expect(screen.getByTestId("dataset-local-fill-confirmed").textContent).toBe("false")
    expect(screen.getByTestId("dataset-local-fill-result").textContent).toBe("none")
    expect(mocks.api.previewDatasetFill).toHaveBeenCalledTimes(1)
    expect(mocks.api.preflightBotBacktest).not.toHaveBeenCalled()
    expect(mocks.api.getStrategyJobVisibility).toHaveBeenCalledTimes(1)
  })

  it("reloads job visibility when switching strategy", async () => {
    const user = userEvent.setup()
    mocks.api.getStrategy.mockResolvedValueOnce({
      id: "strategy-2",
      strategy_group_id: "group-1",
      name: "Mean Reversion",
      slug: "mean-reversion",
      description: "Mean reversion",
      status: "active",
      current_version_id: "version-3",
      runtime_config: {},
      risk_config: {},
      metadata: {},
      versions: [
        {
          id: "version-3",
          strategy_id: "strategy-2",
          version_number: 1,
          validation_status: "valid",
          validation_message: null,
          source_code: "print('v3')",
          source_hash: "hash-3",
          created_at: "2026-01-03T00:00:00Z",
        },
      ],
      version_count: 1,
    })
    mocks.api.getStrategyJobVisibility.mockResolvedValueOnce({
      strategy_id: "strategy-1",
      stale_threshold_minutes: 10,
      active: [],
      recent: [],
    }).mockResolvedValueOnce({
      strategy_id: "strategy-2",
      stale_threshold_minutes: 10,
      active: [],
      recent: [],
    })

    render(<HookHarness />)

    await waitFor(() => {
      expect(screen.getByTestId("job-visibility").textContent).toBe("strategy-1|0|0")
    })

    await user.click(screen.getByRole("button", { name: "Select strategy 2" }))
    await waitFor(() => {
      expect(screen.getByTestId("job-visibility").textContent).toBe("strategy-2|0|0")
    })
  })

  it("auto-refreshes job visibility while active jobs exist", async () => {
    mocks.api.getStrategyJobVisibility.mockResolvedValue({
      strategy_id: "strategy-1",
      stale_threshold_minutes: 10,
      active: [
        {
          run: {
            id: "run-active",
            strategy_id: "strategy-1",
            strategy_version_id: "version-2",
            status: "queued",
            pipeline_status: "waiting_for_data",
            exchange: "binance",
            symbol: "BTCUSDT",
            timeframe: "1h",
            start_at: "2026-01-01T00:00:00Z",
            end_at: "2026-01-02T00:00:00Z",
            created_at: "2026-01-01T00:00:00Z",
          },
          status: "waiting_for_data",
          is_stale: false,
          stale_reason: null,
          last_activity_at: "2026-01-01T00:00:00Z",
        },
      ],
      recent: [],
    })

    render(<HookHarness />)

    await waitFor(() => {
      expect(screen.getByTestId("job-visibility").textContent).toBe("strategy-1|1|0")
    })

    await waitFor(() => {
      expect(mocks.api.getStrategyJobVisibility).toHaveBeenCalledTimes(2)
    }, { timeout: 2500 })
  }, 4000)

  it("shows the historical version context when reopening an older run of the same strategy", async () => {
    const user = userEvent.setup()

    render(<HookHarness />)

    await waitFor(() => {
      expect(screen.getByTestId("current-version").textContent).toBe("version-2|2")
    })
    expect(screen.getByTestId("draft-source").textContent).toBe("print('v2')")
    expect(mocks.api.getStrategy).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole("button", { name: "Open run" }))

    await waitFor(() => {
      expect(screen.getByTestId("current-version").textContent).toBe("version-1|1")
    })
    expect(screen.getByTestId("draft-source").textContent).toBe("print('snapshot-v1')")
    await waitFor(() => {
      expect(screen.getByTestId("selected-analyzed-trade").textContent).toBe("trade-1")
      expect(screen.getByTestId("selected-execution-trade").textContent).toBe("trade-1")
    })
    expect(mocks.api.getStrategy).toHaveBeenCalledTimes(1)
  })

  it("creates manual signal package for loaded completed run", async () => {
    const user = userEvent.setup()
    const createManualSignalPackage = vi.fn().mockResolvedValue({
      signalPackageId: "pkg-1",
      sourceRunId: "run-1",
      strategyId: "strategy-1",
      strategyVersionId: "version-1",
      strategyName: "Breakout Lab",
      exchange: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      datasetKey: "binance:BTCUSDT:1h",
      runStartAt: "2026-01-01T00:00:00Z",
      runEndAt: "2026-01-31T00:00:00Z",
      generatedAt: "2026-05-30T00:00:00Z",
      action: "watch",
      entryRule: "Manual setup only",
      stopRule: "Use risk guard",
      takeProfitRule: null,
      exitRule: "Use strategy exit",
      positionSizingRule: "maxOrderPercent=10",
      maxRiskPerTrade: "10",
      invalidationRule: "Mismatch invalidates",
      manualExecutionNotes: ["Manual only"],
      limitations: ["Historical evidence"],
      warnings: ["robustness_not_available"],
      sourceMetrics: {},
      sourceTradeSummary: {},
      datasetEvidence: {},
      riskEvidence: {},
      robustnessEvidenceStatus: "not_available",
      liveReadinessStatus: "manual_handoff_only",
      safetyStatus: "manual_live_signal_handoff_only",
      markdown: "# TradeLab Manual Signal Handoff",
    })
    mocks.api.createManualSignalPackage.mockImplementation(createManualSignalPackage)

    render(<HookHarness />)

    await user.click(screen.getByRole("button", { name: "Open run" }))
    await screen.findByText("run:run-1")
    await user.click(screen.getByRole("button", { name: "create-manual-signal" }))

    expect(createManualSignalPackage).toHaveBeenCalledWith("run-1")
    expect(await screen.findByText("manual-signal:run-1")).toBeTruthy()
  })

  it("creates a research robustness gate for loaded completed run", async () => {
    const user = userEvent.setup()
    const createResearchRobustnessGate = vi.fn().mockResolvedValue({
      robustnessGateId: "gate-1",
      sourceRunId: "run-1",
      strategyId: "strategy-1",
      strategyVersionId: "version-1",
      strategyName: "Baseline",
      exchange: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      datasetKey: "binance:BTCUSDT:1h",
      generatedAt: "2026-05-30T00:00:00Z",
      candidateLabel: "research_candidate",
      liveReadinessStatus: "not_live_ready",
      safetyStatus: "research_robustness_gate_only",
      gates: { tradeCount: { status: "pass", reasonCode: "trade_count_sufficient", summary: "Enough trades" } },
      warnings: [],
      limitations: [],
      sourceMetrics: {},
      sourceTradeSummary: {},
    })
    mocks.api.createResearchRobustnessGate.mockImplementation(createResearchRobustnessGate)

    render(<HookHarness />)
    await user.click(screen.getByRole("button", { name: "Open run" }))
    await screen.findByText("run:run-1")
    await user.click(screen.getByRole("button", { name: /create robustness gate/i }))

    expect(createResearchRobustnessGate).toHaveBeenCalledWith("run-1")
    expect(await screen.findByText("robustness:run-1")).toBeTruthy()
    expect(screen.getByTestId("robustness-error").textContent).toBe("none")
  })

  it("builds compare mode state and filters comparable runs", async () => {
    const user = userEvent.setup()

    render(<HookHarness />)

    mocks.api.getBotRunAnalysis.mockImplementation(async (runId: string) => {
      if (runId === "run-2") {
        return {
          run: {
            id: "run-2",
            bot_id: "bot-1",
            strategy_id: "strategy-1",
            strategy_version_id: "version-1",
            status: "completed",
            pipeline_status: "completed",
            started_at: "2026-01-04T00:00:00Z",
            finished_at: "2026-01-04T00:02:00Z",
            error_message: null,
            stop_reason: null,
            snapshot: {
              source_snapshot: {
                sourceCode: "print('snapshot-v2')",
                strategyVersionId: "version-1",
              },
              dataset_context: {
                exchange: "binance",
                symbol: "ETHUSDT",
                timeframe: "4h",
                requestedStartAt: "2026-01-05T00:00:00Z",
                requestedEndAt: "2026-01-06T00:00:00Z",
              },
              pipeline_context: {},
            },
          },
          result: {
            id: "result-2",
            bot_run_id: "run-2",
            initial_equity: 1000,
            final_equity: 950,
            total_return_pct: -5,
            max_drawdown_pct: 8,
            profit_factor: 0.9,
            win_rate_pct: 25,
            total_trades: 1,
            metrics: {
              initial_equity: 1000,
              final_equity: 950,
              total_return_pct: -5,
              max_drawdown_pct: 8,
              profit_factor: 0.9,
              win_rate_pct: 25,
              total_trades: 1,
              closed_trades: 1,
            },
            equity_curve: [],
            created_at: "2026-01-04T00:02:00Z",
          },
          snapshot: {
            source_snapshot: {
              sourceCode: "print('snapshot-v2')",
              strategyVersionId: "version-1",
            },
            dataset_context: {
              exchange: "binance",
              symbol: "ETHUSDT",
              timeframe: "4h",
              requestedStartAt: "2026-01-05T00:00:00Z",
              requestedEndAt: "2026-01-06T00:00:00Z",
              sourceHash: "hash-2",
              strategyVersionId: "version-1",
            },
            pipeline_context: {},
          },
          runtime_config: {
            exchange: "binance",
            symbol: "ETHUSDT",
            timeframe: "4h",
            startAt: "2026-01-05T00:00:00Z",
            endAt: "2026-01-06T00:00:00Z",
            initialEquity: 1000,
            feeBps: 0,
            slippageBps: 0,
          },
          risk_config: {
            maxOrderPercent: 10,
            maxPositionPercent: 100,
            maxDrawdownPercent: 15,
            minNotional: 10,
            stepSize: 0.001,
            tickSize: 0.01,
          },
          dataset_context: {
            dataset_key: "binance:ETHUSDT:4h",
            exchange: "binance",
            symbol: "ETHUSDT",
            timeframe: "4h",
            requested_start_at: "2026-01-05T00:00:00Z",
            requested_end_at: "2026-01-06T00:00:00Z",
            source_hash: "hash-2",
            strategy_version_id: "version-1",
            coverage: null,
          },
          trade_summary: {
            total_trades: 1,
            closed_trades: 1,
            open_trades: 0,
            winning_trades: 0,
            losing_trades: 1,
            break_even_trades: 0,
            realized_pnl: -5,
            average_pnl: -5,
            average_pnl_pct: -0.5,
            average_duration_seconds: 1800,
            win_rate_pct: 0,
            profit_factor: 0.9,
          },
          trades: [
            {
              id: "trade-2",
              entry_order_id: "entry-2",
              exit_order_id: "exit-2",
              entry_time: "2026-01-05T01:00:00Z",
              exit_time: "2026-01-05T01:30:00Z",
              side: "buy",
              status: "closed",
              entry_price: 200,
              exit_price: 190,
              quantity: 1,
              pnl: -10,
              pnl_pct: -5,
              duration_seconds: 1800,
              entry_signal_id: "signal-3",
              exit_signal_id: "signal-4",
              entry_reason: "Entry",
              exit_reason: "Exit",
            },
          ],
        }
      }

      return {
        run: {
          id: "run-1",
          bot_id: "bot-1",
          strategy_id: "strategy-1",
          strategy_version_id: "version-1",
          status: "completed",
          pipeline_status: "completed",
          started_at: "2026-01-03T00:00:00Z",
          finished_at: "2026-01-03T00:05:00Z",
          error_message: null,
          stop_reason: null,
          snapshot: {
            source_snapshot: { sourceCode: "print('snapshot-v1')", strategyVersionId: "version-1" },
            dataset_context: {
              exchange: "binance",
              symbol: "BTCUSDT",
              timeframe: "1h",
              requestedStartAt: "2026-01-01T00:00:00Z",
              requestedEndAt: "2026-01-02T00:00:00Z",
            },
            pipeline_context: {},
          },
        },
        result: {
          id: "result-1",
          bot_run_id: "run-1",
          initial_equity: 1000,
          final_equity: 1100,
          total_return_pct: 10,
          max_drawdown_pct: 5,
          profit_factor: 1.5,
          win_rate_pct: 50,
          total_trades: 1,
          metrics: {
            initial_equity: 1000,
            final_equity: 1100,
            total_return_pct: 10,
            max_drawdown_pct: 5,
            profit_factor: 1.5,
            win_rate_pct: 50,
            total_trades: 1,
            closed_trades: 1,
          },
          equity_curve: [],
          created_at: "2026-01-03T00:05:00Z",
        },
        snapshot: {
          source_snapshot: {
            sourceCode: "print('snapshot-v1')",
            strategyVersionId: "version-1",
          },
          dataset_context: {
            exchange: "binance",
            symbol: "BTCUSDT",
            timeframe: "1h",
            requestedStartAt: "2026-01-01T00:00:00Z",
            requestedEndAt: "2026-01-02T00:00:00Z",
            sourceHash: "hash-1",
            strategyVersionId: "version-1",
          },
          pipeline_context: {},
        },
        runtime_config: {
          exchange: "binance",
          symbol: "BTCUSDT",
          timeframe: "1h",
          startAt: "2026-01-01T00:00:00Z",
          endAt: "2026-01-02T00:00:00Z",
          initialEquity: 1000,
          feeBps: 0,
          slippageBps: 0,
        },
        risk_config: {
          maxOrderPercent: 10,
          maxPositionPercent: 100,
          maxDrawdownPercent: 15,
          minNotional: 10,
          stepSize: 0.001,
          tickSize: 0.01,
        },
        dataset_context: {
          dataset_key: "binance:BTCUSDT:1h",
          exchange: "binance",
          symbol: "BTCUSDT",
          timeframe: "1h",
          requested_start_at: "2026-01-01T00:00:00Z",
          requested_end_at: "2026-01-02T00:00:00Z",
          source_hash: "hash-1",
          strategy_version_id: "version-1",
          coverage: null,
        },
        trade_summary: {
          total_trades: 1,
          closed_trades: 1,
          open_trades: 0,
          winning_trades: 1,
          losing_trades: 0,
          break_even_trades: 0,
          realized_pnl: 10,
          average_pnl: 10,
          average_pnl_pct: 1,
          average_duration_seconds: 3600,
          win_rate_pct: 100,
          profit_factor: 2,
        },
        trades: [
          {
            id: "trade-1",
            entry_order_id: "entry-1",
            exit_order_id: "exit-1",
            entry_time: "2026-01-01T01:00:00Z",
            exit_time: "2026-01-01T02:00:00Z",
            side: "buy",
            status: "closed",
            entry_price: 100,
            exit_price: 110,
            quantity: 1,
            pnl: 10,
            pnl_pct: 10,
            duration_seconds: 3600,
            entry_signal_id: "signal-1",
            exit_signal_id: "signal-2",
            entry_reason: "Entry",
            exit_reason: "Exit",
          },
        ],
      }
    })

    await user.click(screen.getByRole("button", { name: "Open run" }))
    await user.click(screen.getByRole("button", { name: "Compare run" }))

    await waitFor(() => {
      expect(screen.getByTestId("compare-candidates").textContent).toBe("1")
    })

    await user.click(screen.getByRole("button", { name: "Pick run 2" }))

    await waitFor(() => {
      expect(screen.getByTestId("compare-mode").textContent).toContain("run-1|run-2|Dataset mismatch")
      expect(screen.getByTestId("selected-analyzed-trade").textContent).toBe("trade-1")
    })

    await user.click(screen.getByRole("button", { name: "Exit compare" }))
    await waitFor(() => {
      expect(screen.getByTestId("compare-mode").textContent).toBe("none")
    })
  })

  it("marks draft dirty and blocks run until a version is created", async () => {
    const user = userEvent.setup()
    render(<HookHarness />)

    await waitFor(() => {
      expect(screen.getByTestId("draft-dirty").textContent).toBe("false")
      expect(screen.getByTestId("run-disabled-reason").textContent).toBe("none")
      expect(screen.getByTestId("run-version").textContent).toBe("version-2")
    })

    await user.click(screen.getByRole("button", { name: "Edit source" }))

    expect(screen.getByTestId("draft-dirty").textContent).toBe("true")
    expect(screen.getByTestId("run-disabled-reason").textContent).toBe(
      "Draft has changed. Create a new version before running backtest.",
    )

    await user.click(screen.getByRole("button", { name: "Run backtest" }))
    expect(mocks.api.preflightBotBacktest).not.toHaveBeenCalled()
  })

  it("checks syntax and invalidates stale validation after editing", async () => {
    const user = userEvent.setup()
    mocks.api.validateStrategySource.mockResolvedValue({
      validationStatus: "valid",
      validationMessage: null,
      line: null,
      column: null,
    })

    render(<HookHarness />)

    await waitFor(() => {
      expect(screen.getByTestId("draft-source").textContent).toBe("print('v2')")
    })

    await user.click(screen.getByRole("button", { name: "Check syntax" }))
    await waitFor(() => {
      expect(screen.getByTestId("validation-check").textContent).toBe("valid|none")
    })

    await user.click(screen.getByRole("button", { name: "Edit source" }))
    expect(screen.getByTestId("validation-check").textContent).toBe("none")
  })

  it("marks config dirty without blocking draft config backtest", async () => {
    render(<HookHarness />)

    await waitFor(() => {
      expect(screen.getByTestId("config-dirty").textContent).toBe("false")
    })
  })

  it("creates a futures-configured backtest bot before preflight when draft runtime switches to futures", async () => {
    const user = userEvent.setup()
    mocks.api.createBot.mockResolvedValue({
      id: "backtest-bot-futures",
      strategy_id: "strategy-1",
      strategy_version_id: "version-2",
      name: "Supertrend backtest bot",
      mode: "backtest",
      status: "draft",
      symbol: "BTCUSDT",
      timeframe: "1h",
      runtime_config: {
        exchange: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        marketType: "USD_M_FUTURES",
        defaultLeverage: 10,
      },
      risk_config: {},
      metadata: {},
      created_at: "2026-05-16T00:00:00Z",
    })
    mocks.api.preflightBotBacktest.mockResolvedValue({
      dataset_key: "binance:BTCUSDT:1h",
      exchange: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      requested_start_at: "2026-01-01T00:00:00Z",
      requested_end_at: "2026-01-02T00:00:00Z",
      outcome: "ready",
      action: null,
      reasons: [],
      coverage: null,
      missing_segments: [],
      repair_start_at: null,
      repair_end_at: null,
      active_job_id: null,
      active_job_type: null,
      source_blocked: false,
    })

    render(<HookHarness />)

    await waitFor(() => {
      expect(screen.getByTestId("selected-strategy").textContent).toBe("strategy-1")
      expect(screen.getByTestId("run-version").textContent).toBe("version-2")
    })

    await user.click(screen.getByRole("button", { name: "Enable futures runtime" }))
    await user.click(screen.getByRole("button", { name: "Run backtest" }))

    await waitFor(() => {
      expect(mocks.api.createBot).toHaveBeenCalledTimes(1)
    })
    expect(mocks.api.createBot).toHaveBeenCalledWith(
      expect.objectContaining({
        strategy_id: "strategy-1",
        strategy_version_id: "version-2",
        symbol: "BTCUSDT",
        timeframe: "1h",
        runtime_config: expect.objectContaining({
          exchange: "binance",
          symbol: "BTCUSDT",
          timeframe: "1h",
          marketType: "USD_M_FUTURES",
          defaultLeverage: 10,
        }),
      }),
    )
    await waitFor(() => {
      expect(mocks.api.preflightBotBacktest).toHaveBeenCalledWith(
        "backtest-bot-futures",
        expect.objectContaining({
          exchange: "binance",
          symbol: "BTCUSDT",
          timeframe: "1h",
        }),
      )
    })
  })

  it("does not reuse a spot-configured backtest bot when draft runtime switches to futures", async () => {
    const user = userEvent.setup()
    mocks.api.listBots.mockResolvedValue({
      items: [
        {
          id: "backtest-bot-spot",
          strategy_id: "strategy-1",
          strategy_version_id: "version-2",
          name: "Supertrend backtest bot",
          mode: "backtest",
          status: "draft",
          symbol: "BTCUSDT",
          timeframe: "1h",
          runtime_config: {
            exchange: "binance",
            symbol: "BTCUSDT",
            timeframe: "1h",
          },
          risk_config: {},
          metadata: {},
          created_at: "2026-05-16T00:00:00Z",
        },
      ],
    })
    mocks.api.createBot.mockResolvedValue({
      id: "backtest-bot-futures",
      strategy_id: "strategy-1",
      strategy_version_id: "version-2",
      name: "Supertrend backtest bot",
      mode: "backtest",
      status: "draft",
      symbol: "BTCUSDT",
      timeframe: "1h",
      runtime_config: {
        exchange: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        marketType: "USD_M_FUTURES",
        defaultLeverage: 10,
      },
      risk_config: {},
      metadata: {},
      created_at: "2026-05-16T00:00:00Z",
    })
    mocks.api.preflightBotBacktest.mockResolvedValue({
      dataset_key: "binance:BTCUSDT:1h",
      exchange: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      requested_start_at: "2026-01-01T00:00:00Z",
      requested_end_at: "2026-01-02T00:00:00Z",
      outcome: "ready",
      action: null,
      reasons: [],
      coverage: null,
      missing_segments: [],
      repair_start_at: null,
      repair_end_at: null,
      active_job_id: null,
      active_job_type: null,
      source_blocked: false,
    })

    render(<HookHarness />)

    await waitFor(() => {
      expect(screen.getByTestId("selected-strategy").textContent).toBe("strategy-1")
      expect(screen.getByTestId("run-version").textContent).toBe("version-2")
    })

    await user.click(screen.getByRole("button", { name: "Enable futures runtime" }))
    await user.click(screen.getByRole("button", { name: "Run backtest" }))

    await waitFor(() => {
      expect(mocks.api.createBot).toHaveBeenCalledTimes(1)
    })
    expect(mocks.api.preflightBotBacktest).not.toHaveBeenCalledWith(
      "backtest-bot-spot",
      expect.anything(),
    )
    await waitFor(() => {
      expect(mocks.api.preflightBotBacktest).toHaveBeenCalledWith(
        "backtest-bot-futures",
        expect.objectContaining({
          exchange: "binance",
          symbol: "BTCUSDT",
          timeframe: "1h",
        }),
      )
    })
  })

  it("saves paper draft without starting paper execution", async () => {
    const user = userEvent.setup()
    mocks.api.createBot.mockResolvedValue({
      id: "paper-bot-1",
      strategy_id: "strategy-1",
      strategy_version_id: "version-2",
      name: "Supertrend paper draft",
      mode: "paper",
      status: "draft",
      symbol: "BTCUSDT",
      timeframe: "1h",
      runtime_config: {},
      risk_config: {},
      metadata: {},
      created_at: "2026-05-16T00:00:00Z",
    })

    render(<HookHarness />)

    await waitFor(() => {
      expect(screen.getByTestId("run-version").textContent).toBe("version-2")
    })

    await user.click(screen.getByRole("button", { name: "Mark credential ready" }))
    await user.click(screen.getByRole("button", { name: "Save paper draft" }))

    await waitFor(() => {
      expect(screen.getByTestId("paper-draft").textContent).toBe("paper-bot-1")
    })
    expect(mocks.api.createBot).toHaveBeenCalledWith(
      expect.objectContaining({
        strategy_id: "strategy-1",
        strategy_version_id: "version-2",
        mode: "paper",
        status: "draft",
        symbol: "BTCUSDT",
        timeframe: "1h",
        metadata: {
          credentialBoundary: {
            exchange: "binance",
            status: "read_only_ready",
            checks: {
              readOnlyEnabled: true,
              tradingDisabled: true,
              withdrawDisabled: true,
              futuresMarginDisabled: true,
              ipRestricted: true,
            },
            updatedAt: expect.any(String),
          },
        },
      }),
    )
    expect(mocks.api.preflightBotBacktest).not.toHaveBeenCalled()
    expect(mocks.api.startBotBacktest).not.toHaveBeenCalled()
  })

  it("reads credential boundary status from existing paper draft metadata", async () => {
    mocks.api.listBots.mockResolvedValue({
      items: [
        {
          id: "paper-bot-existing",
          strategy_id: "strategy-1",
          strategy_version_id: "version-2",
          name: "Supertrend paper draft",
          mode: "paper",
          status: "draft",
          symbol: "BTCUSDT",
          timeframe: "1h",
          runtime_config: {},
          risk_config: {},
          metadata: {
            credentialBoundary: {
              exchange: "binance",
              status: "ip_not_restricted",
              checks: {
                readOnlyEnabled: true,
                tradingDisabled: true,
                withdrawDisabled: true,
                futuresMarginDisabled: true,
                ipRestricted: false,
              },
              updatedAt: "2026-05-16T00:00:00Z",
            },
          },
          created_at: "2026-05-16T00:00:00Z",
        },
      ],
    })

    render(<HookHarness />)

    await waitFor(() => {
      expect(screen.getByTestId("paper-draft").textContent).toBe("paper-bot-existing")
      expect(screen.getByTestId("credential-boundary").textContent).toBe("ip_not_restricted")
    })
  })

  it("does not preview paper session when paper draft is missing", async () => {
    render(<HookHarness />)

    await waitFor(() => {
      expect(screen.getByTestId("selected-strategy").textContent).toBe("strategy-1")
      expect(screen.getByTestId("paper-session-setup-reason").textContent).toContain("paper_draft_required")
    })
    expect(mocks.api.previewPaperSession).not.toHaveBeenCalled()
  })

  it("manually previews paper session readiness when context is valid", async () => {
    const user = userEvent.setup()
    mocks.api.listBots.mockResolvedValue({
      items: [
        {
          id: "paper-bot-existing",
          strategy_id: "strategy-1",
          strategy_version_id: "version-2",
          name: "Supertrend paper draft",
          mode: "paper",
          status: "draft",
          symbol: "BTCUSDT",
          timeframe: "1h",
          runtime_config: {},
          risk_config: {},
          metadata: {},
          created_at: "2026-05-20T00:00:00Z",
        },
      ],
    })
    mocks.api.previewPaperSession.mockResolvedValue({
      mode: "paper",
      preview_status: "allowed",
      allowed: true,
      reason_code: "paper_preview_allowed",
      failed_gates: [],
      warnings: [],
      details: {},
      safety_status: "preview_only",
      bot_context: {
        bot_id: "paper-bot-existing",
        mode: "paper",
        status: "draft",
        symbol: "BTCUSDT",
        timeframe: "1h",
      },
      strategy_context: {
        strategy_id: "strategy-1",
        strategy_version_id: "version-2",
        source_valid: true,
        version_locked: true,
        dirty: false,
      },
      dataset_context: {
        dataset_key: "binance:BTCUSDT:1h",
        exchange: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        start_at: "2026-01-01T00:00:00Z",
        end_at: "2026-01-02T00:00:00Z",
        preflight_outcome: "ready",
      },
    })

    render(<HookHarness />)

    await waitFor(() => {
      expect(screen.getByTestId("paper-draft").textContent).toBe("paper-bot-existing")
      expect(screen.getByTestId("paper-session-setup-reason").textContent).toBe("none")
    })

    expect(mocks.api.previewPaperSession).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "Refresh paper preview" }))

    await waitFor(() => {
      expect(screen.getByTestId("paper-session-preview").textContent).toBe("allowed|paper_preview_allowed|binance:BTCUSDT:1h")
    })
    expect(mocks.api.previewPaperSession).toHaveBeenCalledWith({
      bot_id: "paper-bot-existing",
      exchange: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      start_at: "2026-01-01T00:00:00Z",
      end_at: "2026-01-02T00:00:00Z",
      risk_policy_override: {
        startingCash: 1000,
        maxOrderPercent: 10,
        maxPositionPercent: 100,
        maxDrawdownPercent: 15,
        minNotional: 10,
      },
      source: "strategy_lab",
    })
    expect(mocks.api.startBotBacktest).not.toHaveBeenCalled()
  })

  it("loads paper kill switch status and disables start/run when enabled", async () => {
    mocks.api.getPaperKillSwitchStatus.mockResolvedValue({
      enabled: true,
      reasonCode: "paper_kill_switch_enabled",
      safetyStatus: "read_only_paper_kill_switch_status",
      source: "config",
      updatedAt: null,
      updatedBy: null,
      details: { environment: "local", localDevOnly: true },
    })
    mocks.api.previewPaperSession.mockResolvedValue({
      mode: "paper",
      previewStatus: "allowed",
      allowed: true,
      reasonCode: "paper_risk_gate_passed",
      failedGates: [],
      warnings: [],
      details: {},
      safetyStatus: "read_only_preview",
      botContext: { botId: "bot-paper", mode: "paper", status: "draft", symbol: "BTCUSDT", timeframe: "1h" },
      strategyContext: { strategyId: "strategy-1", strategyVersionId: "version-1", sourceValid: true, versionLocked: true, dirty: false },
      datasetContext: {
        datasetKey: "binance:BTCUSDT:1h",
        exchange: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        startAt: "2026-01-01T00:00:00Z",
        endAt: "2026-01-01T02:00:00Z",
        preflightOutcome: "ready",
      },
    })

    render(<HookHarness />)

    await waitFor(() => {
      expect(screen.getByTestId("paper-kill-switch-enabled").textContent).toBe("true")
    })
    expect(screen.getByTestId("paper-session-can-start").textContent).toBe("false")
    expect(screen.getByTestId("paper-session-can-run-local").textContent).toBe("false")
    expect(screen.getAllByText("Paper kill switch is enabled. Reason: paper_kill_switch_enabled.").length).toBeGreaterThan(0)
  })

  it("starts a paper session from allowed preview and auto-loads detail", async () => {
    const user = userEvent.setup()
    mocks.api.listBots.mockResolvedValue({
      items: [
        {
          id: "paper-bot-existing",
          strategy_id: "strategy-1",
          strategy_version_id: "version-2",
          name: "Supertrend paper draft",
          mode: "paper",
          status: "draft",
          symbol: "BTCUSDT",
          timeframe: "1h",
          runtime_config: {},
          risk_config: {},
          metadata: {},
          created_at: "2026-05-20T00:00:00Z",
        },
      ],
    })
    mocks.api.previewPaperSession.mockResolvedValue({
      mode: "paper",
      preview_status: "allowed",
      allowed: true,
      reason_code: "paper_preview_allowed",
      failed_gates: [],
      warnings: [],
      details: {},
      safety_status: "preview_only",
      bot_context: {
        bot_id: "paper-bot-existing",
        mode: "paper",
        status: "draft",
        symbol: "BTCUSDT",
        timeframe: "1h",
      },
      strategy_context: {
        strategy_id: "strategy-1",
        strategy_version_id: "version-2",
        source_valid: true,
        version_locked: true,
        dirty: false,
      },
      dataset_context: {
        dataset_key: "binance:BTCUSDT:1h",
        exchange: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        start_at: "2026-01-01T00:00:00Z",
        end_at: "2026-01-02T00:00:00Z",
        preflight_outcome: "ready",
      },
    })
    mocks.api.getPaperSessionDetail.mockResolvedValue({
      session: {
        session_id: "paper-session-started",
        status: "queued",
        dataset_key: "binance:BTCUSDT:1h",
        starting_cash: "1000",
      },
      artifacts: {
        orders: [],
        fills: [],
        positions: [],
        portfolio_snapshots: [],
        limits: {},
      },
      safety_status: "read_only_paper_session_detail",
    })

    render(<HookHarness />)

    await waitFor(() => expect(screen.getByTestId("paper-session-setup-reason").textContent).toBe("none"))
    await user.click(screen.getByRole("button", { name: "Refresh paper preview" }))
    await waitFor(() => expect(screen.getByTestId("paper-session-can-start").textContent).toBe("true"))
    await user.click(screen.getByRole("button", { name: "Start paper session" }))

    await waitFor(() => {
      expect(screen.getByTestId("paper-session-start").textContent).toBe(
        "queued|paper_session_queued|paper-session-started",
      )
      expect(screen.getByTestId("paper-session-detail").textContent).toBe("paper-session-started")
    })
    expect(mocks.api.startPaperSession).toHaveBeenCalledWith(
      expect.objectContaining({
        bot_id: "paper-bot-existing",
        confirm_start: true,
        source: "strategy_lab",
      }),
    )
    expect(mocks.api.getPaperSessionDetail).toHaveBeenCalledWith("paper-session-started")
  })

  it("surfaces paper preview API errors inline and keeps stale preview cleared", async () => {
    const user = userEvent.setup()
    mocks.api.listBots.mockResolvedValue({
      items: [
        {
          id: "paper-bot-existing",
          strategy_id: "strategy-1",
          strategy_version_id: "version-2",
          name: "Supertrend paper draft",
          mode: "paper",
          status: "draft",
          symbol: "BTCUSDT",
          timeframe: "1h",
          runtime_config: {},
          risk_config: {},
          metadata: {},
          created_at: "2026-05-20T00:00:00Z",
        },
      ],
    })
    mocks.api.previewPaperSession.mockRejectedValue(
      new ApiError("Paper preview failed.", 400, {
        reasonCode: "paper_dataset_not_ready",
      }),
    )

    render(<HookHarness />)

    await waitFor(() => expect(screen.getByTestId("paper-draft").textContent).toBe("paper-bot-existing"))
    await user.click(screen.getByRole("button", { name: "Refresh paper preview" }))

    await waitFor(() => {
      expect(screen.getByTestId("paper-session-preview-error").textContent).toBe("Paper preview failed. (paper_dataset_not_ready)")
      expect(screen.getByTestId("paper-session-preview").textContent).toBe("none")
    })
  })

  it("validates blank paper session detail lookup without calling the API", async () => {
    const user = userEvent.setup()

    render(<HookHarness />)

    await waitFor(() => expect(screen.getByTestId("selected-strategy").textContent).toBe("strategy-1"))
    await user.click(screen.getByRole("button", { name: "Set blank paper session detail id" }))
    await user.click(screen.getByRole("button", { name: "Load paper session detail" }))

    expect(mocks.api.getPaperSessionDetail).not.toHaveBeenCalled()
    expect(screen.getByTestId("paper-session-detail-error").textContent).toBe(
      "Paste a paper session ID to inspect runtime artifacts.",
    )
    expect(screen.getByTestId("paper-session-detail").textContent).toBe("none")
  })

  it("loads paper session detail and clears stale detail when input changes", async () => {
    const user = userEvent.setup()
    mocks.api.getPaperSessionDetail.mockResolvedValue({
      session: {
        session_id: "paper-session-1",
        status: "completed",
        dataset_key: "binance:BTCUSDT:1h",
        starting_cash: "1000",
      },
      artifacts: {
        orders: [],
        fills: [],
        positions: [],
        portfolio_snapshots: [],
        limits: {},
      },
      safety_status: "read_only_paper_session_detail",
    })

    render(<HookHarness />)

    await waitFor(() => expect(screen.getByTestId("selected-strategy").textContent).toBe("strategy-1"))
    await user.click(screen.getByRole("button", { name: "Set paper session detail id" }))
    await user.click(screen.getByRole("button", { name: "Load paper session detail" }))

    await waitFor(() => expect(screen.getByTestId("paper-session-detail").textContent).toBe("paper-session-1"))
    expect(mocks.api.getPaperSessionDetail).toHaveBeenCalledWith("paper-session-1")

    await user.click(screen.getByRole("button", { name: "Set other paper session detail id" }))

    expect(screen.getByTestId("paper-session-detail-input").textContent).toBe("paper-session-2")
    expect(screen.getByTestId("paper-session-detail").textContent).toBe("none")
  })

  it("loads resume readiness after loading paper session detail", async () => {
    const user = userEvent.setup()
    mocks.api.getPaperSessionDetail.mockResolvedValue({
      session: {
        session_id: "paper-session-1",
        status: "cancelled",
        dataset_key: "binance:BTCUSDT:1h",
        starting_cash: "1000",
      },
      artifacts: {
        orders: [],
        fills: [],
        positions: [],
        portfolio_snapshots: [],
        limits: {},
      },
      safety_status: "read_only_paper_session_detail",
    })

    render(<HookHarness />)

    await waitFor(() => expect(screen.getByTestId("selected-strategy").textContent).toBe("strategy-1"))
    await user.click(screen.getByRole("button", { name: "Set paper session detail id" }))
    await user.click(screen.getByRole("button", { name: "Load paper session detail" }))

    await waitFor(() => {
      expect(screen.getByTestId("paper-session-resume-readiness").textContent).toBe(
        "true|paper_local_resume_readiness_ready|persisted",
      )
    })
    expect(mocks.api.getPaperSessionResumeReadiness).toHaveBeenCalledWith("paper-session-1")
  })

  it("resumes a loaded cancelled paper session locally without auto-run or storage", async () => {
    const user = userEvent.setup()
    mocks.api.getPaperSessionDetail
      .mockResolvedValueOnce({
        session: {
          session_id: "paper-session-1",
          status: "cancelled",
          dataset_key: "binance:BTCUSDT:1h",
          starting_cash: "1000",
        },
        artifacts: { orders: [], fills: [], positions: [], portfolio_snapshots: [], limits: {} },
        safety_status: "read_only_paper_session_detail",
      })
      .mockResolvedValue({
        session: {
          session_id: "paper-session-1",
          status: "queued",
          dataset_key: "binance:BTCUSDT:1h",
          starting_cash: "1000",
          reason_code: "paper_local_resume_queued",
        },
        artifacts: { orders: [], fills: [], positions: [], portfolio_snapshots: [], limits: {} },
        safety_status: "read_only_paper_session_detail",
      })

    render(<HookHarness />)

    await waitFor(() => expect(screen.getByTestId("selected-strategy").textContent).toBe("strategy-1"))
    await user.click(screen.getByRole("button", { name: "Set paper session detail id" }))
    await user.click(screen.getByRole("button", { name: "Load paper session detail" }))
    await waitFor(() => expect(screen.getByTestId("paper-session-can-resume-local").textContent).toBe("true"))
    await user.click(screen.getByRole("button", { name: "Resume local paper session" }))

    await waitFor(() => {
      expect(screen.getByTestId("paper-session-resume-local").textContent).toBe(
        "queued|paper_local_resume_queued|paper-session-1|paper-session-1",
      )
    })
    expect(mocks.api.resumePaperSessionLocal).toHaveBeenCalledWith("paper-session-1", {
      confirm_local_paper_resume: true,
      idempotency_key: "strategy-lab-resume:paper-session-1:1",
      reason: "user_requested",
      actor: "strategy-lab-local-paper-resume",
    })
    expect(mocks.api.runPaperSessionLocal).not.toHaveBeenCalled()
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
  })

  it("explains resume-local disabled reason without loaded detail", async () => {
    render(<HookHarness />)

    await waitFor(() => expect(screen.getByTestId("selected-strategy").textContent).toBe("strategy-1"))

    expect(screen.getByTestId("paper-session-can-resume-local").textContent).toBe("false")
    expect(screen.getByTestId("paper-session-resume-local-disabled-reason").textContent).toBe(
      "Load a cancelled paper session before resuming locally.",
    )
  })

  it("uses backend blocking reason when resume readiness is blocked", async () => {
    const user = userEvent.setup()
    mocks.api.getPaperSessionDetail.mockResolvedValue({
      session: {
        session_id: "paper-session-1",
        status: "cancelled",
        dataset_key: "binance:BTCUSDT:1h",
        starting_cash: "1000",
      },
      artifacts: { orders: [], fills: [], positions: [], portfolio_snapshots: [], limits: {} },
      safety_status: "read_only_paper_session_detail",
    })
    mocks.api.getPaperSessionResumeReadiness.mockResolvedValue({
      session_id: "paper-session-1",
      status: "cancelled",
      reason_code: "paper_local_resume_checkpoint_missing",
      allowed: false,
      safety_status: "read_only_paper_resume_readiness",
      checkpoint: null,
      checkpoint_source: "missing",
      artifact_identity_status: "blocked",
      resume_mode: "same_session",
      attempt_no: null,
      blocking_reasons: ["paper_local_resume_checkpoint_missing"],
      details: {},
    })

    render(<HookHarness />)

    await waitFor(() => expect(screen.getByTestId("selected-strategy").textContent).toBe("strategy-1"))
    await user.click(screen.getByRole("button", { name: "Set paper session detail id" }))
    await user.click(screen.getByRole("button", { name: "Load paper session detail" }))

    await waitFor(() => {
      expect(screen.getByTestId("paper-session-can-resume-local").textContent).toBe("false")
      expect(screen.getByTestId("paper-session-resume-local-disabled-reason").textContent).toBe(
        "paper_local_resume_checkpoint_missing",
      )
    })
  })

  it("loads paper session observability with current strategy and dataset context", async () => {
    const user = userEvent.setup()
    mocks.api.listPaperSessions.mockResolvedValue({
      safety_status: "read_only_paper_session_observability",
      has_more: false,
      items: [
        {
          session_id: "paper-session-1",
          status: "completed",
          reason_code: "paper_engine_completed",
          safety_status: "read_only_paper_session_observability",
          strategy_id: "strategy-1",
          strategy_version_id: "version-1",
          dataset_key: "binance:BTCUSDT:1h",
          exchange: "binance",
          symbol: "BTCUSDT",
          timeframe: "1h",
          start_at: "2026-01-01T00:00:00Z",
          end_at: "2026-01-02T00:00:00Z",
          created_at: "2026-01-01T00:00:01Z",
          started_at: "2026-01-01T00:00:02Z",
          finished_at: "2026-01-01T00:00:05Z",
          error_message: null,
          artifact_counts: { orders: 2, fills: 1, positions: 1, portfolio_snapshots: 3, audit_events: 4 },
          latest_audit: null,
          gate_summary: { failed_gate_count: 0, failed_gate_reasons: [], blocked_reason_code: null },
        },
      ],
    })

    render(<HookHarness />)
    await waitFor(() => expect(screen.getByTestId("selected-strategy").textContent).toBe("strategy-1"))
    await user.click(screen.getByRole("button", { name: "Refresh paper sessions" }))

    await waitFor(() =>
      expect(screen.getByTestId("paper-session-observability").textContent).toBe(
        "read_only_paper_session_observability|1|paper-session-1",
      ),
    )
    expect(mocks.api.listPaperSessions).toHaveBeenCalledWith({
      strategyId: "strategy-1",
      strategyVersionId: "version-2",
      datasetKey: "binance:BTCUSDT:1h",
      limit: 5,
    })
  })

  it("loads detail from a recent paper session without auto-running it", async () => {
    const user = userEvent.setup()
    mocks.api.listPaperSessions.mockResolvedValue({
      safety_status: "read_only_paper_session_observability",
      has_more: false,
      items: [
        {
          session_id: "paper-session-1",
          status: "completed",
          reason_code: "paper_engine_completed",
          safety_status: "read_only_paper_session_observability",
          strategy_id: "strategy-1",
          strategy_version_id: "version-2",
          dataset_key: "binance:BTCUSDT:1h",
          exchange: "binance",
          symbol: "BTCUSDT",
          timeframe: "1h",
          start_at: "2026-01-01T00:00:00Z",
          end_at: "2026-01-02T00:00:00Z",
          created_at: "2026-01-01T00:00:01Z",
          started_at: "2026-01-01T00:00:02Z",
          finished_at: "2026-01-01T00:00:05Z",
          error_message: null,
          artifact_counts: { orders: 2, fills: 1, positions: 1, portfolio_snapshots: 3, audit_events: 4 },
          latest_audit: null,
          gate_summary: { failed_gate_count: 0, failed_gate_reasons: [], blocked_reason_code: null },
        },
      ],
    })
    mocks.api.getPaperSessionDetail.mockResolvedValue({
      session: {
        session_id: "paper-session-1",
        status: "completed",
        dataset_key: "binance:BTCUSDT:1h",
        starting_cash: "1000",
      },
      artifacts: { orders: [], fills: [], positions: [], portfolio_snapshots: [], limits: {} },
      safety_status: "read_only_paper_session_detail",
    })

    render(<HookHarness />)
    await waitFor(() => expect(screen.getByTestId("selected-strategy").textContent).toBe("strategy-1"))
    await user.click(screen.getByRole("button", { name: "Refresh paper sessions" }))
    await waitFor(() => expect(screen.getByTestId("paper-session-observability").textContent).toContain("paper-session-1"))
    await user.click(screen.getByRole("button", { name: "Load paper session detail from summary" }))

    await waitFor(() => expect(screen.getByTestId("paper-session-detail").textContent).toBe("paper-session-1"))
    expect(mocks.api.runPaperSessionLocal).not.toHaveBeenCalled()
  })

  it("surfaces paper session detail API errors with reason code", async () => {
    const user = userEvent.setup()
    mocks.api.getPaperSessionDetail.mockRejectedValue(
      new ApiError("Paper session not found.", 404, { reasonCode: "paper_session_not_found" }),
    )

    render(<HookHarness />)

    await waitFor(() => expect(screen.getByTestId("selected-strategy").textContent).toBe("strategy-1"))
    await user.click(screen.getByRole("button", { name: "Set paper session detail id" }))
    await user.click(screen.getByRole("button", { name: "Load paper session detail" }))

    await waitFor(() => {
      expect(screen.getByTestId("paper-session-detail-error").textContent).toBe(
        "Paper session not found. (paper_session_not_found)",
      )
    })
    expect(screen.getByTestId("paper-session-detail").textContent).toBe("none")
  })

  it("runs loaded queued paper session locally and refreshes detail with a bounded cap", async () => {
    const user = userEvent.setup()
    mocks.api.getPaperSessionDetail
      .mockResolvedValueOnce({
        session: {
          session_id: "paper-session-1",
          status: "queued",
          dataset_key: "binance:BTCUSDT:1h",
          starting_cash: "1000",
        },
        artifacts: { orders: [], fills: [], positions: [], portfolio_snapshots: [], limits: {} },
        safety_status: "read_only_paper_session_detail",
      })
      .mockResolvedValue({
        session: {
          session_id: "paper-session-1",
          status: "completed",
          dataset_key: "binance:BTCUSDT:1h",
          starting_cash: "1000",
          reason_code: "paper_engine_completed",
        },
        artifacts: {
          orders: [],
          fills: [],
          positions: [],
          portfolio_snapshots: [{ snapshot_id: "snapshot-1", equity: "1000", cash_balance: "1000" }],
          limits: {},
        },
        safety_status: "read_only_paper_session_detail",
      })
    mocks.api.runPaperSessionLocal.mockResolvedValue({
      status: "completed",
      reason_code: "paper_engine_completed",
      session_id: "paper-session-1",
      candles_processed: 3,
      orders_created: 0,
      fills_created: 0,
      snapshots_created: 3,
      safety_status: "local_dev_paper_engine_tick",
      details: { workerId: "strategy-lab-local-paper-run" },
    })

    render(<HookHarness />)

    await waitFor(() => expect(screen.getByTestId("selected-strategy").textContent).toBe("strategy-1"))
    await user.click(screen.getByRole("button", { name: "Set paper session detail id" }))
    await user.click(screen.getByRole("button", { name: "Load paper session detail" }))
    await waitFor(() => expect(screen.getByTestId("paper-session-can-run-local").textContent).toBe("true"))
    await user.click(screen.getByRole("button", { name: "Run local paper session" }))

    await waitFor(() => {
      expect(screen.getByTestId("paper-session-run-local").textContent).toBe(
        "completed|paper_engine_completed|paper-session-1|3",
      )
      expect(screen.getByTestId("paper-session-detail").textContent).toBe("paper-session-1")
    })
    expect(mocks.api.runPaperSessionLocal).toHaveBeenCalledWith("paper-session-1", {
      confirm_local_paper_run: true,
      max_candles_per_tick: 10000,
      worker_id: "strategy-lab-local-paper-run",
    })
    expect(mocks.api.getPaperSessionDetail.mock.calls.filter(([sessionId]) => sessionId === "paper-session-1").length).toBeLessThanOrEqual(4)
  })

  it("preserves local run result when bounded detail refresh fails", async () => {
    const user = userEvent.setup()
    mocks.api.getPaperSessionDetail
      .mockResolvedValueOnce({
        session: {
          session_id: "paper-session-1",
          status: "queued",
          dataset_key: "binance:BTCUSDT:1h",
          starting_cash: "1000",
        },
        artifacts: { orders: [], fills: [], positions: [], portfolio_snapshots: [], limits: {} },
        safety_status: "read_only_paper_session_detail",
      })
      .mockRejectedValue(new ApiError("Paper session detail failed.", 500, { reasonCode: "paper_detail_failed" }))
    mocks.api.runPaperSessionLocal.mockResolvedValue({
      status: "completed",
      reason_code: "paper_engine_completed",
      session_id: "paper-session-1",
      candles_processed: 3,
      orders_created: 0,
      fills_created: 0,
      snapshots_created: 3,
      safety_status: "local_dev_paper_engine_tick",
      details: {},
    })

    render(<HookHarness />)

    await waitFor(() => expect(screen.getByTestId("selected-strategy").textContent).toBe("strategy-1"))
    await user.click(screen.getByRole("button", { name: "Set paper session detail id" }))
    await user.click(screen.getByRole("button", { name: "Load paper session detail" }))
    await waitFor(() => expect(screen.getByTestId("paper-session-can-run-local").textContent).toBe("true"))
    await user.click(screen.getByRole("button", { name: "Run local paper session" }))

    await waitFor(() => {
      expect(screen.getByTestId("paper-session-run-local").textContent).toContain("completed|paper_engine_completed")
      expect(screen.getByTestId("paper-session-detail-error").textContent).toBe(
        "Paper session detail failed. (paper_detail_failed)",
      )
    })
  })

  it("cancels loaded queued paper session locally and refreshes detail", async () => {
    const user = userEvent.setup()
    mocks.api.getPaperSessionDetail
      .mockResolvedValueOnce({
        session: {
          session_id: "paper-session-1",
          status: "queued",
          dataset_key: "binance:BTCUSDT:1h",
          starting_cash: "1000",
        },
        artifacts: { orders: [], fills: [], positions: [], portfolio_snapshots: [], limits: {} },
        safety_status: "read_only_paper_session_detail",
      })
      .mockResolvedValue({
        session: {
          session_id: "paper-session-1",
          status: "cancelled",
          dataset_key: "binance:BTCUSDT:1h",
          starting_cash: "1000",
          reason_code: "paper_local_cancelled",
          cancel_requested_at: "2026-05-22T10:30:00Z",
        },
        artifacts: { orders: [], fills: [], positions: [], portfolio_snapshots: [], limits: {} },
        safety_status: "read_only_paper_session_detail",
      })
    mocks.api.cancelPaperSessionLocal.mockResolvedValue({
      status: "cancelled",
      reason_code: "paper_local_cancelled",
      session_id: "paper-session-1",
      previous_status: "queued",
      current_status: "cancelled",
      cancel_requested_at: "2026-05-22T10:30:00Z",
      safety_status: "local_dev_paper_cancel",
      details: { actor: "strategy-lab-local-paper-cancel" },
    })

    render(<HookHarness />)

    await waitFor(() => expect(screen.getByTestId("selected-strategy").textContent).toBe("strategy-1"))
    await user.click(screen.getByRole("button", { name: "Set paper session detail id" }))
    await user.click(screen.getByRole("button", { name: "Load paper session detail" }))
    await waitFor(() => expect(screen.getByTestId("paper-session-can-cancel-local").textContent).toBe("true"))
    await user.click(screen.getByRole("button", { name: "Cancel local paper session" }))

    await waitFor(() => {
      expect(screen.getByTestId("paper-session-cancel-local").textContent).toBe(
        "cancelled|paper_local_cancelled|paper-session-1|cancelled",
      )
      expect(screen.getByTestId("paper-session-detail").textContent).toBe("paper-session-1")
    })
    expect(mocks.api.cancelPaperSessionLocal).toHaveBeenCalledWith("paper-session-1", {
      confirm_local_paper_cancel: true,
      reason: "user_requested",
      actor: "strategy-lab-local-paper-cancel",
    })
    expect(mocks.api.runPaperSessionLocal).not.toHaveBeenCalled()
  })

  it("explains failed loaded paper session run-local disabled reason", async () => {
    const user = userEvent.setup()
    mocks.api.getPaperSessionDetail.mockResolvedValue({
      session: {
        session_id: "paper-session-1",
        status: "failed",
        dataset_key: "binance:BTCUSDT:1h",
        starting_cash: "1000",
        reason_code: "paper_strategy_runtime_failed",
        error_message: "Strategy subprocess exited with code 1.",
      },
      artifacts: { orders: [], fills: [], positions: [], portfolio_snapshots: [], limits: {} },
      safety_status: "read_only_paper_session_detail",
    })

    render(<HookHarness />)

    await waitFor(() => expect(screen.getByTestId("selected-strategy").textContent).toBe("strategy-1"))
    await user.click(screen.getByRole("button", { name: "Set paper session detail id" }))
    await user.click(screen.getByRole("button", { name: "Load paper session detail" }))

    await waitFor(() => {
      expect(screen.getByTestId("paper-session-can-run-local").textContent).toBe("false")
      expect(screen.getByTestId("paper-session-run-local-disabled-reason").textContent).toBe(
        "This paper session is failed and cannot run locally. Reason: paper_strategy_runtime_failed.",
      )
    })
  })

  it("explains context-stale loaded paper session run-local disabled reason", async () => {
    const user = userEvent.setup()
    mocks.api.getPaperSessionDetail.mockResolvedValue({
      session: {
        session_id: "paper-session-1",
        status: "queued",
        dataset_key: "binance:BTCUSDT:1h",
        starting_cash: "1000",
      },
      artifacts: { orders: [], fills: [], positions: [], portfolio_snapshots: [], limits: {} },
      safety_status: "read_only_paper_session_detail",
    })

    render(<HookHarness />)

    await waitFor(() => expect(screen.getByTestId("selected-strategy").textContent).toBe("strategy-1"))
    await user.click(screen.getByRole("button", { name: "Set paper session detail id" }))
    await user.click(screen.getByRole("button", { name: "Load paper session detail" }))
    await waitFor(() => expect(screen.getByTestId("paper-session-can-run-local").textContent).toBe("true"))

    await user.click(screen.getByRole("button", { name: "Change paper runtime context" }))

    await waitFor(() => {
      expect(screen.getByTestId("paper-session-can-run-local").textContent).toBe("false")
      expect(screen.getByTestId("paper-session-run-local-disabled-reason").textContent).toBe(
        "Paper session context changed. Refresh readiness or load a current recent session.",
      )
    })
  })

  it("loads local fill audit for selected strategy dataset context", async () => {
    mocks.api.getDatasetLocalFillAudit.mockResolvedValueOnce({
      dataset_key: "binance:BTCUSDT:1h",
      exchange: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      safety_status: "read_only",
      items: [{ job_id: "job-1", status: "completed", created_at: "2026-01-01T00:00:00Z", rows_inserted: 2 }],
    })

    render(<HookHarness />)

    await waitFor(() => {
      expect(screen.getByTestId("local-fill-audit").textContent).toBe("binance:BTCUSDT:1h|1|completed")
    })
    expect(mocks.api.getDatasetLocalFillAudit).toHaveBeenCalledWith({
      exchange: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      limit: 5,
    })
  })

  it("loads fill job visibility for selected strategy dataset context", async () => {
    mocks.api.getDatasetFillJobVisibility.mockResolvedValueOnce({
      dataset_key: "binance:BTCUSDT:1h",
      exchange: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      safety_status: "read_only",
      active: [{ job_id: "job-active", dataset_key: "binance:BTCUSDT:1h", job_type: "fill", status: "running" }],
      recent: [],
    })

    render(<HookHarness />)

    await waitFor(() => {
      expect(screen.getByTestId("fill-job-visibility").textContent).toBe("binance:BTCUSDT:1h|1|0")
    })
    expect(mocks.api.getDatasetFillJobVisibility).toHaveBeenCalledWith({
      exchange: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      limit: 5,
    })
  })

  it("requires completed run context before assisted testnet preview", async () => {
    const user = userEvent.setup()
    render(<HookHarness />)

    await waitFor(() => expect(screen.getByTestId("selected-strategy").textContent).toBe("strategy-1"))
    expect(screen.getByTestId("testnet-preview-can").textContent).toBe("false")
    expect(screen.getByTestId("testnet-preview-disabled-reason").textContent).toBe(
      "Load a completed run before previewing an assisted testnet order.",
    )

    await user.click(screen.getByRole("button", { name: "Open run" }))
    await screen.findByText("run:run-1")
    await user.click(screen.getByRole("button", { name: "Set testnet credential" }))
    await user.click(screen.getByRole("button", { name: "Set testnet amount" }))

    await waitFor(() => expect(screen.getByTestId("testnet-preview-can").textContent).toBe("true"))
    expect(screen.getByTestId("testnet-preview-disabled-reason").textContent).toBe("none")
  })

  it("submits, cancels, and reconciles assisted testnet orders with memory-only keys", async () => {
    const user = userEvent.setup()
    localStorage.clear()
    sessionStorage.clear()
    render(<HookHarness />)

    await waitFor(() => expect(screen.getByTestId("selected-strategy").textContent).toBe("strategy-1"))
    await user.click(screen.getByRole("button", { name: "Open run" }))
    await screen.findByText("run:run-1")
    await user.click(screen.getByRole("button", { name: "Set testnet credential" }))
    await user.click(screen.getByRole("button", { name: "Set testnet amount" }))
    await user.click(screen.getByRole("button", { name: "Preview testnet order" }))

    await waitFor(() => expect(screen.getByTestId("testnet-preview-result").textContent).toBe("allowed"))
    await waitFor(() => expect(screen.getByTestId("testnet-submit-can").textContent).toBe("true"))
    await user.click(screen.getByRole("button", { name: "Confirm submit testnet order" }))

    await waitFor(() => expect(screen.getByTestId("testnet-submit-result").textContent).toBe("submitted"))
    expect(mocks.api.confirmSubmitTestnetOrder).toHaveBeenCalledWith("preview-1", expect.objectContaining({
      confirmTestnetOrder: true,
      actor: "local-user",
    }))
    expect(localStorage.length).toBe(0)
    expect(sessionStorage.length).toBe(0)

    await waitFor(() => expect(screen.getByTestId("testnet-cancel-can").textContent).toBe("true"))
    await user.click(screen.getByRole("button", { name: "Cancel testnet order" }))
    await waitFor(() => expect(screen.getByTestId("testnet-cancel-result").textContent).toBe("cancelled"))
    expect(mocks.api.cancelTestnetOrder).toHaveBeenCalledWith("intent-1", expect.objectContaining({
      confirmTestnetCancel: true,
      reason: "user_requested",
    }))

    await user.click(screen.getByRole("button", { name: "Reconcile testnet order" }))
    await waitFor(() => expect(screen.getByTestId("testnet-reconcile-result").textContent).toBe("reconciled"))
    expect(mocks.api.reconcileTestnetOrder).toHaveBeenCalledWith(expect.objectContaining({
      orderId: "intent-1",
      confirmTestnetReconcile: true,
      trigger: "manual",
    }))
  })

  it("projects terminal assisted testnet orders to the execution journal", async () => {
    const user = userEvent.setup()
    mocks.api.getTestnetOrderDetail.mockResolvedValue({
      safety_status: "assisted_testnet_order_read_only",
      intent: {
        intent_id: "intent-1",
        intent_key: "intent-key-1",
        status: "filled",
        reason_code: "testnet_order_reconcile_binance_matched",
        client_order_id: "client-order-1",
        environment: "binance_testnet",
        exchange: "binance",
        market_type: "spot",
        symbol: "BTCUSDT",
        side: "buy",
        order_type: "market",
        quantity: null,
        quote_quantity: "25",
        strategy_id: "strategy-1",
        strategy_version_id: "version-2",
        source_run_id: "run-1",
        credential_ref_id: "credential-ref-1",
        latest_preview_id: "preview-1",
        reconciliation_required: false,
      },
      latest_preview: null,
      previews: [],
      events: [],
      reconciliation_attempts: [],
    })
    render(<HookHarness />)

    await waitFor(() => expect(screen.getByTestId("selected-strategy").textContent).toBe("strategy-1"))
    await user.click(screen.getByRole("button", { name: "Open run" }))
    await screen.findByText("run:run-1")
    await user.click(screen.getByRole("button", { name: "Set testnet credential" }))
    await user.click(screen.getByRole("button", { name: "Set testnet amount" }))
    await user.click(screen.getByRole("button", { name: "Preview testnet order" }))

    await waitFor(() => expect(screen.getByTestId("testnet-project-can").textContent).toBe("true"))
    await user.click(screen.getByRole("button", { name: "Project testnet order" }))
    await waitFor(() => expect(screen.getByTestId("testnet-project-result").textContent).toBe("journal_projected"))
    expect(mocks.api.projectTestnetOrderToJournal).toHaveBeenCalledWith("intent-1", {
      confirmTestnetJournalProjection: true,
      source: "strategy_lab",
      actor: "local-user",
    })
  })

  it("manually refreshes fill job visibility", async () => {
    const user = userEvent.setup()
    mocks.api.getDatasetFillJobVisibility
      .mockResolvedValueOnce({
        dataset_key: "binance:BTCUSDT:1h",
        exchange: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        safety_status: "read_only",
        active: [],
        recent: [],
      })
      .mockResolvedValueOnce({
        dataset_key: "binance:BTCUSDT:1h",
        exchange: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        safety_status: "read_only",
        active: [],
        recent: [{ job_id: "job-recent", dataset_key: "binance:BTCUSDT:1h", job_type: "fill", status: "completed" }],
      })

    render(<HookHarness />)

    await waitFor(() => expect(screen.getByTestId("fill-job-visibility").textContent).toBe("binance:BTCUSDT:1h|0|0"))
    await user.click(screen.getByRole("button", { name: "Refresh fill job visibility" }))

    await waitFor(() => expect(screen.getByTestId("fill-job-visibility").textContent).toBe("binance:BTCUSDT:1h|0|1"))
    expect(mocks.api.getDatasetFillJobVisibility).toHaveBeenCalledTimes(2)
  })

  it("loads fill scheduler status on workspace load", async () => {
    mocks.api.getFillSchedulerStatus.mockResolvedValueOnce({
      enabled: true,
      running: false,
      worker_id: "trade-lab-local-scheduler",
      interval_seconds: 60,
      last_tick_status: "processed",
      last_job_id: "job-1",
      last_dataset_key: "binance:BTCUSDT:1h",
      stale_jobs_marked: 1,
      consecutive_failure_count: 0,
      safety_status: "read_only_scheduler_visibility",
    })

    render(<HookHarness />)

    await waitFor(() => {
      expect(screen.getByTestId("fill-scheduler-status").textContent).toBe("processed|trade-lab-local-scheduler|0")
    })
    expect(mocks.api.getFillSchedulerStatus).toHaveBeenCalled()
  })

  it("manually refreshes fill scheduler status", async () => {
    const user = userEvent.setup()
    mocks.api.getFillSchedulerStatus
      .mockResolvedValueOnce({
        last_tick_status: "disabled",
        worker_id: "trade-lab-local-scheduler",
        consecutive_failure_count: 0,
      })
      .mockResolvedValueOnce({
        last_tick_status: "failed",
        worker_id: "trade-lab-local-scheduler",
        consecutive_failure_count: 2,
      })

    render(<HookHarness />)

    await waitFor(() => expect(screen.getByTestId("fill-scheduler-status").textContent).toBe("disabled|trade-lab-local-scheduler|0"))
    await user.click(screen.getByRole("button", { name: "Refresh scheduler status" }))

    await waitFor(() => expect(screen.getByTestId("fill-scheduler-status").textContent).toBe("failed|trade-lab-local-scheduler|2"))
    expect(mocks.api.getFillSchedulerStatus).toHaveBeenCalledTimes(2)
  })

  it("surfaces fill scheduler status load errors inline", async () => {
    mocks.api.getFillSchedulerStatus.mockRejectedValueOnce(new Error("Scheduler status failed."))

    render(<HookHarness />)

    await waitFor(() => {
      expect(screen.getByTestId("fill-scheduler-status-error").textContent).toBe("Scheduler status failed.")
    })
  })

  it("loads paper scheduler status through workspace refresh", async () => {
    mocks.api.getPaperSchedulerStatus.mockResolvedValueOnce({
      last_tick_status: "processed",
      worker_id: "tradelab-local-paper-scheduler",
      consecutive_failure_count: 0,
    })

    render(<HookHarness />)

    await waitFor(() =>
      expect(screen.getByTestId("paper-scheduler-status").textContent).toBe(
        "processed|tradelab-local-paper-scheduler|0",
      ),
    )
    expect(mocks.api.getPaperSchedulerStatus).toHaveBeenCalled()
  })

  it("records paper scheduler status errors without clearing previous status", async () => {
    const user = userEvent.setup()
    mocks.api.getPaperSchedulerStatus
      .mockResolvedValueOnce({
        last_tick_status: "disabled",
        worker_id: "tradelab-local-paper-scheduler",
        consecutive_failure_count: 0,
      })
      .mockRejectedValueOnce(new Error("Paper scheduler status failed."))

    render(<HookHarness />)

    await waitFor(() =>
      expect(screen.getByTestId("paper-scheduler-status").textContent).toBe(
        "disabled|tradelab-local-paper-scheduler|0",
      ),
    )
    await user.click(screen.getByRole("button", { name: "Refresh paper scheduler status" }))

    await waitFor(() =>
      expect(screen.getByTestId("paper-scheduler-status-error").textContent).toBe(
        "Paper scheduler status failed.",
      ),
    )
    expect(screen.getByTestId("paper-scheduler-status").textContent).toBe(
      "disabled|tradelab-local-paper-scheduler|0",
    )
  })

  it("refreshes local fill audit after local fill success", async () => {
    const user = userEvent.setup()
    mocks.api.previewDatasetFill.mockResolvedValueOnce({
      preview_id: "preview-1",
      generated_at: "2026-05-18T00:00:00Z",
      request_fingerprint: "fingerprint-1",
      dataset_key: "binance:BTCUSDT:1h",
      exchange: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      requested_range: { start_at: "2026-01-01T00:00:00Z", end_at: "2026-01-07T00:00:00Z" },
      coverage_status: "partial",
      gap_count: 1,
      estimated_rows: 24,
      blocked_reasons: [],
      safety_status: "preview_only",
      missing_ranges: [{ start_at: "2026-01-01T00:00:00Z", end_at: "2026-01-01T02:00:00Z", kind: "head" }],
      active_job_id: null,
      active_job_type: null,
    })
    mocks.api.fillDatasetLocal.mockResolvedValueOnce({
      job_id: "job-1",
      dataset_key: "binance:BTCUSDT:1h",
      status: "completed",
      safety_status: "local_dev_fill_only",
      requested_range: { start_at: "2026-01-01T00:00:00Z", end_at: "2026-01-07T00:00:00Z" },
      ranges_filled: [],
      rows_fetched: 2,
      rows_inserted: 2,
      rows_skipped_existing: 0,
      blocked_reasons: [],
      preview_id: "preview-1",
      request_fingerprint: "fingerprint-1",
    })

    render(<HookHarness />)

    await waitFor(() => expect(screen.getByTestId("selected-strategy").textContent).toBe("strategy-1"))
    await user.click(screen.getByRole("button", { name: "Preview fill" }))
    await waitFor(() => expect(screen.getByTestId("dataset-fill-preview").textContent).toBe("binance:BTCUSDT:1h|partial|preview_only"))
    await user.click(screen.getByRole("button", { name: "Confirm local fill checkbox" }))
    await user.click(screen.getByRole("button", { name: "Confirm local fill" }))

    await waitFor(() => expect(screen.getByTestId("dataset-local-fill-result").textContent).toBe("completed"))
    expect(mocks.api.getDatasetLocalFillAudit).toHaveBeenCalledWith({
      exchange: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      limit: 5,
    })
    expect(mocks.api.getDatasetLocalFillAudit.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(mocks.api.getDatasetFillJobVisibility).toHaveBeenCalledWith({
      datasetKey: "binance:BTCUSDT:1h",
      limit: 5,
    })
  })

  it("refreshes local fill audit after provider failure", async () => {
    const user = userEvent.setup()
    mocks.api.previewDatasetFill.mockResolvedValueOnce({
      preview_id: "preview-1",
      generated_at: "2026-05-18T00:00:00Z",
      request_fingerprint: "fingerprint-1",
      dataset_key: "binance:BTCUSDT:1h",
      exchange: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      requested_range: { start_at: "2026-01-01T00:00:00Z", end_at: "2026-01-07T00:00:00Z" },
      coverage_status: "partial",
      gap_count: 1,
      estimated_rows: 24,
      blocked_reasons: [],
      safety_status: "preview_only",
      missing_ranges: [{ start_at: "2026-01-01T00:00:00Z", end_at: "2026-01-01T02:00:00Z", kind: "head" }],
      active_job_id: null,
      active_job_type: null,
    })
    mocks.api.fillDatasetLocal.mockRejectedValueOnce(
      new ApiError("Binance public klines rate limit was reached.", 400, {
        reasonCode: "dataset_fill_provider_rate_limited",
        providerStatus: "429",
      }),
    )

    render(<HookHarness />)

    await waitFor(() => expect(screen.getByTestId("selected-strategy").textContent).toBe("strategy-1"))
    await user.click(screen.getByRole("button", { name: "Preview fill" }))
    await waitFor(() => expect(screen.getByTestId("dataset-fill-preview").textContent).toBe("binance:BTCUSDT:1h|partial|preview_only"))
    await user.click(screen.getByRole("button", { name: "Confirm local fill checkbox" }))
    await user.click(screen.getByRole("button", { name: "Confirm local fill" }))

    await waitFor(() => {
      expect(screen.getByTestId("dataset-local-fill-error").textContent).toContain("dataset_fill_provider_rate_limited")
    })
    expect(mocks.api.getDatasetLocalFillAudit.mock.calls.length).toBeGreaterThanOrEqual(2)
    expect(mocks.api.getDatasetFillJobVisibility).toHaveBeenCalledWith({
      exchange: "binance",
      symbol: "BTCUSDT",
      timeframe: "1h",
      limit: 5,
    })
  })
})
