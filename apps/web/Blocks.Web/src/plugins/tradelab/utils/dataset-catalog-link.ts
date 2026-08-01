import type { TradeLabPreflightResult, TradeLabRuntimeConfig } from "../types"

const datasetCatalogRoute = "/plugins/tradelab/datasets"

export function buildDatasetCatalogHref(
  preflight: TradeLabPreflightResult | null,
  runtimeConfig: TradeLabRuntimeConfig,
) {
  const params = new URLSearchParams()
  const datasetKey = preflight?.datasetKey?.trim()

  if (datasetKey) {
    params.set("datasetKey", datasetKey)
  } else {
    const symbol = runtimeConfig.symbol.trim()
    const timeframe = runtimeConfig.timeframe.trim()
    if (!symbol || !timeframe) {
      return null
    }

    params.set("symbol", symbol)
    params.set("timeframe", timeframe)
  }

  appendTargetRangeParams(params, preflight, runtimeConfig)
  return `${datasetCatalogRoute}?${params.toString()}`
}

function appendTargetRangeParams(
  params: URLSearchParams,
  preflight: TradeLabPreflightResult | null,
  runtimeConfig: TradeLabRuntimeConfig,
) {
  appendIfPresent(params, "requestedStartAt", preflight?.requestedStartAt ?? runtimeConfig.startAt)
  appendIfPresent(params, "requestedEndAt", preflight?.requestedEndAt ?? runtimeConfig.endAt)
}

function appendIfPresent(params: URLSearchParams, key: string, value: string | null | undefined) {
  const trimmed = value?.trim() ?? ""
  if (trimmed) {
    params.set(key, trimmed)
  }
}
