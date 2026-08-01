from tradelab_sdk import StrategyContext


def on_candle(ctx: StrategyContext):
    close = ctx.history["close"]
    if len(close) < 21:
        return None

    fast = ctx.indicators.sma(close, 9)
    slow = ctx.indicators.sma(close, 21)

    if ctx.indicators.crossover(fast, slow):
        return ctx.buy_market(percent=100)

    if ctx.indicators.crossunder(fast, slow):
        return ctx.close_position()
