from __future__ import annotations

from tradelab_sdk.indicators import (
    IndicatorSet,
    adx,
    atr,
    bollinger_bands,
    crossover,
    crossunder,
    ema,
    highest,
    lowest,
    obv,
    roc,
    rsi,
    sma,
    stochastic,
    stoch_rsi,
    wma,
)


def test_empty_input_returns_empty_or_none_series() -> None:
    assert sma([], 3) == []
    assert ema([], 3) == []
    assert wma([], 3) == []
    assert rsi([], 14) == []
    assert atr([], [], [], 3) == []


def test_short_input_stays_in_warmup() -> None:
    assert sma([1, 2], 3) == [None, None]
    assert ema([1, 2], 3) == [None, None]
    assert wma([1, 2], 3) == [None, None]
    assert highest([1, 2], 3) == [None, None]
    assert lowest([1, 2], 3) == [None, None]


def test_known_sma_and_ema_examples() -> None:
    assert sma([1, 2, 3, 4, 5], 3) == [None, None, 2.0, 3.0, 4.0]
    assert ema([1, 2, 3, 4, 5], 3) == [None, None, 2.0, 3.0, 4.0]


def test_known_rsi_examples() -> None:
    assert rsi([1, 1, 1, 1, 1, 1], 2) == [None, None, 50.0, 50.0, 50.0, 50.0]
    assert rsi([1, 2, 3, 4, 5], 2) == [None, None, 100.0, 100.0, 100.0]


def test_constant_series_helpers() -> None:
    middle, upper, lower = bollinger_bands([10, 10, 10, 10], 2)
    assert middle == [None, 10.0, 10.0, 10.0]
    assert upper == [None, 10.0, 10.0, 10.0]
    assert lower == [None, 10.0, 10.0, 10.0]
    assert obv([10, 10, 10], [1, 2, 3]) == [0.0, 0.0, 0.0]


def test_crossovers_and_crossunders() -> None:
    assert crossover([1, 2], [2, 1]) is True
    assert crossunder([2, 1], [1, 2]) is True
    assert crossover([2, 1], [1, 2]) is False
    assert crossunder([1, 2], [2, 1]) is False


def test_indicator_catalog_wrapper_proxies() -> None:
    library = IndicatorSet()
    assert library.sma([1, 2, 3], 2) == [None, 1.5, 2.5]


def test_other_indicators_shape_and_warmup() -> None:
    high = [10, 11, 12, 13, 14, 15]
    low = [9, 9.5, 10, 11, 12, 13]
    close = [9.5, 10.5, 11.5, 12.5, 13.5, 14.5]
    volume = [100, 120, 140, 160, 180, 200]

    assert len(roc(close, 3)) == len(close)
    assert len(adx(high, low, close, 3)) == len(close)
    assert len(stochastic(high, low, close, 3, 2)[0]) == len(close)
    assert len(stoch_rsi(close, 2, 2, 2, 2)[0]) == len(close)

