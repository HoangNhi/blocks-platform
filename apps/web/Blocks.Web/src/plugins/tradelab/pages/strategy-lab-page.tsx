import { useCallback, useMemo, useRef, useState } from "react"
import { AlertTriangle, Bot, Sparkles } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

import { BacktestChartPanel } from "../components/backtest-chart-panel"
import { AssistedTestnetOrderDetailPanel } from "../components/assisted-testnet-order-detail-panel"
import { AssistedTestnetPanel } from "../components/assisted-testnet-panel"
import { BenchmarkRepeatabilityPanel } from "../components/benchmark-repeatability-panel"
import { BackgroundFillJobsPanel } from "../components/background-fill-jobs-panel"
import { CompareModeShell } from "../components/compare-mode-shell"
import { CompareRunPickerDialog } from "../components/compare-run-picker-dialog"
import { AssistedLiveOrderDetailPanel } from "../components/assisted-live-order-detail-panel"
import { AssistedLivePanel } from "../components/assisted-live-panel"
import { DatasetReadinessPanel } from "../components/dataset-readiness-panel"
import { EquityDrawdownPanel } from "../components/equity-drawdown-panel"
import { ExecutionJournalPanel } from "../components/execution-journal-panel"
import { BacktestLogsPanel } from "../components/backtest-logs-panel"
import { BacktestMetricsDataPanel } from "../components/backtest-metrics-data-panel"
import { JobVisibilityPanel } from "../components/job-visibility-panel"
import { LocalFillAuditPanel } from "../components/local-fill-audit-panel"
import { ManualSignalHandoffPanel } from "../components/manual-signal-handoff-panel"
import { ResearchRobustnessGatePanel } from "../components/research-robustness-gate-panel"
import { ResearchScorecardPanel } from "../components/research-scorecard-panel"
import { PaperRuntimeDetailPanel } from "../components/paper-runtime-detail-panel"
import { PaperSessionPanel } from "../components/paper-session-panel"
import { PreflightDialog } from "../components/preflight-dialog"
import { RiskGuardPanel } from "../components/risk-guard-panel"
import { RunHistoryList } from "../components/run-history-list"
import { RunReadinessPanel } from "../components/run-readiness-panel"
import { RunPipelinePanel } from "../components/run-pipeline-panel"
import { RuntimeConfigPanel } from "../components/runtime-config-panel"
import { SchedulerStatusPanel } from "../components/scheduler-status-panel"
import { StrategyCodeEditor } from "../components/strategy-code-editor"
import { StrategyGroupList } from "../components/strategy-group-list"
import { StrategyList } from "../components/strategy-list"
import { SelectedTradeExecutionPanel } from "../components/selected-trade-execution-panel"
import { TradeBreakdownTable } from "../components/trade-breakdown-table"
import { FuturesResearchSummaryPanel } from "../components/futures-research-summary-panel"
import { PositionsPanel } from "../components/positions-panel"
import { TradeMarkerDetailPanel } from "../components/trade-marker-detail-panel"
import { VersionRunPanel } from "../components/version-run-panel"
import { useTradeLabWorkspace } from "../api/tradelab-hooks"
import { buildDatasetCatalogHref } from "../utils/dataset-catalog-link"
import {
  buildResearchRangeGuidance,
  buildResearchScorecard,
  calculateOrderFeasibility,
} from "../utils/research-run-readiness"

import { StrategyLabPaperToolsPanel } from "../components/strategy-lab-paper-tools-panel"
import { StrategyLabEvaluatePanel } from "../components/strategy-lab-evaluate-panel"
import { StrategyLabAdvancedPanel } from "../components/strategy-lab-advanced-panel"

export function StrategyLabPage() {
  const {
    groups,
    strategies,
    draftRuntimeConfig,
    draftRiskConfig,
    draftSource,
    validationCheck,
    actionMessage,
    error,
    isLoading,
    isSavingSettings,
    isSavingVersion,
    isCheckingSyntax,
    isRunningBacktest,
    isStartingBenchmarkRepeat,
    isPollingPipeline,
    isJobVisibilityLoading,
    isFillJobVisibilityLoading,
    isLocalFillAuditLoading,
    isPreviewingDatasetFill,
    isFillingDatasetLocal,
    isEnqueueingDatasetFill,
    isDatasetLocalFillConfirmed,
    selectedGroupId,
    selectedStrategyId,
    selectedStrategy,
    currentVersion,
    execution,
    chartData,
    selectedTrade,
    runAnalysis,
    selectedAnalyzedTrade,
    selectedTradeExecutionDetail,
    runHistory,
    latestCurrentRunId,
    compareCandidates,
    compareMode,
    benchmarkCheck,
    manualSignalPackage,
    manualSignalPackageError,
    isCreatingManualSignalPackage,
    researchRobustnessGate,
    researchRobustnessGateError,
    isCreatingResearchRobustnessGate,
    executionJournal,
    executionJournalError,
    isExecutionJournalLoading,
    isSavingExecutionJournalEntry,
    isComparePickerOpen,
    activePipeline,
    jobVisibility,
    jobVisibilityError,
    fillJobVisibility,
    fillJobVisibilityError,
    fillSchedulerStatus,
    fillSchedulerStatusError,
    isFillSchedulerStatusLoading,
    paperSessionPreview,
    paperSessionPreviewError,
    paperSessionPreviewSetupReason,
    isPaperSessionPreviewLoading,
    paperSessionDetailInput,
    paperSessionDetail,
    paperSessionDetailError,
    isPaperSessionDetailLoading,
    paperSessionObservability,
    paperSessionObservabilityError,
    isPaperSessionObservabilityLoading,
    paperKillSwitchStatus,
    paperKillSwitchStatusError,
    isPaperKillSwitchStatusLoading,
    paperSchedulerStatus,
    paperSchedulerStatusError,
    isPaperSchedulerStatusLoading,
    paperSessionStartResult,
    paperSessionStartError,
    isStartingPaperSession,
    canStartPaperSession,
    paperSessionStartDisabledReason,
    paperSessionRunLocalResult,
    paperSessionRunLocalError,
    isRunningPaperSessionLocal,
    canRunPaperSessionLocal,
    paperSessionRunLocalDisabledReason,
    runPaperSessionLocal,
    paperSessionCancelLocalResult,
    paperSessionCancelLocalError,
    isCancellingPaperSessionLocal,
    canCancelPaperSessionLocal,
    paperSessionCancelLocalDisabledReason,
    cancelPaperSessionLocal,
    paperSessionRetryLocalResult,
    paperSessionRetryLocalError,
    isRetryingPaperSessionLocal,
    canRetryPaperSessionLocal,
    paperSessionRetryLocalDisabledReason,
    retryPaperSessionLocal,
    paperSessionResumeReadiness,
    paperSessionResumeReadinessError,
    isPaperSessionResumeReadinessLoading,
    paperSessionResumeLocalResult,
    paperSessionResumeLocalError,
    isResumingPaperSessionLocal,
    canResumePaperSessionLocal,
    paperSessionResumeLocalDisabledReason,
    resumePaperSessionLocal,
    liveOrderSide,
    liveOrderSizeMode,
    liveOrderAmount,
    liveOrderCredentialRefId,
    liveOrderPreview,
    liveOrderPreviewError,
    liveOrderSubmitResult,
    liveOrderSubmitError,
    liveOrderCancelResult,
    liveOrderCancelError,
    liveOrderReconcileResult,
    liveOrderReconcileError,
    liveOrderJournalProjectionResult,
    liveOrderJournalProjectionError,
    liveOrderDetail,
    liveOrderDetailError,
    liveOrderList,
    liveOrderListError,
    isLiveOrderPreviewLoading,
    isLiveOrderDetailLoading,
    isLiveOrderListLoading,
    isSubmittingLiveOrder,
    isCancellingLiveOrder,
    isReconcilingLiveOrder,
    isProjectingLiveOrderToJournal,
    liveOrderPreviewDisabledReason,
    canConfirmSubmitLiveOrder,
    canCancelLiveOrder,
    canReconcileLiveOrder,
    canProjectLiveOrderToJournal,
    setLiveOrderSide,
    setLiveOrderSizeMode,
    setLiveOrderAmount,
    setLiveOrderCredentialRefId,
    previewLiveOrder,
    confirmSubmitLiveOrder,
    cancelLiveOrder,
    reconcileLiveOrder,
    projectLiveOrderToJournal,
    loadLiveOrderDetail,
    refreshLiveOrders,
    testnetOrderSide,
    testnetOrderSizeMode,
    testnetOrderAmount,
    testnetCredentialRefId,
    testnetOrderPreview,
    testnetOrderPreviewError,
    testnetOrderSubmitResult,
    testnetOrderSubmitError,
    testnetOrderCancelResult,
    testnetOrderCancelError,
    testnetOrderReconcileResult,
    testnetOrderReconcileError,
    testnetOrderJournalProjectionResult,
    testnetOrderJournalProjectionError,
    testnetOrderDetail,
    testnetOrderDetailError,
    testnetOrderList,
    testnetOrderListError,
    isTestnetOrderPreviewLoading,
    isTestnetOrderDetailLoading,
    isTestnetOrderListLoading,
    isSubmittingTestnetOrder,
    isCancellingTestnetOrder,
    isReconcilingTestnetOrder,
    isProjectingTestnetOrderToJournal,
    testnetOrderPreviewDisabledReason,
    canConfirmSubmitTestnetOrder,
    canCancelTestnetOrder,
    canReconcileTestnetOrder,
    canProjectTestnetOrderToJournal,
    setTestnetOrderSide,
    setTestnetOrderSizeMode,
    setTestnetOrderAmount,
    setTestnetCredentialRefId,
    previewTestnetOrder,
    confirmSubmitTestnetOrder,
    cancelTestnetOrder,
    reconcileTestnetOrder,
    projectTestnetOrderToJournal,
    loadTestnetOrderDetail,
    refreshTestnetOrders,
    localFillAudit,
    localFillAuditError,
    datasetFillPreview,
    datasetFillPreviewError,
    datasetLocalFillResult,
    datasetLocalFillError,
    datasetFillEnqueueResult,
    datasetFillEnqueueError,
    preflightResult,
    isPreflightOpen,
    isDraftDirty,
    isConfigDirty,
    runDisabledReason,
    runVersion,
    paperDraftBot,
    credentialBoundary,
    draftCredentialBoundaryChecks,
    setDraftRuntimeConfig,
    setDraftRiskConfig,
    setDraftCredentialBoundaryChecks,
    setDraftSource,
    selectGroup,
    selectStrategy,
    saveStrategySettings,
    createVersion,
    savePaperDraft,
    checkSyntax,
    runBacktest,
    confirmBacktest,
    cancelPreflight,
    reopenRun,
    selectTrade,
    selectAnalyzedTrade,
    openComparePicker,
    closeComparePicker,
    chooseCompareRun,
    exitCompareMode,
    refreshPipeline,
    refreshJobVisibility,
    refreshLocalFillAudit,
    refreshFillJobVisibility,
    refreshFillSchedulerStatus,
    refreshPaperSchedulerStatus,
    refreshPaperSessionPreview,
    refreshPaperSessionObservability,
    setPaperSessionDetailInput,
    loadPaperSessionDetail,
    loadPaperSessionDetailFromSummary,
    startPaperSessionFromPreview,
    previewDatasetFillPlan,
    setIsDatasetLocalFillConfirmed,
    confirmDatasetLocalFill,
    queueDatasetFillLocal,
    refreshRunHistory,
    startBenchmarkRepeat,
    createManualSignalPackage,
    createResearchRobustnessGate,
    createExecutionJournalEntry,
    updateExecutionJournalEntry,
    deleteExecutionJournalEntry,
    isSavingPaperDraft,
  } = useTradeLabWorkspace()

  const runPanelRef = useRef<HTMLDivElement | null>(null)
  const [researchPhase, setResearchPhase] = useState<"unspecified" | "in-sample" | "validation" | "final OOS">("unspecified")
  const [trialNote, setTrialNote] = useState("")

  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? null
  const activeRunId = activePipeline?.run.id ?? execution?.runId ?? null
  const selectedRun = runHistory.find((run) => run.id === activeRunId) ?? null
  const runtimeErrorMessage = execution?.errorMessage ?? activePipeline?.run.errorMessage ?? selectedRun?.errorMessage ?? null
  const datasetCatalogHref = buildDatasetCatalogHref(preflightResult, draftRuntimeConfig)
  const representativePrice = chartData?.candles.at(-1)?.close ?? null
  const orderFeasibility = useMemo(
    () => calculateOrderFeasibility(draftRuntimeConfig, draftRiskConfig, representativePrice),
    [draftRiskConfig, draftRuntimeConfig, representativePrice],
  )
  const rangeGuidance = useMemo(
    () => buildResearchRangeGuidance(draftRuntimeConfig),
    [draftRuntimeConfig],
  )
  const readinessLevel = orderFeasibility.level === "blocked"
    ? "blocked"
    : orderFeasibility.level === "warning" || rangeGuidance.level === "warning"
      ? "warning"
      : "ready"
  const readinessMessages = useMemo(
    () => [...orderFeasibility.messages, ...rangeGuidance.messages],
    [orderFeasibility.messages, rangeGuidance.messages],
  )
  const preflightPayloadSummary = useMemo(() => {
    if (!runVersion) return null
    return {
      strategyVersion: `v${runVersion.versionNumber} ${runVersion.id.slice(0, 8)}`,
      exchange: draftRuntimeConfig.exchange,
      symbol: draftRuntimeConfig.symbol,
      timeframe: draftRuntimeConfig.timeframe,
      startAt: draftRuntimeConfig.startAt,
      endAt: draftRuntimeConfig.endAt,
      initialEquity: draftRuntimeConfig.initialEquity,
      feeBps: draftRuntimeConfig.feeBps,
      slippageBps: draftRuntimeConfig.slippageBps,
      maxOrderPercent: draftRiskConfig.maxOrderPercent,
      maxPositionPercent: draftRiskConfig.maxPositionPercent,
      maxDrawdownPercent: draftRiskConfig.maxDrawdownPercent,
      minNotional: draftRiskConfig.minNotional,
      stepSize: draftRiskConfig.stepSize,
      tickSize: draftRiskConfig.tickSize,
    }
  }, [draftRiskConfig, draftRuntimeConfig, runVersion])
  const scorecardVerdict = useMemo(
    () => buildResearchScorecard({ analysis: runAnalysis, execution }),
    [execution, runAnalysis],
  )
  const focusRunPanel = useCallback(() => {
    runPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
    runPanelRef.current?.focus()
  }, [])
  const currentRunIds = useMemo(
    () => new Set(latestCurrentRunId ? [latestCurrentRunId] : []),
    [latestCurrentRunId],
  )
  const hasPaperRuntimeContext = Boolean(
    paperSessionDetail || paperSessionRunLocalResult || paperSessionRunLocalError,
  )
  const hasLiveOrderContext = Boolean(liveOrderDetail || liveOrderPreview || liveOrderDetailError || liveOrderPreviewError)
  const hasTestnetOrderContext = Boolean(testnetOrderPreview || testnetOrderDetail || testnetOrderDetailError)

  const activeRunSummary = runAnalysis?.run ?? selectedRun ?? null

  const dataOpsTab = (
    <div className="grid gap-4">
      <DatasetReadinessPanel
        preflight={preflightResult}
        pipeline={activePipeline}
        runtimeConfig={draftRuntimeConfig}
        runtimeErrorMessage={runtimeErrorMessage}
        datasetCatalogHref={datasetCatalogHref}
        fillPreview={datasetFillPreview}
        fillPreviewError={datasetFillPreviewError}
        isPreviewingFillPlan={isPreviewingDatasetFill}
        onPreviewFillPlan={previewDatasetFillPlan}
        localFillResult={datasetLocalFillResult}
        localFillError={datasetLocalFillError}
        enqueueFillResult={datasetFillEnqueueResult}
        enqueueFillError={datasetFillEnqueueError}
        isFillingLocalDataset={isFillingDatasetLocal}
        isEnqueueingDatasetFill={isEnqueueingDatasetFill}
        isLocalFillConfirmed={isDatasetLocalFillConfirmed}
        onLocalFillConfirmChange={setIsDatasetLocalFillConfirmed}
        onConfirmLocalFill={confirmDatasetLocalFill}
        onQueueBackgroundFill={queueDatasetFillLocal}
      />
      <LocalFillAuditPanel audit={localFillAudit} isLoading={isLocalFillAuditLoading} errorMessage={localFillAuditError} onRefresh={() => void refreshLocalFillAudit()} />
      <SchedulerStatusPanel status={fillSchedulerStatus} isLoading={isFillSchedulerStatusLoading} errorMessage={fillSchedulerStatusError} onRefresh={() => void refreshFillSchedulerStatus()} />
      <BackgroundFillJobsPanel visibility={fillJobVisibility} isLoading={isFillJobVisibilityLoading} errorMessage={fillJobVisibilityError} onRefresh={() => void refreshFillJobVisibility()} />
      <JobVisibilityPanel visibility={jobVisibility} isLoading={isJobVisibilityLoading} errorMessage={jobVisibilityError} onRefresh={() => selectedStrategy && void refreshJobVisibility(selectedStrategy.id)} />
      <RunPipelinePanel pipeline={activePipeline} preflight={preflightResult} runtimeErrorMessage={runtimeErrorMessage} isPolling={isPollingPipeline} onRefresh={activeRunId ? () => void refreshPipeline(activeRunId) : undefined} />
    </div>
  )

  const runSummaryCard = (
    <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
      <CardHeader className="border-b border-slate-200 bg-slate-50/80 py-4">
        <CardTitle className="text-base">Selected run</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2 p-4 text-sm text-slate-600">
        {activeRunSummary ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <span>Run ID</span>
              <strong className="text-slate-900">{activeRunSummary.id.slice(0, 8)}</strong>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Market</span>
              <strong className="text-slate-900">{activeRunSummary.exchange} - {activeRunSummary.symbol} - {activeRunSummary.timeframe}</strong>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>Status</span>
              <strong className="text-slate-900">{activeRunSummary.status}</strong>
            </div>
          </>
        ) : (
          <span>No completed run is selected yet.</span>
        )}
      </CardContent>
    </Card>
  )

  if (isLoading) {
    return <CenteredState icon={Bot} title="Loading TradeLab" description="Fetching Strategy Lab workspace state." />
  }

  if (error) {
    return (
      <CenteredState
        icon={AlertTriangle}
        title="TradeLab failed to load"
        description={error}
        tone="danger"
      />
    )
  }

  if (!groups.length) {
    return (
      <CenteredState
        icon={Sparkles}
        title="TradeLab is ready for data"
        description="No strategy groups exist yet in the TradeLab backend."
      />
    )
  }

  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 -z-10 h-64 bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.18),transparent_35%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.16),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.76))]" />

      <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]" data-testid="strategy-lab-layout">
        <aside className="grid content-start gap-4 xl:w-[17.5rem]" data-testid="strategy-lab-left-rail">
          <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
            <CardHeader className="border-b border-slate-200 bg-slate-50/70 py-4">
              <CardTitle className="text-base">Strategy groups</CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              <StrategyGroupList groups={groups} selectedGroupId={selectedGroupId} onSelectGroup={selectGroup} />
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
            <CardHeader className="border-b border-slate-200 bg-slate-50/70 py-4">
              <CardTitle className="text-base">
                Strategies in {selectedGroup?.name ?? "selected group"}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3">
              <StrategyList
                strategies={strategies}
                selectedStrategyId={selectedStrategyId}
                onSelectStrategy={selectStrategy}
              />
            </CardContent>
          </Card>

          {selectedStrategy && (
            <RunHistoryList
              runs={runHistory}
              selectedRunId={activeRunId}
              latestCurrentRunId={latestCurrentRunId}
              currentRunIds={currentRunIds}
              onOpenRun={reopenRun}
              onCompareSelectedRun={openComparePicker}
              onRefresh={() => void refreshRunHistory(selectedStrategy.id)}
            />
          )}
        </aside>

        {!selectedStrategy || !currentVersion ? (
          <div>
            <CenteredState
              icon={Bot}
              title="Select a strategy"
              description="Choose a strategy group and strategy to load the Strategy Lab workbench."
            />
          </div>
        ) : (
          <section className="grid min-w-0 gap-4" data-testid="strategy-lab-main-canvas">
            <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
              <CardHeader className="space-y-4 border-b border-slate-200 bg-white/90">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">Strategy Lab</Badge>
                      <Badge className={selectedStrategy.status === "active" ? "bg-emerald-600 hover:bg-emerald-600" : "bg-slate-600 hover:bg-slate-600"}>
                        {selectedStrategy.status}
                      </Badge>
                      <Badge variant={currentVersion.validationStatus === "valid" ? "default" : "secondary"}>
                        {currentVersion.validationStatus}
                      </Badge>
                    </div>
                    <CardTitle className="mt-3 text-2xl tracking-tight">{selectedStrategy.name}</CardTitle>
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                      Draft Python editor with real Binance Spot preflight, chained data jobs, run history, and the approved chart layout.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{selectedGroup?.name ?? "No group"}</Badge>
                    <Badge variant="secondary">v{currentVersion.versionNumber}</Badge>
                  </div>
                </div>

                {actionMessage ? (
                  <Alert>
                    <AlertTriangle className="size-4" />
                    <AlertTitle>TradeLab update</AlertTitle>
                    <AlertDescription>{actionMessage}</AlertDescription>
                  </Alert>
                ) : null}
              </CardHeader>
              <CardContent className="grid gap-4 p-4">
                <StrategyCodeEditor
                  sourceCode={draftSource}
                  validationMessage={currentVersion.validationMessage}
                  validationCheck={validationCheck}
                  actionMessage={actionMessage}
                  isCreateVersionDisabled={isSavingVersion}
                  isRunDisabled={Boolean(runDisabledReason)}
                  isRunningBacktest={isRunningBacktest}
                  isDraftDirty={isDraftDirty}
                  isCheckingSyntax={isCheckingSyntax}
                  runDisabledReason={runDisabledReason}
                  onChange={setDraftSource}
                  onCheckSyntax={checkSyntax}
                  onCreateVersion={createVersion}
                  onRunBacktest={focusRunPanel}
                />

                {compareMode ? (
                  <CompareModeShell compareMode={compareMode} onExit={exitCompareMode} />
                ) : (
                  <div className="grid gap-4">
                    <div className="grid gap-4 xl:grid-cols-2">
                      <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
                        <CardHeader className="border-b border-slate-200 bg-slate-50/70 py-4">
                          <CardTitle className="text-base">Runtime config</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4">
                          <RuntimeConfigPanel value={draftRuntimeConfig} disabled={isSavingSettings || isSavingVersion || isRunningBacktest} onChange={setDraftRuntimeConfig} />
                        </CardContent>
                      </Card>

                      <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
                        <CardHeader className="border-b border-slate-200 bg-slate-50/70 py-4">
                          <CardTitle className="text-base">Risk guard</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4">
                          <RiskGuardPanel value={draftRiskConfig} disabled={isSavingSettings || isSavingVersion || isRunningBacktest} onChange={setDraftRiskConfig} />
                        </CardContent>
                      </Card>
                    </div>

                    <RunReadinessPanel orderFeasibility={orderFeasibility} rangeGuidance={rangeGuidance} runtimeSummary={`${draftRuntimeConfig.exchange} - ${draftRuntimeConfig.symbol} - ${draftRuntimeConfig.timeframe}`} />
                    <ResearchContextPanel researchPhase={researchPhase} trialNote={trialNote} onResearchPhaseChange={setResearchPhase} onTrialNoteChange={setTrialNote} />
                    
                    <div ref={runPanelRef} tabIndex={-1} aria-label="Backtest review panel" className="outline-none">
                      <VersionRunPanel
                        strategy={selectedStrategy}
                        currentVersion={currentVersion}
                        runVersion={runVersion}
                        actionMessage={actionMessage}
                        runDisabledReason={runDisabledReason ?? (orderFeasibility.level === "blocked" ? "Fix blocked order sizing before running." : null)}
                        isDraftDirty={isDraftDirty}
                        isConfigDirty={isConfigDirty}
                        onSaveSettings={() => saveStrategySettings(draftRuntimeConfig, draftRiskConfig)}
                        onCreateVersion={createVersion}
                        onRunBacktest={runBacktest}
                        isSavingSettings={isSavingSettings}
                        isSavingVersion={isSavingVersion}
                        isRunning={isRunningBacktest}
                      />
                    </div>

                    <StrategyLabEvaluatePanel
                      runSummary={runSummaryCard}
                      scorecard={<ResearchScorecardPanel verdict={scorecardVerdict} />}
                      chart={<BacktestChartPanel candles={chartData?.candles ?? []} markers={chartData?.markers ?? []} selectedTrade={selectedTrade} focusTrade={selectedAnalyzedTrade} onMarkerSelect={selectTrade} />}
                      tradeBreakdown={
                        <div className="grid gap-4">
                          <TradeBreakdownTable
                            trades={runAnalysis?.trades ?? []}
                            selectedTradeId={selectedAnalyzedTrade?.id ?? null}
                            onSelectTrade={(tradeId) => void selectAnalyzedTrade(tradeId)}
                          />
                          {runAnalysis?.futuresSummary ? (
                            <FuturesResearchSummaryPanel summary={runAnalysis.futuresSummary} />
                          ) : null}
                          {(runAnalysis?.positions?.length ?? 0) > 0 && (
                            <PositionsPanel positions={runAnalysis?.positions ?? []} />
                          )}
                        </div>
                      }
                      tradeDetail={
                        <div className="grid gap-4 xl:grid-cols-2">
                          <TradeMarkerDetailPanel trade={selectedTrade} />
                          <SelectedTradeExecutionPanel detail={selectedTradeExecutionDetail} />
                        </div>
                      }
                      equity={
                        <div className="grid gap-4">
                          <EquityDrawdownPanel equityCurve={chartData?.equityCurve ?? execution?.equityCurve ?? []} />
                          <ManualSignalHandoffPanel
                            analysis={runAnalysis}
                            packageResult={manualSignalPackage}
                            isCreating={isCreatingManualSignalPackage}
                            error={manualSignalPackageError}
                            onCreate={createManualSignalPackage}
                          />
                          <ResearchRobustnessGatePanel
                            analysis={runAnalysis}
                            gate={researchRobustnessGate}
                            isCreating={isCreatingResearchRobustnessGate}
                            error={researchRobustnessGateError}
                            onCreate={createResearchRobustnessGate}
                          />
                          <ExecutionJournalPanel
                            analysis={runAnalysis}
                            journal={executionJournal}
                            isLoading={isExecutionJournalLoading}
                            isSaving={isSavingExecutionJournalEntry}
                            error={executionJournalError}
                            onCreate={createExecutionJournalEntry}
                            onUpdate={updateExecutionJournalEntry}
                            onDelete={deleteExecutionJournalEntry}
                          />
                          <BenchmarkRepeatabilityPanel
                            analysis={runAnalysis}
                            check={benchmarkCheck}
                            isStarting={isStartingBenchmarkRepeat}
                            onStartRepeat={startBenchmarkRepeat}
                          />
                        </div>
                      }
                      metrics={<BacktestMetricsDataPanel metrics={execution?.metrics ?? null} equityCurve={chartData?.equityCurve ?? execution?.equityCurve ?? []} candles={chartData?.candles ?? []} orders={execution?.orders ?? []} />}
                      logs={<BacktestLogsPanel logs={execution?.logs ?? []} />}
                    />

                    <StrategyLabAdvancedPanel
                      paperTab={
                        <div className="grid gap-4">
                          {hasPaperRuntimeContext && (
                            <PaperRuntimeDetailPanel
                              detail={paperSessionDetail}
                              runResult={paperSessionRunLocalResult}
                              errorMessage={paperSessionDetailError ?? paperSessionRunLocalError}
                            />
                          )}
                          <StrategyLabPaperToolsPanel
                            currentVersion={currentVersion}
                            isDraftDirty={isDraftDirty}
                            isConfigDirty={isConfigDirty}
                            paperDraftBot={paperDraftBot}
                            credentialBoundaryStatus={credentialBoundary.status}
                            credentialBoundaryChecks={draftCredentialBoundaryChecks}
                            onCredentialBoundaryChecksChange={setDraftCredentialBoundaryChecks}
                            onSavePaperDraft={() => void savePaperDraft()}
                            isSavingPaperDraft={isSavingPaperDraft}
                            paperSessionContent={
                              <PaperSessionPanel
                                preview={paperSessionPreview}
                                setupReason={paperSessionPreviewSetupReason}
                                isLoading={isPaperSessionPreviewLoading}
                                errorMessage={paperSessionPreviewError}
                                paperSessionDetailInput={paperSessionDetailInput}
                                paperSessionDetail={paperSessionDetail}
                                paperSessionDetailError={paperSessionDetailError}
                                isPaperSessionDetailLoading={isPaperSessionDetailLoading}
                                paperSessionObservability={paperSessionObservability}
                                paperSessionObservabilityError={paperSessionObservabilityError}
                                isPaperSessionObservabilityLoading={isPaperSessionObservabilityLoading}
                                paperKillSwitchStatus={paperKillSwitchStatus}
                                paperKillSwitchStatusError={paperKillSwitchStatusError}
                                isPaperKillSwitchStatusLoading={isPaperKillSwitchStatusLoading}
                                paperSchedulerStatus={paperSchedulerStatus}
                                paperSchedulerStatusError={paperSchedulerStatusError}
                                isPaperSchedulerStatusLoading={isPaperSchedulerStatusLoading}
                                startResult={paperSessionStartResult}
                                startError={paperSessionStartError}
                                isStarting={isStartingPaperSession}
                                canStart={canStartPaperSession}
                                startDisabledReason={paperSessionStartDisabledReason}
                                runLocalResult={paperSessionRunLocalResult}
                                runLocalError={paperSessionRunLocalError}
                                isRunningLocal={isRunningPaperSessionLocal}
                                canRunLocal={canRunPaperSessionLocal}
                                runLocalDisabledReason={paperSessionRunLocalDisabledReason}
                                cancelLocalResult={paperSessionCancelLocalResult}
                                cancelLocalError={paperSessionCancelLocalError}
                                isCancellingLocal={isCancellingPaperSessionLocal}
                                canCancelLocal={canCancelPaperSessionLocal}
                                cancelLocalDisabledReason={paperSessionCancelLocalDisabledReason}
                                retryLocalResult={paperSessionRetryLocalResult}
                                retryLocalError={paperSessionRetryLocalError}
                                isRetryingLocal={isRetryingPaperSessionLocal}
                                canRetryLocal={canRetryPaperSessionLocal}
                                retryLocalDisabledReason={paperSessionRetryLocalDisabledReason}
                                paperSessionResumeReadiness={paperSessionResumeReadiness}
                                paperSessionResumeReadinessError={paperSessionResumeReadinessError}
                                isPaperSessionResumeReadinessLoading={isPaperSessionResumeReadinessLoading}
                                resumeLocalResult={paperSessionResumeLocalResult}
                                resumeLocalError={paperSessionResumeLocalError}
                                isResumingLocal={isResumingPaperSessionLocal}
                                canResumeLocal={canResumePaperSessionLocal}
                                resumeLocalDisabledReason={paperSessionResumeLocalDisabledReason}
                                onPaperSessionDetailInputChange={setPaperSessionDetailInput}
                                onLoadPaperSessionDetail={() => void loadPaperSessionDetail()}
                                onRefreshPaperSessions={() => void refreshPaperSessionObservability()}
                                onLoadPaperSessionDetailFromSummary={(sessionId) => void loadPaperSessionDetailFromSummary(sessionId)}
                                onRefreshPaperSchedulerStatus={() => void refreshPaperSchedulerStatus()}
                                onRefresh={() => void refreshPaperSessionPreview()}
                                onStartPaperSession={() => void startPaperSessionFromPreview()}
                                onRunLocalPaperSession={() => void runPaperSessionLocal()}
                                onCancelLocalPaperSession={() => void cancelPaperSessionLocal()}
                                onResumeLocalPaperSession={() => void resumePaperSessionLocal()}
                                onRetryLocalPaperSession={() => void retryPaperSessionLocal()}
                              />
                            }
                          />
                        </div>
                      }
                      assistedTestnetTab={
                        <div className="grid gap-4">
                          {hasTestnetOrderContext && (
                            <AssistedTestnetOrderDetailPanel
                              detail={testnetOrderDetail}
                              preview={testnetOrderPreview}
                              errorMessage={testnetOrderDetailError}
                              isLoading={isTestnetOrderDetailLoading}
                              canProjectToJournal={canProjectTestnetOrderToJournal}
                              isProjectingToJournal={isProjectingTestnetOrderToJournal}
                              projectionResult={testnetOrderJournalProjectionResult}
                              projectionError={testnetOrderJournalProjectionError}
                              onProjectToJournal={() => void projectTestnetOrderToJournal()}
                            />
                          )}
                          <AssistedTestnetPanel
                            side={testnetOrderSide}
                            sizeMode={testnetOrderSizeMode}
                            amount={testnetOrderAmount}
                            credentialRefId={testnetCredentialRefId}
                            symbol={draftRuntimeConfig.symbol}
                            preview={testnetOrderPreview}
                            previewError={testnetOrderPreviewError}
                            sourceReady={runAnalysis?.run.status === "completed"}
                            sourceReadyLabel={runAnalysis?.run.status === "completed" ? "Completed source" : "Completed-run required"}
                            previewDisabledReason={testnetOrderPreviewDisabledReason}
                            selectedIntent={testnetOrderDetail?.intent ?? null}
                            canConfirmSubmit={canConfirmSubmitTestnetOrder}
                            canCancel={canCancelTestnetOrder}
                            canReconcile={canReconcileTestnetOrder}
                            submitResult={testnetOrderSubmitResult}
                            submitError={testnetOrderSubmitError}
                            cancelResult={testnetOrderCancelResult}
                            cancelError={testnetOrderCancelError}
                            reconcileResult={testnetOrderReconcileResult}
                            reconcileError={testnetOrderReconcileError}
                            isSubmitting={isSubmittingTestnetOrder}
                            isCancelling={isCancellingTestnetOrder}
                            isReconciling={isReconcilingTestnetOrder}
                            list={testnetOrderList}
                            listError={testnetOrderListError}
                            isPreviewLoading={isTestnetOrderPreviewLoading}
                            isListLoading={isTestnetOrderListLoading}
                            onSideChange={setTestnetOrderSide}
                            onSizeModeChange={setTestnetOrderSizeMode}
                            onAmountChange={setTestnetOrderAmount}
                            onCredentialRefIdChange={setTestnetCredentialRefId}
                            onPreview={() => void previewTestnetOrder()}
                            onConfirmSubmit={() => void confirmSubmitTestnetOrder()}
                            onCancelOrder={() => void cancelTestnetOrder()}
                            onReconcile={() => void reconcileTestnetOrder()}
                            onRefreshList={() => void refreshTestnetOrders()}
                            onLoadDetail={(orderId) => void loadTestnetOrderDetail(orderId)}
                          />
                        </div>
                      }
                      assistedLiveTab={
                        <div className="grid gap-4">
                          {hasLiveOrderContext && (
                            <AssistedLiveOrderDetailPanel
                              detail={liveOrderDetail}
                              preview={liveOrderPreview}
                              errorMessage={liveOrderDetailError}
                              isLoading={isLiveOrderDetailLoading}
                              canProjectToJournal={canProjectLiveOrderToJournal}
                              isProjectingToJournal={isProjectingLiveOrderToJournal}
                              projectionResult={liveOrderJournalProjectionResult}
                              projectionError={liveOrderJournalProjectionError}
                              onProjectToJournal={() => void projectLiveOrderToJournal()}
                            />
                          )}
                          <AssistedLivePanel
                            side={liveOrderSide}
                            sizeMode={liveOrderSizeMode}
                            amount={liveOrderAmount}
                            credentialRefId={liveOrderCredentialRefId}
                            symbol={draftRuntimeConfig.symbol}
                            preview={liveOrderPreview}
                            previewError={liveOrderPreviewError}
                            list={liveOrderList}
                            listError={liveOrderListError}
                            sourceReady={runAnalysis?.run.status === "completed"}
                            sourceReadyLabel={runAnalysis?.run.status === "completed" ? "Completed source" : "Completed-run required"}
                            previewDisabledReason={liveOrderPreviewDisabledReason}
                            selectedIntent={liveOrderDetail?.intent ?? null}
                            canConfirmSubmit={canConfirmSubmitLiveOrder}
                            canCancel={canCancelLiveOrder}
                            canReconcile={canReconcileLiveOrder}
                            submitResult={liveOrderSubmitResult}
                            submitError={liveOrderSubmitError}
                            cancelResult={liveOrderCancelResult}
                            cancelError={liveOrderCancelError}
                            reconcileResult={liveOrderReconcileResult}
                            reconcileError={liveOrderReconcileError}
                            isPreviewLoading={isLiveOrderPreviewLoading}
                            isListLoading={isLiveOrderListLoading}
                            isSubmitting={isSubmittingLiveOrder}
                            isCancelling={isCancellingLiveOrder}
                            isReconciling={isReconcilingLiveOrder}
                            onSideChange={setLiveOrderSide}
                            onSizeModeChange={setLiveOrderSizeMode}
                            onAmountChange={setLiveOrderAmount}
                            onCredentialRefIdChange={setLiveOrderCredentialRefId}
                            onPreview={() => void previewLiveOrder()}
                            onConfirmSubmit={() => void confirmSubmitLiveOrder()}
                            onCancelOrder={() => void cancelLiveOrder()}
                            onReconcile={() => void reconcileLiveOrder()}
                            onRefreshList={() => void refreshLiveOrders()}
                            onLoadDetail={(orderId) => void loadLiveOrderDetail(orderId)}
                          />
                        </div>
                      }
                      dataOpsTab={dataOpsTab}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        )}
      </div>

      <PreflightDialog
        open={isPreflightOpen}
        preflight={preflightResult}
        payloadSummary={preflightPayloadSummary}
        readinessLevel={readinessLevel}
        readinessMessages={readinessMessages}
        isConfirming={isRunningBacktest}
        onConfirm={() => void confirmBacktest()}
        onCancel={cancelPreflight}
      />
      <CompareRunPickerDialog
        open={isComparePickerOpen}
        baseRun={runAnalysis?.run ?? selectedRun}
        candidates={compareCandidates}
        onSelectRun={(runId) => void chooseCompareRun(runId)}
        onOpenChange={(open) => {
          if (!open) {
            closeComparePicker()
          }
        }}
      />
    </div>
  )
}

type ResearchPhase = "unspecified" | "in-sample" | "validation" | "final OOS"

function ResearchContextPanel({
  researchPhase,
  trialNote,
  onResearchPhaseChange,
  onTrialNoteChange,
}: {
  researchPhase: ResearchPhase
  trialNote: string
  onResearchPhaseChange: (value: ResearchPhase) => void
  onTrialNoteChange: (value: string) => void
}) {
  return (
    <section aria-label="Research context" className="grid gap-3 rounded-xl border border-platform-border bg-platform-surface p-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-platform-muted">Research context</p>
        <p className="mt-1 text-xs text-platform-muted">Record hypothesis, range, and reason before judging this run.</p>
      </div>
      <label className="grid gap-1 text-sm">
        <span className="text-xs font-medium text-platform-muted">Research phase</span>
        <select
          value={researchPhase}
          onChange={(event) => onResearchPhaseChange(event.target.value as ResearchPhase)}
          className="rounded-md border border-platform-border bg-platform-surface px-3 py-2"
        >
          <option value="unspecified">unspecified</option>
          <option value="in-sample">in-sample</option>
          <option value="validation">validation</option>
          <option value="final OOS">final OOS</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-xs font-medium text-platform-muted">Trial note</span>
        <textarea
          value={trialNote}
          onChange={(event) => onTrialNoteChange(event.target.value)}
          className="min-h-20 rounded-md border border-platform-border bg-platform-surface px-3 py-2"
        />
      </label>
    </section>
  )
}

function CenteredState({
  icon: Icon,
  title,
  description,
  tone = "default",
}: {
  icon: typeof Bot
  title: string
  description: string
  tone?: "default" | "danger"
}) {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <Card className="w-full max-w-xl border-slate-200 bg-white shadow-sm">
        <CardContent className="grid gap-4 p-8 text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-full bg-slate-100 text-slate-700">
            <Icon className="size-6" aria-hidden="true" />
          </div>
          <div className="grid gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
            <p className="text-sm leading-6 text-slate-600">{description}</p>
          </div>
          {tone === "danger" ? (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertTitle>Action required</AlertTitle>
              <AlertDescription>Check the backend service and database connection.</AlertDescription>
            </Alert>
          ) : null}
        </CardContent>
      </Card>
    </div>
  )
}
