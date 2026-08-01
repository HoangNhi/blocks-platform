from fastapi import APIRouter

from .bots import router as bots_router
from .exchange import router as exchange_router
from .indicators import router as indicators_router
from .paper import router as paper_router
from .live_credentials import router as live_credentials_router
from .live_orders import router as live_orders_router
from .strategies import router as strategies_router
from .testnet_credentials import router as testnet_credentials_router
from .testnet_orders import router as testnet_orders_router

router = APIRouter()
router.include_router(strategies_router)
router.include_router(indicators_router)
router.include_router(exchange_router)
router.include_router(bots_router)
router.include_router(paper_router)
router.include_router(live_credentials_router)
router.include_router(live_orders_router)
router.include_router(testnet_credentials_router)
router.include_router(testnet_orders_router)
