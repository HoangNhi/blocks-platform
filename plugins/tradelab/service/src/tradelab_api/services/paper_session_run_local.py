from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from sqlalchemy.orm import Session

from tradelab_api.services.paper_artifact_writer import SqlAlchemyPaperArtifactWriter
from tradelab_api.services.paper_engine import PaperEngineRunner
from tradelab_api.services.paper_engine_session_source import SqlAlchemyPaperEngineSessionSource
from tradelab_api.services.paper_engine_tick_local import (
    LOCAL_PAPER_ENGINE_ALLOWED_ENVIRONMENTS,
    LOCAL_PAPER_ENGINE_SAFETY_STATUS,
    MAX_LOCAL_PAPER_ENGINE_CANDLES_PER_TICK,
    _sanitize_error,
    _sanitize_worker_id,
)
from tradelab_api.services.paper_kill_switch import (
    build_paper_kill_switch_status,
    request_cancel_by_kill_switch,
    write_run_blocked_by_kill_switch,
)
from tradelab_api.services.paper_session_cancel_local import LocalPaperCancelProvider
from tradelab_api.services.paper_session_repository import PaperSessionRepository
from tradelab_api.services.paper_strategy_adapter import (
    PaperStrategySourceResolver,
    SubprocessPaperStrategySignalProvider,
)

DEFAULT_PAPER_SESSION_RUN_LOCAL_WORKER_ID = "strategy-lab-local-paper-run"
TERMINAL_STATUSES = {"completed", "failed", "cancelled"}

@dataclass(frozen=True)
class PaperSessionRunLocalRequestData:
    confirm_local_paper_run: bool
    max_candles_per_tick: int = MAX_LOCAL_PAPER_ENGINE_CANDLES_PER_TICK
    worker_id: str = DEFAULT_PAPER_SESSION_RUN_LOCAL_WORKER_ID

@dataclass(frozen=True)
class PaperSessionRunLocalResult:
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

class TargetPaperEngineSessionSource:
    def __init__(
        self,
        inner: SqlAlchemyPaperEngineSessionSource,
        *,
        session_id: UUID,
        max_candles_per_tick: int,
    ) -> None:
        self.inner = inner
        self.session_id = session_id
        self.max_candles_per_tick = max_candles_per_tick

    def has_running_session(self) -> bool:
        return self.inner.has_running_session()

    def claim_next_queued_session(self):
        return self.inner.claim_queued_session_by_id(
            self.session_id,
            max_candles_per_tick=self.max_candles_per_tick,
        )

    def mark_terminal(
        self,
        session_id: str,
        status: str,
        reason_code: str,
        error_message: str | None = None,
    ) -> None:
        self.inner.mark_terminal(session_id, status, reason_code, error_message)

def execute_local_paper_session_run(
    session: Session,
    *,
    settings: object,
    session_id: UUID,
    request: PaperSessionRunLocalRequestData,
) -> PaperSessionRunLocalResult:
    worker_id = _sanitize_worker_id(request.worker_id or DEFAULT_PAPER_SESSION_RUN_LOCAL_WORKER_ID)
    details = {
        "workerId": worker_id,
        "maxCandlesPerTick": request.max_candles_per_tick,
    }
    blocked = _validate_guards(settings=settings, request=request)
    if blocked is not None:
        return PaperSessionRunLocalResult(
            status="blocked",
            reason_code=blocked,
            details=details if blocked == "paper_engine_invalid_max_candles_per_tick" else {},
            semantic_status_code=_semantic_status_code(blocked),
        )
    kill_switch_status = build_paper_kill_switch_status(settings)

    source = _build_source(session, worker_id=worker_id)
    session_status = source.get_paper_session_status(session_id)
    if session_status is None:
        return PaperSessionRunLocalResult(
            status="blocked",
            reason_code="paper_local_run_session_not_found",
            semantic_status_code=404,
        )
    if kill_switch_status.enabled:
        paper_repository = PaperSessionRepository(session)
        row = paper_repository.get_paper_session_for_update(session_id)
        if row is not None and row.status == "running":
            request_cancel_by_kill_switch(paper_repository, row, actor=worker_id, status=kill_switch_status)
            return PaperSessionRunLocalResult(
                status="cancel_requested",
                reason_code="paper_kill_switch_cancel_requested",
                safety_status="local_dev_paper_kill_switch",
                session_id=str(session_id),
                details={**details, "killSwitch": {"enabled": True, "reasonCode": kill_switch_status.reason_code}},
                should_commit=True,
                semantic_status_code=200,
            )
        if row is not None and row.status == "queued":
            write_run_blocked_by_kill_switch(paper_repository, row, actor=worker_id, status=kill_switch_status)
            return PaperSessionRunLocalResult(
                status="blocked",
                reason_code="paper_kill_switch_enabled",
                safety_status="local_dev_paper_kill_switch",
                session_id=str(session_id),
                details={**details, "killSwitch": {"enabled": True, "reasonCode": kill_switch_status.reason_code}},
                should_commit=True,
                semantic_status_code=409,
            )
    if session_status != "queued":
        return PaperSessionRunLocalResult(
            status="blocked",
            reason_code="paper_local_run_session_not_queued",
            session_id=str(session_id),
            details={**details, "currentStatus": session_status},
            semantic_status_code=409,
        )
    if source.has_running_session():
        return PaperSessionRunLocalResult(
            status="busy",
            reason_code="paper_local_run_already_running",
            details=details,
            semantic_status_code=409,
        )

    try:
        runner = _build_runner(
            session,
            session_id=session_id,
            worker_id=worker_id,
            max_candles_per_tick=request.max_candles_per_tick,
            kill_switch_enabled=kill_switch_status.enabled,
        )
        tick_result = runner.tick(max_candles_per_tick=request.max_candles_per_tick)
    except Exception as exc:
        return PaperSessionRunLocalResult(
            status="failed",
            reason_code="paper_engine_unexpected_error",
            details={**details, "errorMessage": _sanitize_error(exc)},
            should_rollback=True,
            semantic_status_code=500,
        )

    reason_code = _map_engine_reason_code(tick_result.reason_code)
    return PaperSessionRunLocalResult(
        status=tick_result.status,
        reason_code=reason_code,
        safety_status=LOCAL_PAPER_ENGINE_SAFETY_STATUS,
        session_id=tick_result.session_id,
        candles_processed=tick_result.candles_processed,
        orders_created=tick_result.orders_created,
        fills_created=tick_result.fills_created,
        snapshots_created=tick_result.snapshots_created,
        details=details,
        should_commit=tick_result.session_id is not None and tick_result.status in TERMINAL_STATUSES,
        semantic_status_code=_semantic_status_code(reason_code),
    )

def _validate_guards(*, settings: object, request: PaperSessionRunLocalRequestData) -> str | None:
    environment = str(getattr(settings, "tradelab_environment", "local") or "local").strip().lower()
    if environment not in LOCAL_PAPER_ENGINE_ALLOWED_ENVIRONMENTS:
        return "paper_local_run_environment_not_allowed"
    if not bool(getattr(settings, "tradelab_local_paper_engine_enabled", False)):
        return "paper_local_run_not_enabled"
    if request.confirm_local_paper_run is not True:
        return "paper_local_run_confirmation_required"
    if request.max_candles_per_tick < 1 or request.max_candles_per_tick > MAX_LOCAL_PAPER_ENGINE_CANDLES_PER_TICK:
        return "paper_engine_invalid_max_candles_per_tick"
    return None

def _build_source(session: Session, *, worker_id: str) -> SqlAlchemyPaperEngineSessionSource:
    return SqlAlchemyPaperEngineSessionSource(session, worker_id=worker_id)

def _build_runner(
    session: Session,
    *,
    session_id: UUID,
    worker_id: str,
    max_candles_per_tick: int,
    kill_switch_enabled: bool = False,
) -> PaperEngineRunner:
    inner_source = SqlAlchemyPaperEngineSessionSource(session, worker_id=worker_id)
    return PaperEngineRunner(
        session_source=TargetPaperEngineSessionSource(
            inner_source,
            session_id=session_id,
            max_candles_per_tick=max_candles_per_tick,
        ),
        strategy_provider=SubprocessPaperStrategySignalProvider(
            source_resolver=PaperStrategySourceResolver(session),
        ),
        cancel_provider=LocalPaperCancelProvider(inner_source, kill_switch_enabled=kill_switch_enabled),
        artifact_writer=SqlAlchemyPaperArtifactWriter(session, actor=worker_id),
        worker_id=worker_id,
        safety_status=LOCAL_PAPER_ENGINE_SAFETY_STATUS,
    )

def _map_engine_reason_code(reason_code: str) -> str:
    if reason_code == "paper_engine_already_running":
        return "paper_local_run_already_running"
    if reason_code == "paper_engine_no_queued_session":
        return "paper_local_run_session_not_queued"
    return reason_code

def _semantic_status_code(reason_code: str) -> int:
    if reason_code in {"paper_local_run_not_enabled", "paper_local_run_environment_not_allowed"}:
        return 403
    if reason_code in {"paper_local_run_confirmation_required", "paper_engine_invalid_max_candles_per_tick"}:
        return 400
    if reason_code == "paper_local_run_session_not_found":
        return 404
    if reason_code in {"paper_local_run_session_not_queued", "paper_local_run_already_running"}:
        return 409
    if reason_code == "paper_engine_unexpected_error":
        return 500
    return 200
