import pytest
from pydantic import ValidationError
from tradelab_api.schemas.bot import BotCreate, ExecutionMode

def test_bot_create_rejects_futures_for_live():
    with pytest.raises(ValidationError) as exc:
        BotCreate(
            name="Test Bot",
            strategy_id="strat-1",
            dataset_id="dataset-1",
            execution_mode=ExecutionMode.LIVE,
            market_type="usd_m_futures"
        )
    assert "Futures are strictly restricted to backtest mode" in str(exc.value)

def test_bot_create_allows_futures_for_backtest():
    bot = BotCreate(
        name="Test Bot",
        strategy_id="strat-1",
        dataset_id="dataset-1",
        execution_mode=ExecutionMode.BACKTEST,
        market_type="usd_m_futures"
    )
    assert bot.market_type == "usd_m_futures"

def test_bot_create_rejects_futures_for_paper():
    with pytest.raises(ValidationError) as exc:
        BotCreate(
            name="Test Bot",
            strategy_id="strat-1",
            dataset_id="dataset-1",
            execution_mode=ExecutionMode.PAPER,
            market_type="usd_m_futures",
        )
    assert "Futures are strictly restricted to backtest mode" in str(exc.value)
