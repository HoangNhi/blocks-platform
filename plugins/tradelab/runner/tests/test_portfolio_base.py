# encoding: utf-8
import pytest
from tradelab_sdk.types import PositionSide
from tradelab_sdk.portfolio_base import BasePosition, BasePortfolioState

def test_base_position_instantiation():
    with pytest.raises(TypeError):
        BasePosition() # Không thể khởi tạo lớp trừu tượng (abstract)

def test_base_portfolio_instantiation():
    with pytest.raises(TypeError):
        BasePortfolioState(100.0) # Không thể khởi tạo lớp trừu tượng (abstract)
