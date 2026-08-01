from __future__ import annotations

from math import fabs
from statistics import pstdev
from typing import Iterable, Sequence


def _as_float_list(values: Iterable[float | int]) -> list[float]:
    return [float(value) for value in values]


def _none_series(length: int) -> list[float | None]:
    return [None] * length


def sma(values: Sequence[float | int], period: int) -> list[float | None]:
    series = _as_float_list(values)
    if period <= 0:
        raise ValueError("period must be greater than zero")
    result = _none_series(len(series))
    if len(series) < period:
        return result
    window_sum = sum(series[:period])
    result[period - 1] = window_sum / period
    for index in range(period, len(series)):
        window_sum += series[index] - series[index - period]
        result[index] = window_sum / period
    return result


def ema(values: Sequence[float | int], period: int) -> list[float | None]:
    series = _as_float_list(values)
    if period <= 0:
        raise ValueError("period must be greater than zero")
    result = _none_series(len(series))
    if len(series) < period:
        return result
    seed = sum(series[:period]) / period
    result[period - 1] = seed
    multiplier = 2 / (period + 1)
    previous = seed
    for index in range(period, len(series)):
        previous = ((series[index] - previous) * multiplier) + previous
        result[index] = previous
    return result


def wma(values: Sequence[float | int], period: int) -> list[float | None]:
    series = _as_float_list(values)
    if period <= 0:
        raise ValueError("period must be greater than zero")
    result = _none_series(len(series))
    if len(series) < period:
        return result
    weights = list(range(1, period + 1))
    divisor = sum(weights)
    for index in range(period - 1, len(series)):
        window = series[index - period + 1 : index + 1]
        result[index] = sum(value * weight for value, weight in zip(window, weights)) / divisor
    return result


def rsi(values: Sequence[float | int], period: int = 14) -> list[float | None]:
    series = _as_float_list(values)
    if period <= 0:
        raise ValueError("period must be greater than zero")
    result = _none_series(len(series))
    if len(series) <= period:
        return result
    gains = 0.0
    losses = 0.0
    for index in range(1, period + 1):
        change = series[index] - series[index - 1]
        if change >= 0:
            gains += change
        else:
            losses += -change
    average_gain = gains / period
    average_loss = losses / period
    result[period] = _relative_strength_index(average_gain, average_loss)
    for index in range(period + 1, len(series)):
        change = series[index] - series[index - 1]
        gain = change if change > 0 else 0.0
        loss = -change if change < 0 else 0.0
        average_gain = ((average_gain * (period - 1)) + gain) / period
        average_loss = ((average_loss * (period - 1)) + loss) / period
        result[index] = _relative_strength_index(average_gain, average_loss)
    return result


def _relative_strength_index(average_gain: float, average_loss: float) -> float:
    if average_gain == 0 and average_loss == 0:
        return 50.0
    if average_loss == 0:
        return 100.0
    if average_gain == 0:
        return 0.0
    relative_strength = average_gain / average_loss
    return 100 - (100 / (1 + relative_strength))


def atr(
    high: Sequence[float | int],
    low: Sequence[float | int],
    close: Sequence[float | int],
    period: int = 14,
) -> list[float | None]:
    high_series = _as_float_list(high)
    low_series = _as_float_list(low)
    close_series = _as_float_list(close)
    if period <= 0:
        raise ValueError("period must be greater than zero")
    length = min(len(high_series), len(low_series), len(close_series))
    result = _none_series(length)
    if length < period:
        return result
    true_ranges: list[float] = []
    for index in range(length):
        if index == 0:
            true_ranges.append(high_series[index] - low_series[index])
            continue
        true_ranges.append(
            max(
                high_series[index] - low_series[index],
                fabs(high_series[index] - close_series[index - 1]),
                fabs(low_series[index] - close_series[index - 1]),
            )
        )
    rolling = sma(true_ranges, period)
    return rolling


def macd(
    values: Sequence[float | int],
    fast: int = 12,
    slow: int = 26,
    signal: int = 9,
) -> tuple[list[float | None], list[float | None], list[float | None]]:
    series = _as_float_list(values)
    fast_ema = ema(series, fast)
    slow_ema = ema(series, slow)
    macd_line = [
        fast_value - slow_value if fast_value is not None and slow_value is not None else None
        for fast_value, slow_value in zip(fast_ema, slow_ema)
    ]
    first_valid_index = next((index for index, value in enumerate(macd_line) if value is not None), None)
    if first_valid_index is None:
        none_line = _none_series(len(series))
        return none_line, none_line, none_line
    macd_values = [value for value in macd_line[first_valid_index:] if value is not None]
    signal_line = [None] * first_valid_index + ema(macd_values, signal)
    histogram = [
        macd_value - signal_value if macd_value is not None and signal_value is not None else None
        for macd_value, signal_value in zip(macd_line, signal_line)
    ]
    return macd_line, signal_line, histogram


def bollinger_bands(
    values: Sequence[float | int], period: int = 20, stddev: float = 2
) -> tuple[list[float | None], list[float | None], list[float | None]]:
    series = _as_float_list(values)
    if period <= 0:
        raise ValueError("period must be greater than zero")
    middle = sma(series, period)
    upper = _none_series(len(series))
    lower = _none_series(len(series))
    start_index = max(period - 1, len(series) - 5)
    for index in range(start_index, len(series)):
        window = series[index - period + 1 : index + 1]
        deviation = pstdev(window)
        upper[index] = middle[index] + (stddev * deviation) if middle[index] is not None else None
        lower[index] = middle[index] - (stddev * deviation) if middle[index] is not None else None
    return middle, upper, lower


def highest(values: Sequence[float | int], period: int) -> list[float | None]:
    series = _as_float_list(values)
    if period <= 0:
        raise ValueError("period must be greater than zero")
    result = _none_series(len(series))
    for index in range(period - 1, len(series)):
        result[index] = max(series[index - period + 1 : index + 1])
    return result


def lowest(values: Sequence[float | int], period: int) -> list[float | None]:
    series = _as_float_list(values)
    if period <= 0:
        raise ValueError("period must be greater than zero")
    result = _none_series(len(series))
    for index in range(period - 1, len(series)):
        result[index] = min(series[index - period + 1 : index + 1])
    return result


def stochastic(
    high: Sequence[float | int],
    low: Sequence[float | int],
    close: Sequence[float | int],
    k_period: int = 14,
    d_period: int = 3,
) -> tuple[list[float | None], list[float | None]]:
    high_series = _as_float_list(high)
    low_series = _as_float_list(low)
    close_series = _as_float_list(close)
    length = min(len(high_series), len(low_series), len(close_series))
    if k_period <= 0 or d_period <= 0:
        raise ValueError("periods must be greater than zero")
    k_values = _none_series(length)
    for index in range(k_period - 1, length):
        window_high = max(high_series[index - k_period + 1 : index + 1])
        window_low = min(low_series[index - k_period + 1 : index + 1])
        if window_high == window_low:
            k_values[index] = 0.0
        else:
            k_values[index] = ((close_series[index] - window_low) / (window_high - window_low)) * 100
    first_valid_index = next((index for index, value in enumerate(k_values) if value is not None), None)
    if first_valid_index is None:
        return k_values, _none_series(length)
    d_values = [None] * first_valid_index + sma(
        [value for value in k_values[first_valid_index:] if value is not None], d_period
    )
    return k_values, d_values


def stoch_rsi(
    values: Sequence[float | int],
    rsi_period: int = 14,
    stoch_period: int = 14,
    k_period: int = 3,
    d_period: int = 3,
) -> tuple[list[float | None], list[float | None]]:
    rsi_values = rsi(values, rsi_period)
    first_rsi_index = next((index for index, value in enumerate(rsi_values) if value is not None), None)
    if first_rsi_index is None:
        none_line = _none_series(len(rsi_values))
        return none_line, none_line
    raw_values = rsi_values[first_rsi_index:]
    raw_stoch = _none_series(len(rsi_values))
    for index in range(stoch_period - 1, len(raw_values)):
        window = [value for value in raw_values[index - stoch_period + 1 : index + 1] if value is not None]
        if not window:
            continue
        lowest_value = min(window)
        highest_value = max(window)
        absolute_index = first_rsi_index + index
        if highest_value == lowest_value:
            raw_stoch[absolute_index] = 0.0
        else:
            raw_stoch[absolute_index] = ((raw_values[index] - lowest_value) / (highest_value - lowest_value)) * 100
    first_stoch_index = next((index for index, value in enumerate(raw_stoch) if value is not None), None)
    if first_stoch_index is None:
        none_line = _none_series(len(raw_stoch))
        return none_line, none_line
    k_values = [None] * first_stoch_index + sma(
        [value for value in raw_stoch[first_stoch_index:] if value is not None], k_period
    )
    first_k_index = next((index for index, value in enumerate(k_values) if value is not None), None)
    if first_k_index is None:
        none_line = _none_series(len(k_values))
        return k_values, none_line
    d_values = [None] * first_k_index + sma(
        [value for value in k_values[first_k_index:] if value is not None], d_period
    )
    return k_values, d_values


def adx(
    high: Sequence[float | int],
    low: Sequence[float | int],
    close: Sequence[float | int],
    period: int = 14,
) -> list[float | None]:
    high_series = _as_float_list(high)
    low_series = _as_float_list(low)
    close_series = _as_float_list(close)
    if period <= 0:
        raise ValueError("period must be greater than zero")
    length = min(len(high_series), len(low_series), len(close_series))
    if length == 0:
        return []
    true_range = _none_series(length)
    plus_dm = [0.0] * length
    minus_dm = [0.0] * length
    true_range[0] = high_series[0] - low_series[0]
    for index in range(1, length):
        up_move = high_series[index] - high_series[index - 1]
        down_move = low_series[index - 1] - low_series[index]
        plus_dm[index] = up_move if up_move > down_move and up_move > 0 else 0.0
        minus_dm[index] = down_move if down_move > up_move and down_move > 0 else 0.0
        true_range[index] = max(
            high_series[index] - low_series[index],
            fabs(high_series[index] - close_series[index - 1]),
            fabs(low_series[index] - close_series[index - 1]),
        )
    dx = _none_series(length)
    for index in range(period - 1, length):
        tr_sum = sum(true_range[index - period + 1 : index + 1])
        plus_sum = sum(plus_dm[index - period + 1 : index + 1])
        minus_sum = sum(minus_dm[index - period + 1 : index + 1])
        if tr_sum == 0:
            dx[index] = 0.0
            continue
        plus_di = 100 * (plus_sum / tr_sum)
        minus_di = 100 * (minus_sum / tr_sum)
        denominator = plus_di + minus_di
        dx[index] = 0.0 if denominator == 0 else (100 * abs(plus_di - minus_di) / denominator)
    first_dx_index = next((index for index, value in enumerate(dx) if value is not None), None)
    if first_dx_index is None:
        return dx
    adx_values = [None] * first_dx_index + sma([value for value in dx[first_dx_index:] if value is not None], period)
    return adx_values


def cci(
    high: Sequence[float | int],
    low: Sequence[float | int],
    close: Sequence[float | int],
    period: int = 20,
) -> list[float | None]:
    high_series = _as_float_list(high)
    low_series = _as_float_list(low)
    close_series = _as_float_list(close)
    if period <= 0:
        raise ValueError("period must be greater than zero")
    length = min(len(high_series), len(low_series), len(close_series))
    result = _none_series(length)
    typical_price = [
        (high_series[index] + low_series[index] + close_series[index]) / 3 for index in range(length)
    ]
    for index in range(period - 1, length):
        window = typical_price[index - period + 1 : index + 1]
        mean = sum(window) / period
        mean_deviation = sum(abs(value - mean) for value in window) / period
        if mean_deviation == 0:
            result[index] = 0.0
        else:
            result[index] = (typical_price[index] - mean) / (0.015 * mean_deviation)
    return result


def roc(values: Sequence[float | int], period: int = 12) -> list[float | None]:
    series = _as_float_list(values)
    if period <= 0:
        raise ValueError("period must be greater than zero")
    result = _none_series(len(series))
    for index in range(period, len(series)):
        previous = series[index - period]
        if previous == 0:
            result[index] = 0.0
        else:
            result[index] = ((series[index] / previous) - 1) * 100
    return result


def obv(close: Sequence[float | int], volume: Sequence[float | int]) -> list[float]:
    close_series = _as_float_list(close)
    volume_series = _as_float_list(volume)
    length = min(len(close_series), len(volume_series))
    if length == 0:
        return []
    result = [0.0] * length
    for index in range(1, length):
        if close_series[index] > close_series[index - 1]:
            result[index] = result[index - 1] + volume_series[index]
        elif close_series[index] < close_series[index - 1]:
            result[index] = result[index - 1] - volume_series[index]
        else:
            result[index] = result[index - 1]
    return result


def crossover(left: Sequence[float | int], right: Sequence[float | int]) -> bool:
    return _cross(left, right, direction="over")


def crossunder(left: Sequence[float | int], right: Sequence[float | int]) -> bool:
    return _cross(left, right, direction="under")


def _cross(left: Sequence[float | int], right: Sequence[float | int], *, direction: str) -> bool:
    paired_values: list[tuple[float, float]] = []
    for left_value, right_value in zip(left, right):
        if left_value is None or right_value is None:
            continue
        paired_values.append((float(left_value), float(right_value)))
    if len(paired_values) < 2:
        return False
    previous_left, previous_right = paired_values[-2]
    current_left, current_right = paired_values[-1]
    if direction == "over":
        return previous_left <= previous_right and current_left > current_right
    return previous_left >= previous_right and current_left < current_right


class IndicatorSet:
    def sma(self, values: Sequence[float | int], period: int) -> list[float | None]:
        return sma(values, period)

    def ema(self, values: Sequence[float | int], period: int) -> list[float | None]:
        return ema(values, period)

    def wma(self, values: Sequence[float | int], period: int) -> list[float | None]:
        return wma(values, period)

    def rsi(self, values: Sequence[float | int], period: int = 14) -> list[float | None]:
        return rsi(values, period)

    def atr(
        self,
        high: Sequence[float | int],
        low: Sequence[float | int],
        close: Sequence[float | int],
        period: int = 14,
    ) -> list[float | None]:
        return atr(high, low, close, period)

    def macd(
        self,
        values: Sequence[float | int],
        fast: int = 12,
        slow: int = 26,
        signal: int = 9,
    ) -> tuple[list[float | None], list[float | None], list[float | None]]:
        return macd(values, fast, slow, signal)

    def bollinger_bands(
        self, values: Sequence[float | int], period: int = 20, stddev: float = 2
    ) -> tuple[list[float | None], list[float | None], list[float | None]]:
        return bollinger_bands(values, period, stddev)

    def stochastic(
        self,
        high: Sequence[float | int],
        low: Sequence[float | int],
        close: Sequence[float | int],
        k_period: int = 14,
        d_period: int = 3,
    ) -> tuple[list[float | None], list[float | None]]:
        return stochastic(high, low, close, k_period, d_period)

    def stoch_rsi(
        self,
        values: Sequence[float | int],
        rsi_period: int = 14,
        stoch_period: int = 14,
        k_period: int = 3,
        d_period: int = 3,
    ) -> tuple[list[float | None], list[float | None]]:
        return stoch_rsi(values, rsi_period, stoch_period, k_period, d_period)

    def adx(
        self,
        high: Sequence[float | int],
        low: Sequence[float | int],
        close: Sequence[float | int],
        period: int = 14,
    ) -> list[float | None]:
        return adx(high, low, close, period)

    def cci(
        self,
        high: Sequence[float | int],
        low: Sequence[float | int],
        close: Sequence[float | int],
        period: int = 20,
    ) -> list[float | None]:
        return cci(high, low, close, period)

    def roc(self, values: Sequence[float | int], period: int = 12) -> list[float | None]:
        return roc(values, period)

    def obv(self, close: Sequence[float | int], volume: Sequence[float | int]) -> list[float]:
        return obv(close, volume)

    def highest(self, values: Sequence[float | int], period: int) -> list[float | None]:
        return highest(values, period)

    def lowest(self, values: Sequence[float | int], period: int) -> list[float | None]:
        return lowest(values, period)

    def crossover(self, left: Sequence[float | int], right: Sequence[float | int]) -> bool:
        return crossover(left, right)

    def crossunder(self, left: Sequence[float | int], right: Sequence[float | int]) -> bool:
        return crossunder(left, right)
