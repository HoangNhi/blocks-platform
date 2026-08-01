def on_candle(ctx):
    close = ctx.history["close"]
    fast = ctx.indicators.sma(close, 10)
    slow = ctx.indicators.sma(close, 30)

    if ctx.indicators.crossover(fast, slow):
        ctx.buy_market(percent=25)
    elif ctx.indicators.crossunder(fast, slow):
        ctx.sell_market(percent=100)

