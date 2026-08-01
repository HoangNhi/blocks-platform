from tradelab_sdk.types import MarketType, PositionSide

def test_market_type_enum():
    assert MarketType.SPOT == "spot"
    assert MarketType.USD_M_FUTURES == "usd_m_futures"

def test_position_side_enum():
    assert PositionSide.LONG == "long"
    assert PositionSide.SHORT == "short"
