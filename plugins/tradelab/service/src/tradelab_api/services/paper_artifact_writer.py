from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from tradelab_api.db.models import (
    PaperAuditEvent,
    PaperFill,
    MarketCandle,
    PaperOrder,
    PaperPortfolioSnapshot,
    PaperPosition,
    PaperResumeCheckpoint,
    PaperSession,
)
from tradelab_api.services.paper_engine import (
    PaperEngineAuditArtifact,
    PaperEngineFillArtifact,
    PaperEngineOrderArtifact,
    PaperEnginePortfolioSnapshotArtifact,
    PaperEnginePositionArtifact,
    PaperEngineTickResult,
)

WRITER_VERSION = "phase-8.11"
VALID_ORDER_SIDES = {"buy", "sell"}
VALID_FILL_SIDES = {"buy", "sell"}
TERMINAL_ORDER_STATUSES = {"rejected", "filled", "cancelled"}
TERMINAL_SESSION_STATUSES = {"completed", "failed", "cancelled"}
SECRET_KEY_PARTS = (
    "secret",
    "password",
    "token",
    "apikey",
    "api_key",
    "privatekey",
    "private_key",
    "passphrase",
)


class PaperArtifactWriterError(Exception):
    def __init__(self, reason_code: str, message: str) -> None:
        super().__init__(message)
        self.reason_code = reason_code


class SqlAlchemyPaperArtifactWriter:
    def __init__(self, session: Session, *, actor: str = "paper-engine") -> None:
        self.session = session
        self.actor = actor

    def write(self, result: PaperEngineTickResult) -> None:
        paper_session = self._load_session(result)
        self._validate_artifact_identity(paper_session, result)
        now = _utcnow()
        order_ids_by_key = self._write_orders(paper_session, result.artifacts.orders, now)
        self._write_fills(paper_session, result.artifacts.fills, order_ids_by_key)
        self._write_positions(paper_session, result.artifacts.positions, now)
        snapshot_ids = self._write_snapshots(paper_session, result.artifacts.snapshots)
        self._write_audits(paper_session, result.artifacts.audits, now)
        self._write_resume_checkpoint(paper_session, result, snapshot_ids, now)
        self._update_session(paper_session, result, now)
        self.session.flush()

    def _load_session(self, result: PaperEngineTickResult) -> PaperSession:
        session_id = _uuid_or_none(result.session_id)
        if session_id is None:
            raise PaperArtifactWriterError(
                "paper_session_not_found",
                f"Paper session not found for session_id={result.session_id!r}.",
            )
        paper_session = self.session.get(PaperSession, session_id)
        if paper_session is None:
            raise PaperArtifactWriterError(
                "paper_session_not_found",
                f"Paper session not found for session_id={session_id}.",
            )
        return paper_session

    def _validate_artifact_identity(self, paper_session: PaperSession, result: PaperEngineTickResult) -> None:
        keys_by_kind = {
            PaperOrder: [order.artifact_key for order in result.artifacts.orders if order.side in VALID_ORDER_SIDES],
            PaperFill: [fill.artifact_key for fill in result.artifacts.fills],
            PaperPortfolioSnapshot: [snapshot.artifact_key for snapshot in result.artifacts.snapshots],
            PaperAuditEvent: [audit.artifact_key for audit in result.artifacts.audits],
        }
        seen: set[str] = set()
        for artifact_keys in keys_by_kind.values():
            for artifact_key in artifact_keys:
                if not artifact_key:
                    raise PaperArtifactWriterError(
                        "paper_artifact_identity_missing",
                        "Paper artifact identity is required for persisted paper artifacts.",
                    )
                if artifact_key in seen:
                    raise PaperArtifactWriterError(
                        "paper_artifact_duplicate",
                        f"Duplicate paper artifact_key={artifact_key!r} in writer payload.",
                    )
                seen.add(artifact_key)

        for model, artifact_keys in keys_by_kind.items():
            if not artifact_keys:
                continue
            existing_key = self.session.scalar(
                select(model.artifact_key)
                .where(
                    model.paper_session_id == paper_session.id,
                    model.artifact_key.in_(artifact_keys),
                )
                .limit(1)
            )
            if existing_key is not None:
                raise PaperArtifactWriterError(
                    "paper_artifact_duplicate",
                    f"Duplicate paper artifact_key={existing_key!r} already exists for session={paper_session.id}.",
                )

    def _write_orders(
        self,
        paper_session: PaperSession,
        orders: list[PaperEngineOrderArtifact],
        now: datetime,
    ) -> dict[str, UUID]:
        rows_by_key: dict[str, PaperOrder] = {}
        for order in orders:
            if order.side not in VALID_ORDER_SIDES:
                continue
            metadata = _sanitize_json(
                {
                    "orderKey": order.order_key,
                    "actionKind": order.action_kind,
                    "sourceCandleId": order.candle_id,
                    **order.metadata,
                }
            )
            row = PaperOrder(
                paper_session_id=paper_session.id,
                artifact_key=order.artifact_key,
                side=order.side,
                order_type=order.order_type,
                status=order.status,
                quantity=order.quantity,
                requested_price=None,
                requested_notional=order.requested_notional,
                submitted_at=now,
                finalized_at=now if order.status in TERMINAL_ORDER_STATUSES else None,
                reason_code=order.reason_code,
                metadata_=metadata,
                created_by=self.actor,
                updated_by=self.actor,
            )
            self.session.add(row)
            rows_by_key[order.order_key] = row
        self.session.flush()
        return {order_key: row.id for order_key, row in rows_by_key.items()}

    def _write_fills(
        self,
        paper_session: PaperSession,
        fills: list[PaperEngineFillArtifact],
        order_ids_by_key: dict[str, UUID],
    ) -> None:
        for fill in fills:
            paper_order_id = order_ids_by_key.get(fill.order_key)
            if paper_order_id is None:
                raise PaperArtifactWriterError(
                    "paper_artifact_order_link_missing",
                    f"Paper fill references missing order_key={fill.order_key!r}.",
                )
            if fill.side not in VALID_FILL_SIDES:
                raise PaperArtifactWriterError(
                    "paper_artifact_order_link_missing",
                    f"Paper fill references unsupported side for order_key={fill.order_key!r}.",
                )
            self.session.add(
                PaperFill(
                    paper_session_id=paper_session.id,
                    paper_order_id=paper_order_id,
                    artifact_key=fill.artifact_key,
                    source_candle_id=_uuid_or_none(fill.source_candle_id),
                    fill_time=fill.fill_time,
                    side=fill.side,
                    price=fill.price,
                    quantity=fill.quantity,
                    notional=fill.notional,
                    fee_amount=fill.fee_amount,
                    fee_asset="quote",
                    slippage_amount=fill.slippage_amount,
                    metadata_=_sanitize_json({"orderKey": fill.order_key, **fill.metadata}),
                    created_by=self.actor,
                )
            )

    def _write_positions(
        self,
        paper_session: PaperSession,
        positions: list[PaperEnginePositionArtifact],
        now: datetime,
    ) -> None:
        for position in positions:
            row = self.session.scalar(
                select(PaperPosition).where(
                    PaperPosition.paper_session_id == paper_session.id,
                    PaperPosition.symbol == position.symbol,
                )
            )
            metadata = _sanitize_json({"source": "paper-engine", "symbol": position.symbol})
            if row is None:
                row = PaperPosition(
                    paper_session_id=paper_session.id,
                    symbol=position.symbol,
                    side="long",
                    status=position.status,
                    quantity=position.quantity,
                    average_entry_price=position.average_entry_price,
                    realized_pnl=position.realized_pnl,
                    unrealized_pnl=position.unrealized_pnl,
                    opened_at=now if position.status == "open" else None,
                    closed_at=now if position.status == "closed" else None,
                    metadata_=metadata,
                    created_by=self.actor,
                    updated_by=self.actor,
                )
                self.session.add(row)
                continue
            row.side = "long"
            row.status = position.status
            row.quantity = position.quantity
            row.average_entry_price = position.average_entry_price
            row.realized_pnl = position.realized_pnl
            row.unrealized_pnl = position.unrealized_pnl
            if row.opened_at is None and position.status == "open":
                row.opened_at = now
            if position.status == "closed":
                row.closed_at = now
            row.metadata_ = metadata
            row.updated_at = now
            row.updated_by = self.actor

    def _write_snapshots(
        self,
        paper_session: PaperSession,
        snapshots: list[PaperEnginePortfolioSnapshotArtifact],
    ) -> list[UUID]:
        snapshot_ids: list[UUID] = []
        for snapshot in snapshots:
            row = PaperPortfolioSnapshot(
                paper_session_id=paper_session.id,
                artifact_key=snapshot.artifact_key,
                source_candle_id=_uuid_or_none(snapshot.source_candle_id),
                snapshot_at=snapshot.snapshot_at,
                cash_balance=snapshot.cash_balance,
                equity=snapshot.equity,
                realized_pnl=snapshot.realized_pnl,
                unrealized_pnl=snapshot.unrealized_pnl,
                fees_paid=snapshot.fees_paid,
                drawdown_pct=snapshot.drawdown_pct,
                exposure_notional=snapshot.exposure_notional,
                metadata_=_sanitize_json(snapshot.metadata),
                created_by=self.actor,
            )
            self.session.add(row)
            self.session.flush()
            snapshot_ids.append(row.id)
        return snapshot_ids

    def _write_audits(
        self,
        paper_session: PaperSession,
        audits: list[PaperEngineAuditArtifact],
        now: datetime,
    ) -> None:
        for audit in audits:
            metadata = _sanitize_json(audit.metadata)
            self.session.add(
                PaperAuditEvent(
                    paper_session_id=paper_session.id,
                    artifact_key=audit.artifact_key,
                    event_at=_datetime_or_now(metadata.get("eventAt"), now),
                    actor=_str_or_none(metadata.get("actor")) or self.actor,
                    action=audit.action,
                    target_type=_str_or_none(metadata.get("targetType")) or "paper_session",
                    target_id=_uuid_or_none(metadata.get("targetId")),
                    old_state=audit.old_state,
                    new_state=audit.new_state,
                    reason_code=audit.reason_code,
                    correlation_id=_str_or_none(metadata.get("correlationId")),
                    request_id=_str_or_none(metadata.get("requestId")),
                    metadata_=metadata,
                    created_by=self.actor,
                )
            )

    def _write_resume_checkpoint(
        self,
        paper_session: PaperSession,
        result: PaperEngineTickResult,
        snapshot_ids: list[UUID],
        now: datetime,
    ) -> None:
        if not result.artifacts.snapshots:
            return
        latest_snapshot = result.artifacts.snapshots[-1]
        attempt_no = _attempt_no_from_artifacts(result)
        next_candle = self.session.scalar(
            select(MarketCandle)
            .where(
                MarketCandle.exchange == paper_session.exchange,
                MarketCandle.symbol == paper_session.symbol,
                MarketCandle.timeframe == paper_session.timeframe,
                MarketCandle.open_time > latest_snapshot.snapshot_at,
                MarketCandle.open_time <= paper_session.end_at,
            )
            .order_by(MarketCandle.open_time.asc())
            .limit(1)
        )
        row = self.session.scalar(
            select(PaperResumeCheckpoint).where(
                PaperResumeCheckpoint.paper_session_id == paper_session.id,
                PaperResumeCheckpoint.attempt_no == attempt_no,
            )
        )
        values = {
            "last_processed_candle_id": _uuid_or_none(latest_snapshot.source_candle_id),
            "last_processed_candle_open_time": latest_snapshot.snapshot_at,
            "last_processed_snapshot_id": snapshot_ids[-1] if snapshot_ids else None,
            "next_candle_id": next_candle.id if next_candle is not None else None,
            "next_candle_open_time": next_candle.open_time if next_candle is not None else None,
            "cash_balance": latest_snapshot.cash_balance,
            "equity": latest_snapshot.equity,
            "realized_pnl": latest_snapshot.realized_pnl,
            "unrealized_pnl": latest_snapshot.unrealized_pnl,
            "fees_paid": latest_snapshot.fees_paid,
            "exposure_notional": latest_snapshot.exposure_notional,
            "open_position_quantity": _open_position_quantity(result),
            "average_entry_price": _average_entry_price(result),
            "peak_equity": latest_snapshot.equity,
            "max_drawdown_pct": latest_snapshot.drawdown_pct,
            "pending_orders_count": _pending_orders_count(result),
            "strategy_runtime_state_status": "stateless_between_candles" if next_candle is not None else "unsupported",
            "checkpoint_source": "persisted",
            "reason_code": result.reason_code,
            "metadata_": _sanitize_json(
                {
                    "source": "paper-artifact-writer",
                    "safetyStatus": result.safety_status,
                    "writerVersion": WRITER_VERSION,
                }
            ),
            "updated_at": now,
            "updated_by": self.actor,
            "is_active": True,
            "is_deleted": False,
        }
        if row is None:
            row = PaperResumeCheckpoint(
                paper_session_id=paper_session.id,
                attempt_no=attempt_no,
                created_by=self.actor,
                **values,
            )
            self.session.add(row)
            return
        for key, value in values.items():
            setattr(row, key, value)

    def _update_session(self, paper_session: PaperSession, result: PaperEngineTickResult, now: datetime) -> None:
        paper_session.status = result.status
        paper_session.reason_code = result.reason_code
        paper_session.error_message = result.error_message
        if paper_session.started_at is None:
            paper_session.started_at = now
        if result.status in TERMINAL_SESSION_STATUSES:
            paper_session.finished_at = now
        gate_context = dict(paper_session.gate_context or {})
        gate_context["paperEngineSummary"] = {
            "candlesProcessed": result.candles_processed,
            "ordersCreated": result.orders_created,
            "fillsCreated": result.fills_created,
            "snapshotsCreated": result.snapshots_created,
            "startingCash": _decimal_or_none(result.starting_cash),
            "endingCash": _decimal_or_none(result.ending_cash),
            "endingEquity": _decimal_or_none(result.ending_equity),
            "safetyStatus": result.safety_status,
            "writerVersion": WRITER_VERSION,
        }
        paper_session.gate_context = _sanitize_json(gate_context)
        paper_session.updated_at = now
        paper_session.updated_by = self.actor


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _uuid_or_none(value: object) -> UUID | None:
    if value is None:
        return None
    try:
        return UUID(str(value))
    except (TypeError, ValueError, AttributeError):
        return None


def _datetime_or_now(value: object, fallback: datetime) -> datetime:
    return value if isinstance(value, datetime) else fallback


def _str_or_none(value: object) -> str | None:
    if value is None:
        return None
    return str(value)


def _decimal_or_none(value: Decimal | None) -> str | None:
    return str(value) if value is not None else None


def _attempt_no_from_artifacts(result: PaperEngineTickResult) -> int:
    for artifact_key in _artifact_keys(result):
        parts = artifact_key.split(":")
        if "attempt" not in parts:
            continue
        attempt_index = parts.index("attempt") + 1
        if attempt_index >= len(parts):
            continue
        try:
            return int(parts[attempt_index])
        except ValueError:
            continue
    return 0

def _artifact_keys(result: PaperEngineTickResult) -> list[str]:
    return [
        *(order.artifact_key for order in result.artifacts.orders if order.side in VALID_ORDER_SIDES),
        *(fill.artifact_key for fill in result.artifacts.fills),
        *(snapshot.artifact_key for snapshot in result.artifacts.snapshots),
        *(audit.artifact_key for audit in result.artifacts.audits),
    ]

def _open_position_quantity(result: PaperEngineTickResult) -> Decimal:
    return sum(
        (position.quantity for position in result.artifacts.positions if position.status == "open"),
        Decimal("0"),
    )

def _average_entry_price(result: PaperEngineTickResult) -> Decimal | None:
    for position in reversed(result.artifacts.positions):
        if position.status == "open" and position.average_entry_price is not None:
            return position.average_entry_price
    return None

def _pending_orders_count(result: PaperEngineTickResult) -> int:
    if result.status in TERMINAL_SESSION_STATUSES:
        return 0
    return sum(1 for order in result.artifacts.orders if order.status not in TERMINAL_ORDER_STATUSES)

def _is_secret_key(key: object) -> bool:
    normalized = str(key).replace("-", "_").lower()
    return any(part in normalized for part in SECRET_KEY_PARTS)


def _sanitize_json(value: object) -> Any:
    if isinstance(value, dict):
        return {
            str(key): "[REDACTED]" if _is_secret_key(key) else _sanitize_json(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_sanitize_json(item) for item in value]
    if isinstance(value, tuple):
        return [_sanitize_json(item) for item in value]
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, str | int | float | bool) or value is None:
        return value
    return str(value)
