// @vitest-environment jsdom

import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const chartState = vi.hoisted(() => {
  const mockPriceSeries = {
    setData: vi.fn(),
    setMarkers: vi.fn(),
  }
  const mockChart = {
    addSeries: vi.fn(),
    subscribeClick: vi.fn(),
    unsubscribeClick: vi.fn(),
    timeScale: vi.fn(() => ({ fitContent: vi.fn() })),
    applyOptions: vi.fn(),
    remove: vi.fn(),
  }
    return {
      clickHandlers: [] as Array<(param: { time?: number | string }) => void>,
      mockPriceSeries,
      mockChart,
      createChart: vi.fn(() => mockChart),
      createSeriesMarkers: vi.fn(() => ({
        setMarkers: vi.fn(),
        markers: vi.fn(() => []),
        detach: vi.fn(),
      })),
    }
  })

vi.mock("lightweight-charts", () => ({
  ColorType: { Solid: "Solid" },
  CandlestickSeries: {},
  LineSeries: {},
  createChart: chartState.createChart,
  createSeriesMarkers: chartState.createSeriesMarkers,
}))

import { BacktestChartPanel } from "./backtest-chart-panel"

describe("BacktestChartPanel", () => {
  beforeEach(() => {
    chartState.createChart.mockClear()
    chartState.createSeriesMarkers.mockClear()
    chartState.mockPriceSeries.setData.mockClear()
    chartState.mockPriceSeries.setMarkers.mockClear()
    chartState.mockChart.addSeries.mockReset()
    chartState.mockChart.addSeries.mockImplementationOnce(() => chartState.mockPriceSeries)
    chartState.mockChart.subscribeClick.mockImplementation((handler: (param: { time?: number | string }) => void) => {
      chartState.clickHandlers.push(handler)
    })
    chartState.mockChart.unsubscribeClick.mockClear()
    chartState.mockChart.applyOptions.mockClear()
    chartState.mockChart.remove.mockClear()
    chartState.clickHandlers.length = 0
  })

  it("renders an empty state when there are no candles", () => {
    render(
      <BacktestChartPanel
        candles={[]}
        markers={[]}
        selectedTrade={null}
        focusTrade={null}
        onMarkerSelect={vi.fn()}
      />,
    )

    expect(screen.getByText("No chart data yet")).toBeTruthy()
    expect(chartState.createChart).not.toHaveBeenCalled()
  })

  it("forwards marker clicks to the selected trade callback", () => {
    const onMarkerSelect = vi.fn()
    const timestamp = "2026-01-01T00:00:00Z"
    const chartTime = Math.floor(new Date(timestamp).getTime() / 1000)

    render(
      <BacktestChartPanel
        candles={[
          {
            openTime: timestamp,
            closeTime: "2026-01-01T01:00:00Z",
            open: 100,
            high: 105,
            low: 99,
            close: 104,
            volume: 10,
          },
        ]}
        markers={[
          {
            id: "marker-1",
            timestamp,
            kind: "buy",
            side: "buy",
            price: 100,
            quantity: 1,
            tradeOrderId: "order-1",
            strategySignalId: "signal-1",
            message: "Entry",
            payload: {},
            signal: { id: "signal-1" },
          },
        ]}
        selectedTrade={null}
        focusTrade={null}
        onMarkerSelect={onMarkerSelect}
      />,
    )

    expect(chartState.createChart).toHaveBeenCalledTimes(1)
    expect(chartState.createSeriesMarkers).toHaveBeenCalledTimes(1)
    expect(chartState.mockPriceSeries.setData).toHaveBeenCalledTimes(1)

    const clickHandler = chartState.clickHandlers[0]
    expect(typeof clickHandler).toBe("function")

    clickHandler?.({ time: chartTime })

    expect(onMarkerSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        marker: expect.objectContaining({
          id: "marker-1",
          timestamp,
        }),
        order: null,
        signal: { id: "signal-1" },
        logs: [],
      }),
    )
  })
})
