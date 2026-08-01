from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.orm import Session

from tradelab_api.services.paper_artifact_writer import SqlAlchemyPaperArtifactWriter
from tradelab_api.services.paper_engine import (
    PaperEngineAction,
    PaperEngineRunner,
)
from tradelab_api.services.paper_kill_switch import build_paper_kill_switch_status

LOCAL_PAPER_ENGINE_ALLOWED_ENVIRONMENTS = {"local", "dev", "test"}
LOCAL_PAPER_ENGINE_SAFETY_STATUS = "local_dev_paper_engine_tick"
MAX_LOCAL_PAPER_ENGINE_CANDLES_PER_TICK = 10000
DEFAULT_LOCAL_PAPER_ENGINE_WORKER_ID = "local-paper-engine"
SECRET_MARKERS = ("secret", "token", "password", "apikey", "api_key", "privatekey", "private_key", "passphrase")

@dataclass(frozen=True)
class PaperEngineTickLocalRequestData:
    confirm_local_paper_engine_tick: bool
    max_candles_per_tick: int = MAX_LOCAL_PAPER_ENGINE_CANDLES_PER_TICK
    worker_id: str = DEFAULT_LOCAL_PAPER_ENGINE_WORKER_ID

@dataclass(frozen=True)
class PaperEngineTickLocalResult:
    status: str
    reason_code: str
    safety_status: str = LOCAL_PAPER_ENGINE_SAFETY_STATUS
    session_id: str | None = None
    candles_processed: int = 0
    orders_created: int = 0
    fills_created: int = 0
    snapshots_created: int = 0
    details: dict[str, Any] = field(default_factory=dict)
    should_commit: bool = False
    should_rollback: bool = False
    semantic_status_code: int = 200

class NoOpPaperStrategySignalProvider:
    def actions_for_candle(self, context, candle_history, candle_index) -> list[PaperEngineAction]:
        return []

class LocalPaperCancelProvider:
    def __init__(self, *, kill_switch_enabled: bool = False) -> None:
        self._kill_switch_enabled = kill_switch_enabled

    def should_cancel(self, session_id: str) -> bool:
        return False

    def kill_switch_enabled(self) -> bool:
        return self._kill_switch_enabled

def execute_local_paper_engine_tick(
    session: Session,
    *,
    settings: object,
    request: PaperEngineTickLocalRequestData,
) -> PaperEngineTickLocalResult:
    blocked = _validate_guards(settings=settings, request=request)
    worker_id = _sanitize_worker_id(request.worker_id)
    details = {
        "workerId": worker_id,
        "maxCandlesPerTick": request.max_candles_per_tick,
    }
    if blocked is not None:
        return PaperEngineTickLocalResult(
            status="blocked",
            reason_code=blocked,
            details=details if blocked == "paper_engine_invalid_max_candles_per_tick" else {},
        )
    kill_switch_status = build_paper_kill_switch_status(settings)

    try:
        runner = _build_runner(session, worker_id=worker_id, kill_switch_enabled=kill_switch_status.enabled)
        tick_result = runner.tick(max_candles_per_tick=request.max_candles_per_tick)
    except Exception as exc:
        return PaperEngineTickLocalResult(
            status="failed",
            reason_code="paper_engine_unexpected_error",
            details={**details, "errorMessage": _sanitize_error(exc)},
            should_rollback=True,
            semantic_status_code=500,
        )

    should_commit = tick_result.session_id is not None and tick_result.status in {"completed", "failed", "cancelled"}
    return PaperEngineTickLocalResult(
        status=tick_result.status,
        reason_code=tick_result.reason_code,
        safety_status=LOCAL_PAPER_ENGINE_SAFETY_STATUS,
        session_id=tick_result.session_id,
        candles_processed=tick_result.candles_processed,
        orders_created=tick_result.orders_created,
        fills_created=tick_result.fills_created,
        snapshots_created=tick_result.snapshots_created,
        details=details,
        should_commit=should_commit,
    )

def _validate_guards(*, settings: object, request: PaperEngineTickLocalRequestData) -> str | None:
    environment = str(getattr(settings, "tradelab_environment", "local") or "local").strip().lower()
    if environment not in LOCAL_PAPER_ENGINE_ALLOWED_ENVIRONMENTS:
        return "paper_engine_local_tick_environment_not_allowed"
    if not bool(getattr(settings, "tradelab_local_paper_engine_enabled", False)):
        return "paper_engine_local_tick_not_enabled"
    if request.confirm_local_paper_engine_tick is not True:
        return "paper_engine_local_tick_confirmation_required"
    if request.max_candles_per_tick < 1 or request.max_candles_per_tick > MAX_LOCAL_PAPER_ENGINE_CANDLES_PER_TICK:
        return "paper_engine_invalid_max_candles_per_tick"
    return None

def _build_runner(session: Session, *, worker_id: str, kill_switch_enabled: bool = False) -> PaperEngineRunner:
    from tradelab_api.services.paper_engine_session_source import SqlAlchemyPaperEngineSessionSource
    from tradelab_api.services.paper_strategy_adapter import (
        PaperStrategySourceResolver,
        SubprocessPaperStrategySignalProvider,
    )

    return PaperEngineRunner(
        session_source=SqlAlchemyPaperEngineSessionSource(session, worker_id=worker_id),
        strategy_provider=SubprocessPaperStrategySignalProvider(
            source_resolver=PaperStrategySourceResolver(session),
        ),
        cancel_provider=LocalPaperCancelProvider(kill_switch_enabled=kill_switch_enabled),
        artifact_writer=SqlAlchemyPaperArtifactWriter(session, actor=worker_id),
        worker_id=worker_id,
        safety_status=LOCAL_PAPER_ENGINE_SAFETY_STATUS,
    )

def _sanitize_worker_id(value: str | None) -> str:
    text = str(value or DEFAULT_LOCAL_PAPER_ENGINE_WORKER_ID).strip() or DEFAULT_LOCAL_PAPER_ENGINE_WORKER_ID
    text = text.replace(" ", "-")
    if any(marker in text.lower() for marker in SECRET_MARKERS):
        text = text.replace("apiSecret", "[REDACTED]").replace("secret", "[REDACTED]").replace("Secret", "[REDACTED]")
    return text[:80]

def _sanitize_error(exc: Exception) -> str:
    text = str(exc)
    if any(marker in text.lower() for marker in SECRET_MARKERS):
        return "[REDACTED]"
    return text[:400]
