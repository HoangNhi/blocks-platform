import type {
  TradeLabWorkbenchState,
  TradeLabStrategyGroup,
} from "./types"

const supertrendSource = `from tradelab_sdk import StrategyContext


def on_candle(ctx: StrategyContext):
    close = ctx.history["close"]
    fast = ctx.indicators.sma(close, 10)
    slow = ctx.indicators.sma(close, 30)

    if ctx.indicators.crossover(fast, slow):
        ctx.buy_market(percent=25)
    elif ctx.indicators.crossunder(fast, slow):
        ctx.sell_market(percent=100)
`

const ma1Source = `from tradelab_sdk import StrategyContext


def on_candle(ctx: StrategyContext):
    close = ctx.history["close"]
    fast = ctx.indicators.ema(close, 12)
    slow = ctx.indicators.ema(close, 48)

    if ctx.indicators.crossover(fast, slow):
        ctx.buy_market(percent=30)
    elif ctx.indicators.crossunder(fast, slow):
        ctx.close_position()
`

const ma2Source = `from tradelab_sdk import StrategyContext


def on_candle(ctx: StrategyContext):
    if len(ctx.history["close"]) < 40:
        return None
    if ctx.history["close"][-1] > ctx.history["close"][-2]:
        ctx.buy_market(percent=15)
`

const groups: TradeLabStrategyGroup[] = [
  {
    id: "trend-following",
    name: "Trend Following",
    slug: "trend-following",
    description: "Spot-only trend followers with moving-average and Supertrend variants.",
    metadata: { focus: "trend" },
    strategyCount: 2,
    activeStrategyCount: 2,
    strategies: [
      {
        id: "dca-ma1",
        strategyGroupId: "trend-following",
        name: "DCA MA1",
        slug: "dca-ma1",
        description: "Fast EMA versus slow EMA with next-candle fills.",
        status: "active",
        currentVersionId: "dca-ma1-v3",
        versionCount: 1,
        metadata: {},
        runtimeConfig: {
          exchange: "binance",
          symbol: "BTCUSDT",
          timeframe: "1h",
          startAt: "2026-01-01",
          endAt: "2026-03-31",
          initialEquity: 10000,
          feeBps: 10,
          slippageBps: 5,
        },
        riskConfig: {
          maxOrderPercent: 25,
          maxPositionPercent: 80,
          maxDrawdownPercent: 15,
          minNotional: 15,
          stepSize: 0.0001,
          tickSize: 0.01,
        },
        versions: [
          {
            id: "dca-ma1-v3",
            strategyId: "dca-ma1",
            versionNumber: 3,
            validationStatus: "valid",
            validationMessage: "Validated against the local runner.",
            sourceCode: ma1Source,
            sourceHash: "4f4b2f5b4d6b6b1c8a6f7c8a4d6f9d0a",
            createdAt: "2026-05-08T09:30:00Z",
          },
        ],
        lastRun: {
          id: "run-ma1-01",
          status: "completed",
          finishedAt: "2026-05-08T10:05:00Z",
          metrics: {
            initialEquity: 10000,
            finalEquity: 11842.51,
            totalReturnPct: 18.4251,
            maxDrawdownPct: 5.17,
            profitFactor: 2.41,
            winRatePct: 61.5,
            totalTrades: 24,
            closedTrades: 24,
          },
        },
      },
      {
        id: "dca-supertrend",
        strategyGroupId: "trend-following",
        name: "DCA Supertrend",
        slug: "dca-supertrend",
        description: "Supertrend gate with a deliberately zero-trade sample run.",
        status: "active",
        currentVersionId: "dca-supertrend-v5",
        versionCount: 1,
        metadata: {},
        runtimeConfig: {
          exchange: "binance",
          symbol: "ETHUSDT",
          timeframe: "1h",
          startAt: "2026-01-01",
          endAt: "2026-03-31",
          initialEquity: 10000,
          feeBps: 10,
          slippageBps: 5,
        },
        riskConfig: {
          maxOrderPercent: 25,
          maxPositionPercent: 70,
          maxDrawdownPercent: 12,
          minNotional: 15,
          stepSize: 0.001,
          tickSize: 0.1,
        },
        versions: [
          {
            id: "dca-supertrend-v5",
            strategyId: "dca-supertrend",
            versionNumber: 5,
            validationStatus: "valid",
            validationMessage: "Validated against the local runner.",
            sourceCode: supertrendSource,
            sourceHash: "b2ef2a1b0c9d9d3c7e1d6a8f0a8c4c11",
            createdAt: "2026-05-08T11:00:00Z",
          },
        ],
        lastRun: {
          id: "run-supertrend-01",
          status: "completed",
          finishedAt: "2026-05-08T13:20:00Z",
          metrics: {
            initialEquity: 10000,
            finalEquity: 10000,
            totalReturnPct: 0,
            maxDrawdownPct: 0,
            profitFactor: null,
            winRatePct: null,
            totalTrades: 0,
            closedTrades: 0,
          },
        },
      },
    ],
  },
  {
    id: "mean-reversion",
    name: "Mean Reversion",
    slug: "mean-reversion",
    description: "Experiment group for slower swing-style spot variants.",
    metadata: { focus: "mean-reversion" },
    strategyCount: 1,
    activeStrategyCount: 0,
    strategies: [
      {
        id: "dca-ma2",
        strategyGroupId: "mean-reversion",
        name: "DCA MA2",
        slug: "dca-ma2",
        description: "Slower average crossover variant with a conservative risk cap.",
        status: "paused",
        currentVersionId: "dca-ma2-v2",
        versionCount: 1,
        metadata: {},
        runtimeConfig: {
          exchange: "binance",
          symbol: "SOLUSDT",
          timeframe: "4h",
          startAt: "2026-01-01",
          endAt: "2026-03-31",
          initialEquity: 5000,
          feeBps: 10,
          slippageBps: 8,
        },
        riskConfig: {
          maxOrderPercent: 20,
          maxPositionPercent: 60,
          maxDrawdownPercent: 10,
          minNotional: 10,
          stepSize: 0.01,
          tickSize: 0.01,
        },
        versions: [
          {
            id: "dca-ma2-v2",
            strategyId: "dca-ma2",
            versionNumber: 2,
            validationStatus: "draft",
            validationMessage: "Draft saved locally.",
            sourceCode: ma2Source,
            sourceHash: "d6b3e2b8b6d17c28f47e7f0e4d77a0a1",
            createdAt: "2026-05-07T18:15:00Z",
          },
        ],
        lastRun: {
          id: "run-ma2-01",
          status: "failed",
          finishedAt: "2026-05-07T18:44:00Z",
          metrics: {
            initialEquity: 5000,
            finalEquity: 4920.13,
            totalReturnPct: -1.5974,
            maxDrawdownPct: 4.33,
            profitFactor: 0.86,
            winRatePct: 42.1,
            totalTrades: 11,
            closedTrades: 11,
          },
        },
      },
    ],
  },
]

export const tradeLabMockWorkbench: TradeLabWorkbenchState = {
  groups,
  selectedGroupId: "trend-following",
  selectedStrategyId: "dca-supertrend",
  runtimeConfig: groups[0]!.strategies[1]!.runtimeConfig,
  riskConfig: groups[0]!.strategies[1]!.riskConfig,
  metrics: groups[0]!.strategies[1]!.lastRun?.metrics ?? null,
  logs: [
    {
      id: "log-1",
      timestamp: "2026-05-08T13:18:01Z",
      level: "info",
      eventType: "RUN_STARTED",
      message: "Backtest started with zero-trade sample data.",
      payload: {
        symbol: "ETHUSDT",
        timeframe: "1h",
        candles: 96,
      },
    },
    {
      id: "log-2",
      timestamp: "2026-05-08T13:19:10Z",
      level: "warning",
      eventType: "RISK_REJECTED",
      message: "Strategy output stayed below the minimum notional threshold.",
      payload: {
        minNotional: 15,
        requestedNotional: 8.42,
      },
    },
    {
      id: "log-3",
      timestamp: "2026-05-08T13:20:00Z",
      level: "info",
      eventType: "RUN_COMPLETED",
      message: "Backtest completed with zero trades.",
      payload: {
        totalTrades: 0,
        maxDrawdownPct: 0,
      },
    },
  ],
  orders: [],
  candles: [
    { openTime: "2026-01-01T00:00:00Z", closeTime: "2026-01-01T01:00:00Z", open: 2112.4, high: 2120.6, low: 2102.1, close: 2114.3, volume: 1204.3 },
    { openTime: "2026-01-01T01:00:00Z", closeTime: "2026-01-01T02:00:00Z", open: 2114.3, high: 2127.9, low: 2108.4, close: 2119.8, volume: 1184.5 },
    { openTime: "2026-01-01T02:00:00Z", closeTime: "2026-01-01T03:00:00Z", open: 2119.8, high: 2124.2, low: 2100.0, close: 2103.6, volume: 1301.9 },
    { openTime: "2026-01-01T03:00:00Z", closeTime: "2026-01-01T04:00:00Z", open: 2103.6, high: 2110.8, low: 2099.4, close: 2101.2, volume: 901.2 },
    { openTime: "2026-01-01T04:00:00Z", closeTime: "2026-01-01T05:00:00Z", open: 2101.2, high: 2108.7, low: 2096.0, close: 2104.8, volume: 1011.7 },
    { openTime: "2026-01-01T05:00:00Z", closeTime: "2026-01-01T06:00:00Z", open: 2104.8, high: 2112.5, low: 2100.6, close: 2109.1, volume: 1122.9 },
  ],
  equityCurve: [
    { timestamp: "2026-01-01T00:00:00Z", equity: 10000, drawdownPct: 0 },
    { timestamp: "2026-01-01T01:00:00Z", equity: 10000, drawdownPct: 0 },
    { timestamp: "2026-01-01T02:00:00Z", equity: 10000, drawdownPct: 0 },
    { timestamp: "2026-01-01T03:00:00Z", equity: 10000, drawdownPct: 0 },
    { timestamp: "2026-01-01T04:00:00Z", equity: 10000, drawdownPct: 0 },
    { timestamp: "2026-01-01T05:00:00Z", equity: 10000, drawdownPct: 0 },
  ],
  preflight: null,
  activePipeline: null,
  jobVisibility: null,
  fillJobVisibility: null,
  fillJobVisibilityError: null,
  isFillJobVisibilityLoading: false,
  fillSchedulerStatus: null,
  fillSchedulerStatusError: null,
  isFillSchedulerStatusLoading: false,
  refreshFillSchedulerStatus: async () => null,
  paperSchedulerStatus: null,
  paperSchedulerStatusError: null,
  isPaperSchedulerStatusLoading: false,
  refreshPaperSchedulerStatus: async () => null,
  datasetFillEnqueueResult: null,
  datasetFillEnqueueError: null,
  isEnqueueingDatasetFill: false,
  queueDatasetFillLocal: async () => null,
  isJobVisibilityLoading: false,
  jobVisibilityError: null,
  runHistory: [],
  selectedTrade: null,
  selectedAnalyzedTrade: null,
  selectedTradeExecutionDetail: null,
  runAnalysis: null,
  benchmarkCheck: null,
  compareCandidates: [],
  compareMode: null,
  isComparePickerOpen: false,
  editorSource: supertrendSource,
  draftSavedAt: "2026-05-08T13:25:00Z",
}
