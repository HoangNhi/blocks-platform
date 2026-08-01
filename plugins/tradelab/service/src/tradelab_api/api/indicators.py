from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from tradelab_api.api.responses import success_response


router = APIRouter()


INDICATORS: list[dict[str, object]] = [
    {
        "name": "sma",
        "description": "Simple moving average.",
        "arguments": ["values", "period"],
        "example": "ctx.indicators.sma(close, 20)",
    },
    {
        "name": "ema",
        "description": "Exponential moving average.",
        "arguments": ["values", "period"],
        "example": "ctx.indicators.ema(close, 12)",
    },
    {
        "name": "wma",
        "description": "Weighted moving average.",
        "arguments": ["values", "period"],
        "example": "ctx.indicators.wma(close, 14)",
    },
    {
        "name": "rsi",
        "description": "Relative strength index.",
        "arguments": ["values", "period"],
        "example": "ctx.indicators.rsi(close, 14)",
    },
    {
        "name": "atr",
        "description": "Average true range.",
        "arguments": ["high", "low", "close", "period"],
        "example": "ctx.indicators.atr(high, low, close, 14)",
    },
    {
        "name": "macd",
        "description": "Moving average convergence divergence.",
        "arguments": ["values", "fast", "slow", "signal"],
        "example": "ctx.indicators.macd(close)",
    },
    {
        "name": "bollinger_bands",
        "description": "Bollinger Bands.",
        "arguments": ["values", "period", "stddev"],
        "example": "ctx.indicators.bollinger_bands(close)",
    },
    {
        "name": "stochastic",
        "description": "Stochastic oscillator.",
        "arguments": ["high", "low", "close", "k_period", "d_period"],
        "example": "ctx.indicators.stochastic(high, low, close)",
    },
    {
        "name": "stoch_rsi",
        "description": "Stochastic RSI.",
        "arguments": ["values", "rsi_period", "stoch_period", "k_period", "d_period"],
        "example": "ctx.indicators.stoch_rsi(close)",
    },
    {
        "name": "adx",
        "description": "Average directional index.",
        "arguments": ["high", "low", "close", "period"],
        "example": "ctx.indicators.adx(high, low, close, 14)",
    },
    {
        "name": "cci",
        "description": "Commodity channel index.",
        "arguments": ["high", "low", "close", "period"],
        "example": "ctx.indicators.cci(high, low, close, 20)",
    },
    {
        "name": "roc",
        "description": "Rate of change.",
        "arguments": ["values", "period"],
        "example": "ctx.indicators.roc(close, 12)",
    },
    {
        "name": "obv",
        "description": "On-balance volume.",
        "arguments": ["close", "volume"],
        "example": "ctx.indicators.obv(close, volume)",
    },
    {
        "name": "highest",
        "description": "Rolling highest value.",
        "arguments": ["values", "period"],
        "example": "ctx.indicators.highest(high, 20)",
    },
    {
        "name": "lowest",
        "description": "Rolling lowest value.",
        "arguments": ["values", "period"],
        "example": "ctx.indicators.lowest(low, 20)",
    },
    {
        "name": "crossover",
        "description": "Detects when the left series crosses above the right series.",
        "arguments": ["left", "right"],
        "example": "ctx.indicators.crossover(fast, slow)",
    },
    {
        "name": "crossunder",
        "description": "Detects when the left series crosses below the right series.",
        "arguments": ["left", "right"],
        "example": "ctx.indicators.crossunder(fast, slow)",
    },
]


@router.get("/indicators")
def list_indicators() -> JSONResponse:
    return success_response({"items": INDICATORS})
