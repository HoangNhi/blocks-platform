/* eslint-disable @typescript-eslint/no-explicit-any */
// @vitest-environment jsdom

import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  useTradeLabWorkspace: vi.fn(),
}))

vi.mock("../api/tradelab-hooks", () => ({
  useTradeLabWorkspace: mocks.useTradeLabWorkspace,
}))

vi.mock("../components/strategy-group-list", () => ({
  StrategyGroupList: ({ groups, selectedGroupId, onSelectGroup }: any) => (
    <div data-testid="strategy-group-list">
      <div>group-count:{groups.length}</div>
      <div>selected-group:{selectedGroupId ?? "none"}</div>
      <button type="button" onClick={() => onSelectGroup(groups[0]?.id)}>
        Select group
      </button>
    </div>
  ),
}))

vi.mock("../components/strategy-list", () => ({
  StrategyList: ({ strategies, selectedStrategyId, onSelectStrategy }: any) => (
    <div data-testid="strategy-list">
      <div>strategy-count:{strategies.length}</div>
      <div>selected-strategy:{selectedStrategyId ?? "none"}</div>
      <button type="button" onClick={() => onSelectStrategy(strategies[0]?.id)}>
        Select strategy
      </button>
    </div>
  ),
}))

vi.mock("../components/strategy-code-editor", () => ({
  StrategyCodeEditor: ({ sourceCode, validationCheck, isDraftDirty, runDisabledReason, onCheckSyntax, onRunBacktest, onCreateVersion }: any) => (
    <div data-testid="strategy-code-editor">
      <div>source:{sourceCode}</div>
      <div>draft-dirty:{String(isDraftDirty)}</div>
      <div>validation:{validationCheck?.validationStatus ?? "none"}</div>
      <div>run-disabled:{runDisabledReason ?? "none"}</div>
      <button type="button" onClick={onCheckSyntax}>
        Check syntax
      </button>
      <button type="button" onClick={onCreateVersion}>
        Create version
      </button>
      <button type="button" onClick={onRunBacktest}>
        Run backtest
      </button>
    </div>
  ),
}))

vi.mock("../components/runtime-config-panel", () => ({
  RuntimeConfigPanel: ({ value }: any) => <div data-testid="runtime-config-panel">{value.symbol}</div>,
}))

vi.mock("../components/risk-guard-panel", () => ({
  RiskGuardPanel: ({ value }: any) => <div data-testid="risk-guard-panel">{value.maxOrderPercent}</div>,
}))

vi.mock("../components/version-run-panel", () => ({
  VersionRunPanel: ({
    currentVersion,
    runVersion,
    isDraftDirty,
    isConfigDirty,
    runDisabledReason,
    onRunBacktest,
    onCreateVersion,
    onSaveSettings,
    isRunning,
  }: any) => (
    <div data-testid="version-run-panel">
      <div>version:{currentVersion.versionNumber}</div>
      <div>run-version:{runVersion?.versionNumber ?? "none"}</div>
      <div>draft-dirty:{String(isDraftDirty)}</div>
      <div>config-dirty:{String(isConfigDirty)}</div>
      <div>run-disabled:{runDisabledReason ?? "none"}</div>
      <div>running:{String(isRunning)}</div>
      <button type="button" onClick={onSaveSettings}>
        Save settings
      </button>
      <button type="button" onClick={onCreateVersion}>
        Create version
      </button>
      <button type="button" onClick={onRunBacktest}>
        Run backtest
      </button>
    </div>
  ),
}))

vi.mock("../components/strategy-lab-paper-tools-panel", () => ({
  StrategyLabPaperToolsPanel: ({ credentialBoundaryStatus, paperSessionContent }: any) => (
    <div data-testid="strategy-lab-paper-tools-panel">
      <div>credential:{credentialBoundaryStatus}</div>
      {paperSessionContent}
    </div>
  ),
}))

vi.mock("../components/strategy-lab-evaluate-panel", () => ({
  StrategyLabEvaluatePanel: ({ runSummary, scorecard, chart, tradeBreakdown, tradeDetail, equity, metrics, logs }: any) => (
    <div data-testid="strategy-lab-evaluate-panel">
      {runSummary}
      {scorecard}
      {chart}
      {tradeBreakdown}
      {tradeDetail}
      {equity}
      {metrics}
      {logs}
    </div>
  ),
}))

vi.mock("../components/strategy-lab-advanced-panel", () => ({
  StrategyLabAdvancedPanel: ({ paperTab, assistedTestnetTab, assistedLiveTab, dataOpsTab }: any) => (
    <div data-testid="strategy-lab-advanced-panel">
      <div data-testid="advanced-paper">{paperTab}</div>
      <div data-testid="advanced-testnet">{assistedTestnetTab}</div>
      <div data-testid="advanced-live">{assistedLiveTab}</div>
      <div data-testid="advanced-data-ops">{dataOpsTab}</div>
    </div>
  ),
}))


vi.mock("../components/paper-session-panel", () => ({
  PaperSessionPanel: ({
    preview,
    setupReason,
    isLoading,
    errorMessage,
    paperSessionDetailInput,
    paperSessionDetail,
    paperSessionDetailError,
    isPaperSessionDetailLoading,
    paperKillSwitchStatus,
    paperKillSwitchStatusError,
    isPaperKillSwitchStatusLoading,
    runLocalResult,
    runLocalError,
    isRunningLocal,
    canRunLocal,
    runLocalDisabledReason,
    onRefresh,
    onPaperSessionDetailInputChange,
    onLoadPaperSessionDetail,
    onRunLocalPaperSession,
  }: any) => (
    <div data-testid="paper-session-panel">
      <div>paper-preview:{preview?.reasonCode ?? "none"}</div>
      <div>setup:{setupReason?.code ?? "none"}</div>
      <div>loading:{String(isLoading)}</div>
      <div>error:{errorMessage ?? "none"}</div>
      <div>detail-input:{paperSessionDetailInput ?? "none"}</div>
      <div>detail:{paperSessionDetail?.session?.sessionId ?? "none"}</div>
      <div>detail-error:{paperSessionDetailError ?? "none"}</div>
      <div>detail-loading:{String(isPaperSessionDetailLoading)}</div>
      <div>kill-switch:{paperKillSwitchStatus?.reasonCode ?? "none"}</div>
      <div>kill-switch-error:{paperKillSwitchStatusError ?? "none"}</div>
      <div>kill-switch-loading:{String(isPaperKillSwitchStatusLoading)}</div>
      <div>run-local:{runLocalResult?.reasonCode ?? "none"}</div>
      <div>run-local-error:{runLocalError ?? "none"}</div>
      <div>run-local-loading:{String(isRunningLocal)}</div>
      <div>can-run-local:{String(canRunLocal)}</div>
      <div>run-local-disabled:{runLocalDisabledReason ?? "none"}</div>
      <button type="button" onClick={onRefresh}>
        Refresh paper session
      </button>
      <button type="button" onClick={() => onPaperSessionDetailInputChange?.("paper-session-1")}>
        Set paper session detail id
      </button>
      <button type="button" onClick={onLoadPaperSessionDetail}>
        Load paper session detail
      </button>
      <button type="button" onClick={onRunLocalPaperSession}>
        Run local paper session
      </button>
    </div>
  ),
}))

vi.mock("../components/paper-runtime-detail-panel", () => ({
  PaperRuntimeDetailPanel: ({ detail, runResult, errorMessage }: any) => (
    <div data-testid="paper-runtime-detail-panel">
      <div>runtime-detail:{detail?.session?.sessionId ?? "none"}</div>
      <div>runtime-result:{runResult?.reasonCode ?? "none"}</div>
      <div>runtime-error:{errorMessage ?? "none"}</div>
    </div>
  ),
}))

vi.mock("../components/assisted-testnet-panel", () => ({
  AssistedTestnetPanel: ({
    preview,
    previewError,
    list,
    sourceReadyLabel,
    canConfirmSubmit,
    onCancelOrder,
    canReconcile,
    onPreview,
    onConfirmSubmit,
    onRefreshList,
    onLoadDetail,
    onReconcile,
  }: any) => (
    <div data-testid="assisted-testnet-panel">
      <div>testnet-preview:{preview?.reasonCode ?? "none"}</div>
      <div>testnet-error:{previewError ?? "none"}</div>
      <div>testnet-list:{list?.items?.length ?? 0}</div>
      <div>{sourceReadyLabel}</div>
      <div>can-submit:{String(canConfirmSubmit)}</div>
      <div>can-reconcile:{String(canReconcile)}</div>
      <button type="button" onClick={onPreview}>
        Preview testnet order
      </button>
      <button type="button" onClick={onConfirmSubmit}>
        Confirm submit
      </button>
      <button type="button" onClick={onCancelOrder}>
        Cancel testnet
      </button>
      <button type="button" onClick={onReconcile}>
        Reconcile
      </button>
      <button type="button" onClick={onRefreshList}>
        Refresh testnet previews
      </button>
      <button type="button" onClick={() => onLoadDetail?.("intent-1")}>
        Load testnet detail
      </button>
    </div>
  ),
}))

vi.mock("../components/assisted-testnet-order-detail-panel", () => ({
  AssistedTestnetOrderDetailPanel: ({ detail, preview, errorMessage }: any) => (
    <div data-testid="assisted-testnet-order-detail-panel">
      <div>testnet-detail:{detail?.intent?.intentId ?? "none"}</div>
      <div>testnet-detail-preview:{preview?.clientOrderId ?? "none"}</div>
      <div>testnet-detail-error:{errorMessage ?? "none"}</div>
    </div>
  ),
}))

vi.mock("../components/dataset-readiness-panel", () => ({
  DatasetReadinessPanel: ({ preflight, pipeline, runtimeConfig, runtimeErrorMessage, onQueueBackgroundFill }: any) => (
    <div data-testid="dataset-readiness-panel">
      <div>dataset:{preflight?.datasetKey ?? "none"}</div>
      <div>pipeline:{pipeline?.status ?? "none"}</div>
      <div>symbol:{runtimeConfig.symbol ?? "none"}</div>
      <div>runtime-error:{runtimeErrorMessage ?? "none"}</div>
      <button type="button" onClick={onQueueBackgroundFill}>
        Queue background fill
      </button>
    </div>
  ),
}))

vi.mock("../components/job-visibility-panel", () => ({
  JobVisibilityPanel: ({ visibility, isLoading, errorMessage, onRefresh }: any) => (
    <div data-testid="job-visibility-panel">
      <div>active:{visibility?.active?.length ?? 0}</div>
      <div>recent:{visibility?.recent?.length ?? 0}</div>
      <div>loading:{String(isLoading)}</div>
      <div>error:{errorMessage ?? "none"}</div>
      <button type="button" onClick={onRefresh}>
        Refresh jobs
      </button>
    </div>
  ),
}))

vi.mock("../components/background-fill-jobs-panel", () => ({
  BackgroundFillJobsPanel: ({ visibility, isLoading, errorMessage, onRefresh }: any) => (
    <div data-testid="background-fill-jobs-panel">
      <div>background-fill:{visibility?.datasetKey ?? "none"}</div>
      <div>loading:{String(isLoading)}</div>
      <div>error:{errorMessage ?? "none"}</div>
      <button type="button" onClick={onRefresh}>
        Refresh background fill jobs
      </button>
    </div>
  ),
}))

vi.mock("../components/scheduler-status-panel", () => ({
  SchedulerStatusPanel: ({ status, isLoading, errorMessage, onRefresh }: any) => (
    <div data-testid="scheduler-status-panel">
      <div>scheduler:{status?.lastTickStatus ?? "none"}</div>
      <div>loading:{String(isLoading)}</div>
      <div>error:{errorMessage ?? "none"}</div>
      <button type="button" onClick={onRefresh}>
        Refresh scheduler status
      </button>
    </div>
  ),
}))

vi.mock("../components/local-fill-audit-panel", () => ({
  LocalFillAuditPanel: ({ audit, isLoading, errorMessage, onRefresh }: any) => (
    <div data-testid="local-fill-audit-panel">
      <div>Local fill audit</div>
      <div>items:{audit?.items?.length ?? 0}</div>
      <div>loading:{String(isLoading)}</div>
      <div>error:{errorMessage ?? "none"}</div>
      <button type="button" onClick={onRefresh}>
        Refresh local fill audit
      </button>
    </div>
  ),
}))

vi.mock("../components/manual-signal-handoff-panel", () => ({
  ManualSignalHandoffPanel: ({ packageResult, error, onCreate }: any) => (
    <button type="button" onClick={onCreate}>
      signal-handoff:{packageResult?.sourceRunId ?? "none"}:{error ?? "no-error"}
    </button>
  ),
}))

vi.mock("../components/research-robustness-gate-panel", () => ({
  ResearchRobustnessGatePanel: ({ gate, error, onCreate }: any) => (
    <button type="button" onClick={onCreate}>
      robustness-gate:{gate?.sourceRunId ?? "none"}:{error ?? "no-error"}
    </button>
  ),
}))

vi.mock("../components/execution-journal-panel", () => ({
  ExecutionJournalPanel: ({ analysis, journal, error, onCreate }: any) => (
    <button
      type="button"
      onClick={() =>
        onCreate?.(analysis?.run?.id ?? "none", {
          confirmManualEntryOnly: true,
          source: "strategy_lab",
          side: "long",
          plannedSnapshot: {},
          disciplineStatus: "not_recorded",
          fills: [{ fillRole: "entry", side: "buy", price: 100, quantity: 1 }],
        })
      }
    >
      execution-journal:{analysis?.run?.id ?? "none"}:{journal?.items?.length ?? 0}:{error ?? "no-error"}
    </button>
  ),
}))

vi.mock("../components/backtest-chart-panel", () => ({
  BacktestChartPanel: ({ candles, selectedTrade, focusTrade }: any) => (
    <div data-testid="backtest-chart-panel">
      candles:{candles.length} selected-trade:{selectedTrade ? selectedTrade.marker.id : "none"} focus-trade:
      {focusTrade ? focusTrade.id : "none"}
    </div>
  ),
}))

vi.mock("../components/trade-breakdown-table", () => ({
  TradeBreakdownTable: ({ trades, selectedTradeId, onSelectTrade }: any) => (
    <div data-testid="trade-breakdown-table">
      <div>trades:{trades.length}</div>
      <div>selected-trade:{selectedTradeId ?? "none"}</div>
      <button type="button" onClick={() => onSelectTrade(trades[0]?.id)}>
        Select analyzed trade
      </button>
    </div>
  ),
}))

vi.mock("../components/equity-drawdown-panel", () => ({
  EquityDrawdownPanel: ({ equityCurve }: any) => (
    <div data-testid="equity-drawdown-panel">equity:{equityCurve.length}</div>
  ),
}))

vi.mock("../components/backtest-logs-panel", () => ({
  BacktestLogsPanel: ({ logs }: any) => <div data-testid="backtest-logs-panel">logs:{logs.length}</div>,
}))

vi.mock("../components/backtest-metrics-data-panel", () => ({
  BacktestMetricsDataPanel: ({ metrics, candles }: any) => (
    <div data-testid="backtest-metrics-data-panel">
      metrics:{metrics ? metrics.closedTrades : "none"} candles:{candles.length}
    </div>
  ),
}))

vi.mock("../components/run-history-list", () => ({
  RunHistoryList: ({ runs, selectedRunId, onOpenRun, onCompareSelectedRun, onRefresh }: any) => (
    <div data-testid="run-history-list">
      <div>runs:{runs.length}</div>
      <div>selected-run:{selectedRunId ?? "none"}</div>
      {onCompareSelectedRun && selectedRunId ? (
        <button type="button" onClick={() => onCompareSelectedRun(selectedRunId)}>
          Compare selected run
        </button>
      ) : null}
      <button type="button" onClick={onRefresh}>
        Refresh history
      </button>
      {runs.map((run: any) => (
        <button key={run.id} type="button" onClick={() => onOpenRun(run.id)}>
          Open {run.id}
        </button>
      ))}
    </div>
  ),
}))

vi.mock("../components/selected-trade-execution-panel", () => ({
  SelectedTradeExecutionPanel: ({ detail }: any) => (
    <div data-testid="selected-trade-execution-panel">{detail ? detail.trade.id : "none"}</div>
  ),
}))

vi.mock("../components/compare-mode-shell", () => ({
  CompareModeShell: ({ compareMode, onExit }: any) => (
    <div data-testid="compare-mode-shell">
      <div>
        {compareMode.baseRunId}|{compareMode.compareRunId}|{compareMode.datasetMismatchWarning ?? "none"}
      </div>
      <button type="button" onClick={onExit}>
        Exit compare
      </button>
    </div>
  ),
}))

vi.mock("../components/compare-run-picker-dialog", () => ({
  CompareRunPickerDialog: ({ open, baseRun, candidates, onSelectRun, onOpenChange }: any) =>
    open ? (
      <div data-testid="compare-run-picker-dialog">
        <div>base:{baseRun?.id ?? "none"}</div>
        <div>candidates:{candidates.length}</div>
        <button type="button" onClick={() => onSelectRun(candidates[0]?.id)}>
          Select compare run
        </button>
        <button type="button" onClick={() => onOpenChange(false)}>
          Close
        </button>
      </div>
    ) : null,
}))

vi.mock("../components/run-pipeline-panel", () => ({
  RunPipelinePanel: ({ pipeline, preflight, runtimeErrorMessage, isPolling, onRefresh }: any) => (
    <div data-testid="run-pipeline-panel">
      <div>status:{pipeline?.status ?? "idle"}</div>
      <div>preflight:{preflight?.outcome ?? "none"}</div>
      <div>dataset:{preflight?.datasetKey ?? "none"}</div>
      <div>runtime-error:{runtimeErrorMessage ?? "none"}</div>
      <div>rows:{pipeline?.dataJob ? `${pipeline.dataJob.rowsImported} rows imported` : "none"}</div>
      <div>polling:{String(isPolling)}</div>
      <button type="button" onClick={onRefresh}>
        Refresh pipeline
      </button>
    </div>
  ),
}))

vi.mock("../components/trade-marker-detail-panel", () => ({
  TradeMarkerDetailPanel: ({ trade }: any) => (
    <div data-testid="trade-marker-detail-panel">{trade ? trade.marker.id : "no-trade"}</div>
  ),
}))

vi.mock("../components/preflight-dialog", () => ({
  PreflightDialog: ({ open, preflight, onConfirm, onCancel }: any) =>
    open ? (
      <div role="dialog" data-testid="preflight-dialog">
        <div>preflight:{preflight?.outcome ?? "none"}</div>
        <div>dataset:{preflight?.datasetKey ?? "none"}</div>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" disabled={preflight?.outcome === "blocked"} onClick={onConfirm}>
          Confirm
        </button>
      </div>
    ) : null,
}))

import { StrategyLabPage } from "./strategy-lab-page"

describe("StrategyLabPage", () => {
  beforeEach(() => {
    mocks.useTradeLabWorkspace.mockReset()
  })

  it("renders the ready run workbench and wires run, preflight, and history actions", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    const confirmBacktest = vi.fn()
    const reopenRun = vi.fn()
    const runBacktest = vi.fn()
    const refreshRunHistory = vi.fn()
    const refreshPipeline = vi.fn()
    const refreshJobVisibility = vi.fn()
    const refreshLocalFillAudit = vi.fn()
    const refreshFillJobVisibility = vi.fn()
    const refreshFillSchedulerStatus = vi.fn()
    const refreshPaperSessionPreview = vi.fn()
    const previewTestnetOrder = vi.fn()
    const confirmSubmitTestnetOrder = vi.fn()
    const cancelTestnetOrder = vi.fn()
    const reconcileTestnetOrder = vi.fn()
    const refreshTestnetOrders = vi.fn()
    const loadTestnetOrderDetail = vi.fn()
    const setPaperSessionDetailInput = vi.fn()
    const loadPaperSessionDetail = vi.fn()
    const runPaperSessionLocal = vi.fn()
    const saveStrategySettings = vi.fn()
    const createVersion = vi.fn()
    const selectGroup = vi.fn()
    const selectStrategy = vi.fn()
    const selectTrade = vi.fn()
    const openComparePicker = vi.fn()
    const startBenchmarkRepeat = vi.fn()
    const createManualSignalPackage = vi.fn()
    const createResearchRobustnessGate = vi.fn()
    const createExecutionJournalEntry = vi.fn()
    const updateExecutionJournalEntry = vi.fn()
    const deleteExecutionJournalEntry = vi.fn()

    mocks.useTradeLabWorkspace.mockReturnValue({
      groups: [
        {
          id: "group-1",
          name: "Momentum",
          slug: "momentum",
          description: "Momentum strategies",
          metadata: {},
          strategyCount: 1,
          activeStrategyCount: 1,
        },
      ],
      strategies: [
        {
          id: "strategy-1",
          strategyGroupId: "group-1",
          name: "Supertrend",
          slug: "supertrend",
          description: "Trend follower",
          status: "active",
          currentVersionId: "version-1",
          runtimeConfig: {
            exchange: "binance",
            symbol: "BTCUSDT",
            timeframe: "1h",
            startAt: "2026-01-01T00:00:00Z",
            endAt: "2026-01-02T00:00:00Z",
            initialEquity: 1000,
            feeBps: 0,
            slippageBps: 0,
          },
          riskConfig: {
            maxOrderPercent: 10,
            maxPositionPercent: 100,
            maxDrawdownPercent: 15,
            minNotional: 10,
            stepSize: 0.001,
            tickSize: 0.01,
          },
          versionCount: 1,
        },
      ],
      draftRuntimeConfig: {
        exchange: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        startAt: "2026-01-01T00:00:00Z",
        endAt: "2026-01-02T00:00:00Z",
        initialEquity: 1000,
        feeBps: 0,
        slippageBps: 0,
      },
      draftRiskConfig: {
        maxOrderPercent: 10,
        maxPositionPercent: 100,
        maxDrawdownPercent: 15,
        minNotional: 10,
        stepSize: 0.001,
        tickSize: 0.01,
      },
      draftSource: "print('ready')",
      validationCheck: null,
      actionMessage: "Preflight complete.",
      error: null,
      isLoading: false,
      isSavingSettings: false,
      isSavingVersion: false,
      isCheckingSyntax: false,
      isRunningBacktest: false,
      isPollingPipeline: true,
      isJobVisibilityLoading: false,
      isFillJobVisibilityLoading: false,
      selectedGroupId: "group-1",
      selectedStrategyId: "strategy-1",
      selectedStrategy: {
        id: "strategy-1",
        strategyGroupId: "group-1",
        name: "Supertrend",
        slug: "supertrend",
        description: "Trend follower",
        status: "active",
        currentVersionId: "version-1",
        runtimeConfig: {
          exchange: "binance",
          symbol: "BTCUSDT",
          timeframe: "1h",
          startAt: "2026-01-01T00:00:00Z",
          endAt: "2026-01-02T00:00:00Z",
          initialEquity: 1000,
          feeBps: 0,
          slippageBps: 0,
        },
        riskConfig: {
          maxOrderPercent: 10,
          maxPositionPercent: 100,
          maxDrawdownPercent: 15,
          minNotional: 10,
          stepSize: 0.001,
          tickSize: 0.01,
        },
        metadata: {},
        versions: [
          {
            id: "version-1",
            strategyId: "strategy-1",
            versionNumber: 1,
            validationStatus: "valid",
            validationMessage: null,
            sourceCode: "print('ready')",
            sourceHash: "hash-1",
            createdAt: "2026-01-01T00:00:00Z",
          },
        ],
        versionCount: 1,
      },
      currentVersion: {
        id: "version-1",
        strategyId: "strategy-1",
        versionNumber: 1,
        validationStatus: "valid",
        validationMessage: null,
        sourceCode: "print('ready')",
        sourceHash: "hash-1",
        createdAt: "2026-01-01T00:00:00Z",
      },
      isDraftDirty: false,
      isConfigDirty: false,
      runDisabledReason: null,
      runVersion: {
        id: "version-1",
        strategyId: "strategy-1",
        versionNumber: 1,
        validationStatus: "valid",
        validationMessage: null,
        sourceCode: "print('ready')",
        sourceHash: "hash-1",
        createdAt: "2026-01-01T00:00:00Z",
      },
      execution: null,
      chartData: {
        candles: [
          {
            openTime: "2026-01-01T00:00:00Z",
            closeTime: "2026-01-01T01:00:00Z",
            open: 100,
            high: 105,
            low: 99,
            close: 104,
            volume: 10,
          },
        ],
        markers: [],
        equityCurve: [],
        selectedTrade: null,
      },
      selectedTrade: null,
      runAnalysis: {
        run: {
          id: "run-1",
          botId: "bot-1",
          strategyId: "strategy-1",
          strategyVersionId: "version-1",
          runType: "backtest",
          status: "completed",
          pipelineStatus: "completed",
          exchange: "binance",
          symbol: "BTCUSDT",
          timeframe: "1h",
          startAt: "2026-01-01T00:00:00Z",
          endAt: "2026-01-02T00:00:00Z",
          startedAt: "2026-01-02T00:00:00Z",
          finishedAt: "2026-01-02T00:01:00Z",
          dataJobId: null,
          errorMessage: null,
          createdAt: "2026-01-02T00:00:00Z",
          createdBy: "codex",
          snapshot: null,
        },
        result: null,
        snapshot: {
          sourceSnapshot: { sourceCode: "print('ready')" },
          datasetContext: {},
          pipelineContext: {},
        },
        runtimeConfig: {
          exchange: "binance",
          symbol: "BTCUSDT",
          timeframe: "1h",
          startAt: "2026-01-01T00:00:00Z",
          endAt: "2026-01-02T00:00:00Z",
          initialEquity: 1000,
          feeBps: 0,
          slippageBps: 0,
        },
        riskConfig: {
          maxOrderPercent: 10,
          maxPositionPercent: 100,
          maxDrawdownPercent: 15,
          minNotional: 10,
          stepSize: 0.001,
          tickSize: 0.01,
        },
        datasetContext: {
          datasetKey: "binance:BTCUSDT:1h",
          exchange: "binance",
          symbol: "BTCUSDT",
          timeframe: "1h",
          requestedStartAt: "2026-01-01T00:00:00Z",
          requestedEndAt: "2026-01-02T00:00:00Z",
          sourceHash: "hash-1",
          strategyVersionId: "version-1",
          coverage: null,
        },
        tradeSummary: {
          totalTrades: 0,
          closedTrades: 0,
          openTrades: 0,
          winningTrades: 0,
          losingTrades: 0,
          breakEvenTrades: 0,
          realizedPnl: 0,
          averagePnl: 0,
          averagePnlPct: 0,
          averageDurationSeconds: 0,
          winRatePct: 0,
          profitFactor: 0,
        },
        trades: [],
      },
      benchmarkCheck: null,
      manualSignalPackage: { sourceRunId: "run-1" },
      manualSignalPackageError: null,
      isCreatingManualSignalPackage: false,
      researchRobustnessGate: { sourceRunId: "run-1" },
      researchRobustnessGateError: null,
      isCreatingResearchRobustnessGate: false,
      executionJournal: { items: [] },
      executionJournalError: null,
      isExecutionJournalLoading: false,
      isSavingExecutionJournalEntry: false,
      isStartingBenchmarkRepeat: false,
      selectedAnalyzedTrade: null,
      selectedTradeExecutionDetail: null,
      runHistory: [
        {
          id: "run-1",
          botId: "bot-1",
          strategyId: "strategy-1",
          strategyVersionId: "version-1",
          runType: "backtest",
          status: "completed",
          pipelineStatus: "completed",
          exchange: "binance",
          symbol: "BTCUSDT",
          timeframe: "1h",
          startAt: "2026-01-01T00:00:00Z",
          endAt: "2026-01-02T00:00:00Z",
          startedAt: "2026-01-02T00:00:00Z",
          finishedAt: "2026-01-02T00:01:00Z",
          dataJobId: null,
          errorMessage: null,
          createdAt: "2026-01-02T00:00:00Z",
          createdBy: "codex",
          snapshot: null,
        },
      ],
      compareCandidates: [],
      compareMode: null,
      isComparePickerOpen: false,
      activePipeline: {
        run: {
          id: "run-1",
          botId: "bot-1",
          strategyId: "strategy-1",
          strategyVersionId: "version-1",
          runType: "backtest",
          status: "running",
          pipelineStatus: "running",
          exchange: "binance",
          symbol: "BTCUSDT",
          timeframe: "1h",
          startAt: "2026-01-01T00:00:00Z",
          endAt: "2026-01-02T00:00:00Z",
          startedAt: "2026-01-02T00:00:00Z",
          finishedAt: null,
          dataJobId: "job-1",
          errorMessage: null,
          createdAt: "2026-01-02T00:00:00Z",
          createdBy: "codex",
          snapshot: null,
        },
        preflight: {
          datasetKey: "binance:BTCUSDT:1h",
          exchange: "binance",
          symbol: "BTCUSDT",
          timeframe: "1h",
          requestedStartAt: "2026-01-01T00:00:00Z",
          requestedEndAt: "2026-01-02T00:00:00Z",
          outcome: "ready",
          action: null,
          reasons: [],
          coverage: null,
          missingSegments: [],
          repairStartAt: null,
          repairEndAt: null,
          activeJobId: null,
          activeJobType: null,
          sourceBlocked: false,
        },
        dataJob: {
          id: "job-1",
          coverageId: "coverage-1",
          datasetKey: "binance:BTCUSDT:1h",
          jobType: "fill",
          exchange: "binance",
          symbol: "BTCUSDT",
          timeframe: "1h",
          requestedStartAt: "2026-01-01T00:00:00Z",
          requestedEndAt: "2026-01-02T00:00:00Z",
          appliedStartAt: "2026-01-01T00:00:00Z",
          appliedEndAt: "2026-01-02T00:00:00Z",
          claimedAt: null,
          startedAt: "2026-01-02T00:00:00Z",
          finishedAt: "2026-01-02T00:00:30Z",
          workerId: "worker-1",
          status: "completed",
          rowsImported: 42,
          errorMessage: null,
          metadata: {},
          createdAt: "2026-01-02T00:00:00Z",
          createdBy: "codex",
        },
        backtestJob: {},
        status: "running",
        message: "Data job active",
      },
      jobVisibility: {
        strategyId: "strategy-1",
        active: [],
        recent: [],
        staleThresholdMinutes: 10,
      },
      jobVisibilityError: null,
      fillJobVisibility: {
        datasetKey: "binance:BTCUSDT:1h",
        exchange: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        safetyStatus: "read_only",
        active: [],
        recent: [],
      },
      fillJobVisibilityError: null,
      fillSchedulerStatus: {
        enabled: true,
        running: false,
        workerId: "trade-lab-local-scheduler",
        intervalSeconds: 60,
        lastTickStartedAt: "2026-05-19T10:00:00Z",
        lastTickCompletedAt: "2026-05-19T10:01:00Z",
        lastTickStatus: "processed",
        lastSkipReason: null,
        lastReasonCode: null,
        lastJobId: "job-1",
        lastDatasetKey: "binance:BTCUSDT:1h",
        staleJobsMarked: 1,
        consecutiveFailureCount: 0,
        safetyStatus: "read_only_scheduler_visibility",
      },
      fillSchedulerStatusError: null,
      isFillSchedulerStatusLoading: false,
      paperSessionPreview: {
        mode: "paper",
        previewStatus: "allowed",
        allowed: true,
        reasonCode: "paper_preview_allowed",
        failedGates: [],
        warnings: [],
        details: {},
        safetyStatus: "preview_only",
        botContext: {
          botId: "paper-bot-1",
          mode: "paper",
          status: "draft",
          symbol: "BTCUSDT",
          timeframe: "1h",
        },
        strategyContext: {
          strategyId: "strategy-1",
          strategyVersionId: "version-1",
          sourceValid: true,
          versionLocked: true,
          dirty: false,
        },
        datasetContext: {
          datasetKey: "binance:BTCUSDT:1h",
          exchange: "binance",
          symbol: "BTCUSDT",
          timeframe: "1h",
          startAt: "2026-01-01T00:00:00Z",
          endAt: "2026-01-02T00:00:00Z",
          preflightOutcome: "ready",
        },
      },
      paperSessionPreviewError: null,
      paperSessionPreviewSetupReason: null,
      isPaperSessionPreviewLoading: false,
      paperSessionDetailInput: "paper-session-1",
      paperSessionDetail: {
        session: {
          sessionId: "paper-session-1",
          status: "completed",
        },
        artifacts: {
          portfolioSnapshots: [],
        },
      },
      paperSessionDetailError: null,
      isPaperSessionDetailLoading: false,
      paperKillSwitchStatus: {
        enabled: true,
        reasonCode: "paper_kill_switch_enabled",
        safetyStatus: "read_only_paper_kill_switch_status",
        source: "config",
        updatedAt: null,
        updatedBy: null,
        details: { environment: "local", localDevOnly: true },
      },
      paperKillSwitchStatusError: null,
      isPaperKillSwitchStatusLoading: false,
      paperSessionRunLocalResult: {
        status: "completed",
        reasonCode: "paper_engine_completed",
        sessionId: "paper-session-1",
        candlesProcessed: 3,
        ordersCreated: 0,
        fillsCreated: 0,
        snapshotsCreated: 3,
        safetyStatus: "local_dev_paper_engine_tick",
        details: {},
      },
      paperSessionRunLocalError: null,
      isRunningPaperSessionLocal: false,
      canRunPaperSessionLocal: true,
      paperSessionRunLocalDisabledReason: null,
      testnetOrderSide: "buy",
      testnetOrderSizeMode: "quote",
      testnetOrderAmount: "25",
      testnetCredentialRefId: "credential-ref-1",
      testnetOrderPreview: {
        status: "allowed",
        allowed: true,
        reasonCode: "preview_allowed",
        safetyStatus: "assisted_testnet_order_preview_only",
        intentId: "intent-1",
        previewId: "preview-1",
        clientOrderId: "client-order-1",
        expiresAt: null,
        order: null,
        sourceContext: null,
        credentialSnapshot: {},
        riskSnapshot: {},
        auditEventIds: [],
        details: {},
      },
      testnetOrderPreviewError: null,
      testnetOrderSubmitResult: null,
      testnetOrderSubmitError: null,
      testnetOrderCancelResult: null,
      testnetOrderCancelError: null,
      testnetOrderReconcileResult: null,
      testnetOrderReconcileError: null,
      testnetOrderDetail: {
        safetyStatus: "assisted_testnet_order_read_only",
        intent: { intentId: "intent-1", status: "submitted", clientOrderId: "client-order-1" },
        latestPreview: null,
        previews: [],
        events: [],
        reconciliationAttempts: [],
      },
      testnetOrderDetailError: null,
      testnetOrderList: { safetyStatus: "assisted_testnet_order_list_read_only", items: [] },
      testnetOrderListError: null,
      isTestnetOrderPreviewLoading: false,
      isTestnetOrderDetailLoading: false,
      isTestnetOrderListLoading: false,
      isSubmittingTestnetOrder: false,
      isCancellingTestnetOrder: false,
      isReconcilingTestnetOrder: false,
      canPreviewTestnetOrder: true,
      testnetOrderPreviewDisabledReason: null,
      canConfirmSubmitTestnetOrder: true,
      canCancelTestnetOrder: true,
      canReconcileTestnetOrder: true,
      localFillAudit: {
        datasetKey: "binance:BTCUSDT:1h",
        exchange: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        safetyStatus: "read_only",
        items: [],
      },
      localFillAuditError: null,
      isLocalFillAuditLoading: false,
      preflightResult: {
        datasetKey: "binance:BTCUSDT:1h",
        exchange: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        requestedStartAt: "2026-01-01T00:00:00Z",
        requestedEndAt: "2026-01-02T00:00:00Z",
        outcome: "ready",
        action: null,
        reasons: [],
        coverage: null,
        missingSegments: [],
        repairStartAt: null,
        repairEndAt: null,
        activeJobId: null,
        activeJobType: null,
        sourceBlocked: false,
      },
      isPreflightOpen: true,
      pendingBacktestRequest: null,
      bots: [],
      credentialBoundary: {
        exchange: "binance",
        status: "missing",
        checks: {
          readOnlyEnabled: false,
          tradingDisabled: false,
          withdrawDisabled: false,
          futuresMarginDisabled: false,
          ipRestricted: false,
        },
        updatedAt: null,
      },
      draftCredentialBoundaryChecks: {
        readOnlyEnabled: false,
        tradingDisabled: false,
        withdrawDisabled: false,
        futuresMarginDisabled: false,
        ipRestricted: false,
      },
      setDraftRuntimeConfig: vi.fn(),
      setDraftRiskConfig: vi.fn(),
      setDraftCredentialBoundaryChecks: vi.fn(),
      setDraftSource: vi.fn(),
      checkSyntax: vi.fn(),
      selectGroup,
      selectStrategy,
      saveStrategySettings,
      createVersion,
      runBacktest,
      confirmBacktest,
      cancelPreflight: vi.fn(),
      reopenRun,
      selectTrade,
      selectAnalyzedTrade: vi.fn(),
      openComparePicker,
      closeComparePicker: vi.fn(),
      chooseCompareRun: vi.fn(),
      exitCompareMode: vi.fn(),
      refreshRunHistory,
      refreshJobVisibility,
      refreshLocalFillAudit,
      refreshFillJobVisibility,
      refreshFillSchedulerStatus,
      refreshPaperSessionPreview,
      setTestnetOrderSide: vi.fn(),
      setTestnetOrderSizeMode: vi.fn(),
      setTestnetOrderAmount: vi.fn(),
      setTestnetCredentialRefId: vi.fn(),
      previewTestnetOrder,
      confirmSubmitTestnetOrder,
      cancelTestnetOrder,
      reconcileTestnetOrder,
      loadTestnetOrderDetail,
      refreshTestnetOrders,
      setPaperSessionDetailInput,
      loadPaperSessionDetail,
      runPaperSessionLocal,
      refreshPipeline,
      startBenchmarkRepeat,
      createManualSignalPackage,
      createResearchRobustnessGate,
      createExecutionJournalEntry,
      updateExecutionJournalEntry,
      deleteExecutionJournalEntry,
    })

    const user = userEvent.setup()

    render(<StrategyLabPage />)

    expect(screen.getByText("Strategy Lab")).toBeTruthy()
    expect(screen.getByText("Supertrend")).toBeTruthy()
    expect(screen.getByText("credential:missing")).toBeTruthy()
    expect(screen.getByTestId("dataset-readiness-panel").textContent).toContain("dataset:binance:BTCUSDT:1h")
    expect(screen.getByTestId("dataset-readiness-panel").textContent).toContain("pipeline:running")
    expect(screen.getByTestId("dataset-readiness-panel").textContent).toContain("symbol:BTCUSDT")
    expect(screen.getByText("Local fill audit")).toBeTruthy()
    expect(screen.getByTestId("dataset-readiness-panel").textContent).toContain("runtime-error:none")
    expect(screen.getByTestId("run-pipeline-panel").textContent).toContain("status:running")
    expect(screen.getByTestId("run-pipeline-panel").textContent).toContain("polling:true")
    expect(screen.getByTestId("run-pipeline-panel").textContent).toContain("runtime-error:none")
    expect(screen.getByTestId("paper-session-panel").textContent).toContain("paper-preview:paper_preview_allowed")
    const testnetPanel = screen.getByTestId("assisted-testnet-panel")
    expect(testnetPanel.textContent).toContain("testnet-preview:preview_allowed")
    expect(within(testnetPanel).getByText("Completed source")).toBeTruthy()
    expect(within(testnetPanel).getByRole("button", { name: /preview testnet order/i })).toBeTruthy()
    expect(within(testnetPanel).getByRole("button", { name: /confirm submit/i })).toBeTruthy()
    expect(within(testnetPanel).getByRole("button", { name: /reconcile/i })).toBeTruthy()
    expect(screen.getByTestId("assisted-testnet-order-detail-panel").textContent).toContain("testnet-detail:intent-1")
    expect(screen.queryByText(/api secret/i)).toBeNull()
    expect(screen.queryByText(/live trading/i)).toBeNull()
    const paperSessionPanelText = screen.getByTestId("paper-session-panel").textContent ?? ""
    expect(paperSessionPanelText).toContain("detail-input:paper-session-1")
    expect(paperSessionPanelText).toContain("detail:paper-session-1")
    expect(paperSessionPanelText).toContain("detail-loading:false")
    expect(paperSessionPanelText).toContain("kill-switch:paper_kill_switch_enabled")
    expect(paperSessionPanelText).toContain("kill-switch-error:none")
    expect(paperSessionPanelText).toContain("kill-switch-loading:false")
    expect(paperSessionPanelText).toContain("run-local:paper_engine_completed")
    expect(paperSessionPanelText).toContain("can-run-local:true")
    const runtimePanelText = screen.getByTestId("paper-runtime-detail-panel").textContent ?? ""
    expect(runtimePanelText).toContain("runtime-detail:paper-session-1")
    expect(runtimePanelText).toContain("runtime-result:paper_engine_completed")
    expect(screen.getByTestId("version-run-panel")).toBeTruthy()
    expect(screen.getByTestId("strategy-lab-evaluate-panel")).toBeTruthy()
    expect(screen.getByTestId("strategy-lab-advanced-panel")).toBeTruthy()

    expect(screen.getByTestId("strategy-lab-layout").className).toContain(
      "xl:grid-cols-[280px_minmax(0,1fr)]",
    )
    expect(screen.getByTestId("strategy-lab-left-rail").className).toContain(
      "xl:w-[17.5rem]",
    )
    expect(screen.getByTestId("strategy-lab-main-canvas").className).toContain(
      "min-w-0",
    )
    expect(within(screen.getByTestId("advanced-paper")).getByTestId("paper-session-panel")).toBeTruthy()
    expect(within(screen.getByTestId("advanced-testnet")).getByTestId("assisted-testnet-panel")).toBeTruthy()
    expect(within(screen.getByTestId("advanced-live")).getByText("Assisted Live")).toBeTruthy()
    expect(within(screen.getByTestId("advanced-data-ops")).getByTestId("run-pipeline-panel")).toBeTruthy()
    expect(screen.getByText("binance:BTCUSDT:1h")).toBeTruthy()
    expect(screen.getByText(/42 rows imported/i)).toBeTruthy()
    expect(screen.getByTestId("preflight-dialog").textContent).toContain("preflight:ready")
    expect(screen.getByTestId("trade-marker-detail-panel").textContent).toContain("no-trade")
    expect(screen.getByText("Benchmark repeatability")).toBeTruthy()
    expect((screen.getByRole("button", { name: /run benchmark repeat/i }) as HTMLButtonElement).disabled).toBe(false)
    expect(screen.getByRole("button", { name: /signal-handoff:run-1:no-error/i })).toBeTruthy()
    expect(screen.getByRole("button", { name: /robustness-gate:run-1:no-error/i })).toBeTruthy()
    expect(screen.getByRole("button", { name: /execution-journal:run-1:0:no-error/i })).toBeTruthy()
    expect(screen.queryByText(/Submit order/i)).toBeNull()
    expect(screen.queryByText(/Connect exchange/i)).toBeNull()

    await user.click(screen.getByTestId("version-run-panel").querySelectorAll("button")[2] as HTMLButtonElement)
    await user.click(screen.getByTestId("preflight-dialog").querySelector("button:last-of-type") as HTMLButtonElement)
    await user.click(screen.getByRole("button", { name: "Open run-1" }))
    await user.click(screen.getByRole("button", { name: "Compare selected run" }))
    await user.click(screen.getByRole("button", { name: "Refresh history" }))
    await user.click(screen.getByRole("button", { name: "Refresh jobs" }))
    await user.click(screen.getByRole("button", { name: "Refresh scheduler status" }))
    await user.click(screen.getByRole("button", { name: "Refresh paper session" }))
    await user.click(within(testnetPanel).getByRole("button", { name: "Preview testnet order" }))
    await user.click(within(testnetPanel).getByRole("button", { name: "Confirm submit" }))
    await user.click(within(testnetPanel).getByRole("button", { name: "Cancel testnet" }))
    await user.click(within(testnetPanel).getByRole("button", { name: "Reconcile" }))
    await user.click(within(testnetPanel).getByRole("button", { name: "Refresh testnet previews" }))
    await user.click(within(testnetPanel).getByRole("button", { name: "Load testnet detail" }))
    await user.click(screen.getByRole("button", { name: "Set paper session detail id" }))
    await user.click(screen.getByRole("button", { name: "Load paper session detail" }))
    await user.click(screen.getByRole("button", { name: "Run local paper session" }))
    await user.click(screen.getByRole("button", { name: "Refresh pipeline" }))
    await user.click(screen.getByRole("button", { name: /run benchmark repeat/i }))
    await user.click(screen.getByRole("button", { name: /signal-handoff:run-1:no-error/i }))
    await user.click(screen.getByRole("button", { name: /robustness-gate:run-1:no-error/i }))
    await user.click(screen.getByRole("button", { name: /execution-journal:run-1:0:no-error/i }))

    expect(runBacktest).toHaveBeenCalledTimes(1)
    expect(confirmBacktest).toHaveBeenCalledTimes(1)
    expect(confirmSubmitTestnetOrder).toHaveBeenCalledTimes(1)
    expect(cancelTestnetOrder).toHaveBeenCalledTimes(1)
    expect(reconcileTestnetOrder).toHaveBeenCalledTimes(1)
    expect(reopenRun).toHaveBeenCalledWith("run-1")
    expect(openComparePicker).toHaveBeenCalledWith("run-1")
    expect(previewTestnetOrder).toHaveBeenCalledTimes(1)
    expect(refreshTestnetOrders).toHaveBeenCalledTimes(1)
    expect(loadTestnetOrderDetail).toHaveBeenCalledWith("intent-1")
    expect(refreshRunHistory).toHaveBeenCalledWith("strategy-1")
    expect(refreshJobVisibility).toHaveBeenCalledWith("strategy-1")
    expect(refreshFillSchedulerStatus).toHaveBeenCalledTimes(1)
    expect(refreshPaperSessionPreview).toHaveBeenCalledTimes(1)
    expect(setPaperSessionDetailInput).toHaveBeenCalledWith("paper-session-1")
    expect(loadPaperSessionDetail).toHaveBeenCalledTimes(1)
    expect(runPaperSessionLocal).toHaveBeenCalledTimes(1)
    expect(refreshPipeline).toHaveBeenCalledWith("run-1")
    expect(startBenchmarkRepeat).toHaveBeenCalledTimes(1)
    expect(createManualSignalPackage).toHaveBeenCalledTimes(1)
    expect(createResearchRobustnessGate).toHaveBeenCalledTimes(1)
    expect(createExecutionJournalEntry).toHaveBeenCalledTimes(1)

    const datasetPanel = screen.getByTestId("dataset-readiness-panel")
    const paperPanel = screen.getByTestId("paper-session-panel")
    const auditPanel = screen.getByTestId("local-fill-audit-panel")
    const schedulerPanel = screen.getByTestId("scheduler-status-panel")
    const jobPanel = screen.getByTestId("job-visibility-panel")
    const pipelinePanel = screen.getByTestId("run-pipeline-panel")
    expect(schedulerPanel.textContent).toContain("scheduler:processed")
    expect(paperPanel.compareDocumentPosition(datasetPanel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(datasetPanel.compareDocumentPosition(auditPanel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(auditPanel.compareDocumentPosition(schedulerPanel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(schedulerPanel.compareDocumentPosition(jobPanel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(datasetPanel.compareDocumentPosition(jobPanel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(jobPanel.compareDocumentPosition(pipelinePanel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(logSpy).not.toHaveBeenCalledWith(
      "RENDER DEBUG STATE:",
      expect.anything(),
    )
    logSpy.mockRestore()
  })

  it("keeps blocked preflight confirmation disabled", () => {
    mocks.useTradeLabWorkspace.mockReturnValue({
      groups: [
        {
          id: "group-1",
          name: "Momentum",
          slug: "momentum",
          description: "Momentum strategies",
          metadata: {},
          strategyCount: 1,
          activeStrategyCount: 1,
        },
      ],
      strategies: [
        {
          id: "strategy-1",
          strategyGroupId: "group-1",
          name: "Supertrend",
          slug: "supertrend",
          description: "Trend follower",
          status: "active",
          currentVersionId: "version-1",
          runtimeConfig: {
            exchange: "binance",
            symbol: "BTCUSDT",
            timeframe: "1h",
            startAt: "2026-01-01T00:00:00Z",
            endAt: "2026-01-02T00:00:00Z",
            initialEquity: 1000,
            feeBps: 0,
            slippageBps: 0,
          },
          riskConfig: {
            maxOrderPercent: 10,
            maxPositionPercent: 100,
            maxDrawdownPercent: 15,
            minNotional: 10,
            stepSize: 0.001,
            tickSize: 0.01,
          },
          versionCount: 1,
        },
      ],
      draftRuntimeConfig: {
        exchange: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        startAt: "2026-01-01T00:00:00Z",
        endAt: "2026-01-02T00:00:00Z",
        initialEquity: 1000,
        feeBps: 0,
        slippageBps: 0,
      },
      draftRiskConfig: {
        maxOrderPercent: 10,
        maxPositionPercent: 100,
        maxDrawdownPercent: 15,
        minNotional: 10,
        stepSize: 0.001,
        tickSize: 0.01,
      },
      draftSource: "print('blocked')",
      actionMessage: null,
      error: null,
      isLoading: false,
      isSavingSettings: false,
      isSavingVersion: false,
      isRunningBacktest: false,
      isPollingPipeline: false,
      selectedGroupId: "group-1",
      selectedStrategyId: "strategy-1",
      selectedStrategy: {
        id: "strategy-1",
        strategyGroupId: "group-1",
        name: "Supertrend",
        slug: "supertrend",
        description: "Trend follower",
        status: "active",
        currentVersionId: "version-1",
        runtimeConfig: {
          exchange: "binance",
          symbol: "BTCUSDT",
          timeframe: "1h",
          startAt: "2026-01-01T00:00:00Z",
          endAt: "2026-01-02T00:00:00Z",
          initialEquity: 1000,
          feeBps: 0,
          slippageBps: 0,
        },
        riskConfig: {
          maxOrderPercent: 10,
          maxPositionPercent: 100,
          maxDrawdownPercent: 15,
          minNotional: 10,
          stepSize: 0.001,
          tickSize: 0.01,
        },
        metadata: {},
        versions: [
          {
            id: "version-1",
            strategyId: "strategy-1",
            versionNumber: 1,
            validationStatus: "valid",
            validationMessage: null,
            sourceCode: "print('blocked')",
            sourceHash: "hash-1",
            createdAt: "2026-01-01T00:00:00Z",
          },
        ],
        versionCount: 1,
      },
      currentVersion: {
        id: "version-1",
        strategyId: "strategy-1",
        versionNumber: 1,
        validationStatus: "valid",
        validationMessage: null,
        sourceCode: "print('blocked')",
        sourceHash: "hash-1",
        createdAt: "2026-01-01T00:00:00Z",
      },
      execution: null,
      chartData: { candles: [], markers: [], equityCurve: [], selectedTrade: null },
      selectedTrade: null,
      runAnalysis: null,
      selectedAnalyzedTrade: null,
      selectedTradeExecutionDetail: null,
      runHistory: [],
      compareCandidates: [],
      compareMode: null,
      isComparePickerOpen: false,
      activePipeline: null,
      preflightResult: {
        datasetKey: "binance:BTCUSDT:1h",
        exchange: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        requestedStartAt: "2026-01-01T00:00:00Z",
        requestedEndAt: "2026-01-02T00:00:00Z",
        outcome: "blocked",
        action: null,
        reasons: ["Source is blocked."],
        coverage: null,
        missingSegments: [],
        repairStartAt: null,
        repairEndAt: null,
        activeJobId: null,
        activeJobType: null,
        sourceBlocked: true,
      },
      isPreflightOpen: true,
      pendingBacktestRequest: null,
      bots: [],
      credentialBoundary: {
        exchange: "binance",
        status: "missing",
        checks: {
          readOnlyEnabled: false,
          tradingDisabled: false,
          withdrawDisabled: false,
          futuresMarginDisabled: false,
          ipRestricted: false,
        },
        updatedAt: null,
      },
      draftCredentialBoundaryChecks: {
        readOnlyEnabled: false,
        tradingDisabled: false,
        withdrawDisabled: false,
        futuresMarginDisabled: false,
        ipRestricted: false,
      },
      setDraftRuntimeConfig: vi.fn(),
      setDraftRiskConfig: vi.fn(),
      setDraftCredentialBoundaryChecks: vi.fn(),
      setDraftSource: vi.fn(),
      selectGroup: vi.fn(),
      selectStrategy: vi.fn(),
      saveStrategySettings: vi.fn(),
      createVersion: vi.fn(),
      runBacktest: vi.fn(),
      confirmBacktest: vi.fn(),
      cancelPreflight: vi.fn(),
      reopenRun: vi.fn(),
      selectTrade: vi.fn(),
      selectAnalyzedTrade: vi.fn(),
      openComparePicker: vi.fn(),
      closeComparePicker: vi.fn(),
      chooseCompareRun: vi.fn(),
      exitCompareMode: vi.fn(),
      refreshRunHistory: vi.fn(),
      refreshPipeline: vi.fn(),
    })

    render(<StrategyLabPage />)

    expect(screen.getByTestId("preflight-dialog").textContent).toContain("preflight:blocked")
    expect((screen.getByRole("button", { name: "Confirm" }) as HTMLButtonElement).disabled).toBe(true)
  })

  it("renders compare mode and compare picker content", async () => {
    const user = userEvent.setup()
    const openComparePicker = vi.fn()
    const closeComparePicker = vi.fn()
    const chooseCompareRun = vi.fn()
    const exitCompareMode = vi.fn()

    const baseAnalysis = {
      run: {
        id: "run-1",
        botId: "bot-1",
        strategyId: "strategy-1",
        strategyVersionId: "version-1",
        runType: "backtest",
        status: "completed",
        pipelineStatus: "completed",
        exchange: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        startAt: "2026-01-01T00:00:00Z",
        endAt: "2026-01-02T00:00:00Z",
        startedAt: "2026-01-02T00:00:00Z",
        finishedAt: "2026-01-02T00:01:00Z",
        dataJobId: null,
        errorMessage: null,
        createdAt: "2026-01-02T00:00:00Z",
        createdBy: "codex",
        snapshot: null,
      },
      result: null,
      snapshot: {
        sourceSnapshot: { sourceCode: "print('base')" },
        datasetContext: {},
        pipelineContext: {},
      },
      runtimeConfig: {
        exchange: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        startAt: "2026-01-01T00:00:00Z",
        endAt: "2026-01-02T00:00:00Z",
        initialEquity: 1000,
        feeBps: 0,
        slippageBps: 0,
      },
      riskConfig: {
        maxOrderPercent: 10,
        maxPositionPercent: 100,
        maxDrawdownPercent: 15,
        minNotional: 10,
        stepSize: 0.001,
        tickSize: 0.01,
      },
      datasetContext: {
        datasetKey: "binance:BTCUSDT:1h",
        exchange: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        requestedStartAt: "2026-01-01T00:00:00Z",
        requestedEndAt: "2026-01-02T00:00:00Z",
        sourceHash: "hash-1",
        strategyVersionId: "version-1",
        coverage: null,
      },
      tradeSummary: {
        totalTrades: 1,
        closedTrades: 1,
        openTrades: 0,
        winningTrades: 1,
        losingTrades: 0,
        breakEvenTrades: 0,
        realizedPnl: 50,
        averagePnl: 50,
        averagePnlPct: 5,
        averageDurationSeconds: 3600,
        winRatePct: 100,
        profitFactor: 2,
      },
      trades: [
        {
          id: "trade-1",
          entryOrderId: "entry-1",
          exitOrderId: "exit-1",
          entryTime: "2026-01-01T01:00:00Z",
          exitTime: "2026-01-01T02:00:00Z",
          side: "buy",
          status: "closed",
          entryPrice: 100,
          exitPrice: 110,
          quantity: 1,
          pnl: 10,
          pnlPct: 10,
          durationSeconds: 3600,
          entrySignalId: "signal-1",
          exitSignalId: "signal-2",
          entryReason: "Entry",
          exitReason: "Exit",
        },
      ],
    } as any

    const compareAnalysis = {
      ...baseAnalysis,
      run: {
        ...baseAnalysis.run,
        id: "run-2",
        symbol: "ETHUSDT",
        timeframe: "4h",
        startAt: "2026-01-03T00:00:00Z",
        endAt: "2026-01-04T00:00:00Z",
        startedAt: "2026-01-04T00:00:00Z",
        finishedAt: "2026-01-04T00:02:00Z",
        createdAt: "2026-01-04T00:00:00Z",
      },
      datasetContext: {
        ...baseAnalysis.datasetContext,
        datasetKey: "binance:ETHUSDT:4h",
        symbol: "ETHUSDT",
        timeframe: "4h",
        requestedStartAt: "2026-01-03T00:00:00Z",
        requestedEndAt: "2026-01-04T00:00:00Z",
        sourceHash: "hash-2",
      },
    } as any

    mocks.useTradeLabWorkspace.mockReturnValue({
      groups: [
        {
          id: "group-1",
          name: "Momentum",
          slug: "momentum",
          description: "Momentum strategies",
          metadata: {},
          strategyCount: 1,
          activeStrategyCount: 1,
        },
      ],
      strategies: [
        {
          id: "strategy-1",
          strategyGroupId: "group-1",
          name: "Supertrend",
          slug: "supertrend",
          description: "Trend follower",
          status: "active",
          currentVersionId: "version-1",
          runtimeConfig: {
            exchange: "binance",
            symbol: "BTCUSDT",
            timeframe: "1h",
            startAt: "2026-01-01T00:00:00Z",
            endAt: "2026-01-02T00:00:00Z",
            initialEquity: 1000,
            feeBps: 0,
            slippageBps: 0,
          },
          riskConfig: {
            maxOrderPercent: 10,
            maxPositionPercent: 100,
            maxDrawdownPercent: 15,
            minNotional: 10,
            stepSize: 0.001,
            tickSize: 0.01,
          },
          versionCount: 1,
        },
      ],
      draftRuntimeConfig: {
        exchange: "binance",
        symbol: "BTCUSDT",
        timeframe: "1h",
        startAt: "2026-01-01T00:00:00Z",
        endAt: "2026-01-02T00:00:00Z",
        initialEquity: 1000,
        feeBps: 0,
        slippageBps: 0,
      },
      draftRiskConfig: {
        maxOrderPercent: 10,
        maxPositionPercent: 100,
        maxDrawdownPercent: 15,
        minNotional: 10,
        stepSize: 0.001,
        tickSize: 0.01,
      },
      draftSource: "print('compare')",
      actionMessage: "Comparing runs.",
      error: null,
      isLoading: false,
      isSavingSettings: false,
      isSavingVersion: false,
      isRunningBacktest: false,
      isPollingPipeline: false,
      selectedGroupId: "group-1",
      selectedStrategyId: "strategy-1",
      selectedStrategy: {
        id: "strategy-1",
        strategyGroupId: "group-1",
        name: "Supertrend",
        slug: "supertrend",
        description: "Trend follower",
        status: "active",
        currentVersionId: "version-1",
        runtimeConfig: {
          exchange: "binance",
          symbol: "BTCUSDT",
          timeframe: "1h",
          startAt: "2026-01-01T00:00:00Z",
          endAt: "2026-01-02T00:00:00Z",
          initialEquity: 1000,
          feeBps: 0,
          slippageBps: 0,
        },
        riskConfig: {
          maxOrderPercent: 10,
          maxPositionPercent: 100,
          maxDrawdownPercent: 15,
          minNotional: 10,
          stepSize: 0.001,
          tickSize: 0.01,
        },
        metadata: {},
        versions: [
          {
            id: "version-1",
            strategyId: "strategy-1",
            versionNumber: 1,
            validationStatus: "valid",
            validationMessage: null,
            sourceCode: "print('compare')",
            sourceHash: "hash-1",
            createdAt: "2026-01-01T00:00:00Z",
          },
        ],
        versionCount: 1,
      },
      currentVersion: {
        id: "version-1",
        strategyId: "strategy-1",
        versionNumber: 1,
        validationStatus: "valid",
        validationMessage: null,
        sourceCode: "print('compare')",
        sourceHash: "hash-1",
        createdAt: "2026-01-01T00:00:00Z",
      },
      execution: {
        runId: "run-1",
        status: "completed",
        logs: [],
        orders: [],
        metrics: null,
        equityCurve: [],
        stopReason: null,
        errorMessage: null,
      },
      chartData: {
        candles: [],
        markers: [],
        equityCurve: [],
        selectedTrade: null,
      },
      selectedTrade: null,
      runAnalysis: baseAnalysis,
      selectedAnalyzedTrade: baseAnalysis.trades[0],
      selectedTradeExecutionDetail: {
        trade: baseAnalysis.trades[0],
        entryOrder: null,
        exitOrder: null,
        entrySignal: null,
        exitSignal: null,
        logs: [],
      },
      runHistory: [
        {
          id: "run-1",
          botId: "bot-1",
          strategyId: "strategy-1",
          strategyVersionId: "version-1",
          runType: "backtest",
          status: "completed",
          pipelineStatus: "completed",
          exchange: "binance",
          symbol: "BTCUSDT",
          timeframe: "1h",
          startAt: "2026-01-01T00:00:00Z",
          endAt: "2026-01-02T00:00:00Z",
          startedAt: "2026-01-02T00:00:00Z",
          finishedAt: "2026-01-02T00:01:00Z",
          dataJobId: null,
          errorMessage: null,
          createdAt: "2026-01-02T00:00:00Z",
          createdBy: "codex",
          snapshot: null,
        },
        {
          id: "run-2",
          botId: "bot-1",
          strategyId: "strategy-1",
          strategyVersionId: "version-1",
          runType: "backtest",
          status: "completed",
          pipelineStatus: "completed",
          exchange: "binance",
          symbol: "ETHUSDT",
          timeframe: "4h",
          startAt: "2026-01-03T00:00:00Z",
          endAt: "2026-01-04T00:00:00Z",
          startedAt: "2026-01-04T00:00:00Z",
          finishedAt: "2026-01-04T00:02:00Z",
          dataJobId: null,
          errorMessage: null,
          createdAt: "2026-01-04T00:00:00Z",
          createdBy: "codex",
          snapshot: null,
        },
      ],
      compareCandidates: [
        {
          id: "run-2",
          botId: "bot-1",
          strategyId: "strategy-1",
          strategyVersionId: "version-1",
          runType: "backtest",
          status: "completed",
          pipelineStatus: "completed",
          exchange: "binance",
          symbol: "ETHUSDT",
          timeframe: "4h",
          startAt: "2026-01-03T00:00:00Z",
          endAt: "2026-01-04T00:00:00Z",
          startedAt: "2026-01-04T00:00:00Z",
          finishedAt: "2026-01-04T00:02:00Z",
          dataJobId: null,
          errorMessage: null,
          createdAt: "2026-01-04T00:00:00Z",
          createdBy: "codex",
          snapshot: null,
        },
      ],
      compareMode: {
        isOpen: true,
        baseRunId: "run-1",
        compareRunId: "run-2",
        baseAnalysis,
        compareAnalysis,
        metricDiffs: [],
        configDiff: {
          sourceHash: { key: "sourceHash", label: "Source hash", baseValue: "hash-1", compareValue: "hash-2", isMatch: false },
          strategyVersion: { key: "strategyVersion", label: "Strategy version", baseValue: "version-1", compareValue: "version-1", isMatch: true },
          runtimeConfigDiffs: [],
          riskConfigDiffs: [],
          datasetContextDiffs: [],
          baseSourceCode: "print('base')",
          compareSourceCode: "print('base')",
        },
        tradeSummaryDiffs: [],
        datasetMismatchWarning: "Dataset mismatch: symbol, timeframe, or date range differs between the two runs.",
      },
      isComparePickerOpen: true,
      activePipeline: {
        run: {
          id: "run-1",
          botId: "bot-1",
          strategyId: "strategy-1",
          strategyVersionId: "version-1",
          runType: "backtest",
          status: "completed",
          pipelineStatus: "completed",
          exchange: "binance",
          symbol: "BTCUSDT",
          timeframe: "1h",
          startAt: "2026-01-01T00:00:00Z",
          endAt: "2026-01-02T00:00:00Z",
          startedAt: "2026-01-02T00:00:00Z",
          finishedAt: "2026-01-02T00:01:00Z",
          dataJobId: null,
          errorMessage: null,
          createdAt: "2026-01-02T00:00:00Z",
          createdBy: "codex",
          snapshot: null,
        },
        preflight: null,
        dataJob: null,
        backtestJob: {},
        status: "completed",
        message: "Completed",
      },
      preflightResult: null,
      pendingBacktestRequest: null,
      bots: [],
      credentialBoundary: {
        exchange: "binance",
        status: "missing",
        checks: {
          readOnlyEnabled: false,
          tradingDisabled: false,
          withdrawDisabled: false,
          futuresMarginDisabled: false,
          ipRestricted: false,
        },
        updatedAt: null,
      },
      draftCredentialBoundaryChecks: {
        readOnlyEnabled: false,
        tradingDisabled: false,
        withdrawDisabled: false,
        futuresMarginDisabled: false,
        ipRestricted: false,
      },
      setDraftRuntimeConfig: vi.fn(),
      setDraftRiskConfig: vi.fn(),
      setDraftCredentialBoundaryChecks: vi.fn(),
      setDraftSource: vi.fn(),
      selectGroup: vi.fn(),
      selectStrategy: vi.fn(),
      saveStrategySettings: vi.fn(),
      createVersion: vi.fn(),
      runBacktest: vi.fn(),
      confirmBacktest: vi.fn(),
      cancelPreflight: vi.fn(),
      reopenRun: vi.fn(),
      selectTrade: vi.fn(),
      selectAnalyzedTrade: vi.fn(),
      openComparePicker,
      closeComparePicker,
      chooseCompareRun,
      exitCompareMode,
      refreshRunHistory: vi.fn(),
      refreshPipeline: vi.fn(),
    })

    render(<StrategyLabPage />)

    expect(screen.getByTestId("compare-mode-shell").textContent).toContain("run-1|run-2|Dataset mismatch")
    expect(screen.getByTestId("compare-run-picker-dialog").textContent).toContain("candidates:1")

    await user.click(screen.getByRole("button", { name: "Compare selected run" }))
    expect(openComparePicker).toHaveBeenCalledWith("run-1")

    await user.click(screen.getByRole("button", { name: "Exit compare" }))
    expect(exitCompareMode).toHaveBeenCalledTimes(1)
  })

})
