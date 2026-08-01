from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import case, desc, func, select
from sqlalchemy.orm import Session, joinedload

from tradelab_api.db.models import (
    LiveOrderEvent,
    LiveOrderIntent,
    LiveOrderPreview,
    LiveReconciliationAttempt,
)
from tradelab_api.services.credential_redaction import sanitize_credential_payload
from tradelab_api.services.live_order_state import hash_idempotency_key


class LiveOrderStateRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get_or_create_pilot_control(self) -> object:
        from tradelab_api.db.models import LivePilotControl

        statement = select(LivePilotControl).where(
            LivePilotControl.exchange == "binance",
            LivePilotControl.environment == "binance_live",
            LivePilotControl.is_active.is_(True),
            LivePilotControl.is_deleted.is_(False),
        )
        pilot = self.session.scalars(statement).first()
        if pilot is not None:
            if getattr(pilot, "proof_window_status", None) is None:
                pilot.proof_window_status = "closed"
            if getattr(pilot, "proof_window_remaining_intent_budget", None) is None:
                pilot.proof_window_remaining_intent_budget = 0
            return pilot
        pilot = LivePilotControl(
            exchange="binance",
            environment="binance_live",
            status="ready",
            proof_window_status="closed",
            proof_window_remaining_intent_budget=0,
            created_by="system",
        )
        self.session.add(pilot)
        self.session.flush()
        return pilot

    def has_unresolved_proof_window_debt(self) -> bool:
        statement = select(func.count()).select_from(LiveOrderIntent).where(
            LiveOrderIntent.is_active.is_(True),
            LiveOrderIntent.is_deleted.is_(False),
            (
                LiveOrderIntent.status.in_(["unknown", "reconciliation_required"])
                | LiveOrderIntent.reconciliation_required.is_(True)
            ),
        )
        return int(self.session.execute(statement).scalar_one() or 0) > 0

    def activate_hard_stop(self, *, reason_code: str, active_intent_id: UUID | None, actor: str) -> object:
        pilot = self.get_or_create_pilot_control()
        pilot.status = "hard_stop"
        pilot.hard_stop_reason_code = reason_code
        pilot.active_intent_id = active_intent_id
        pilot.updated_by = actor
        self.session.flush()
        return pilot

    def reopen_after_hard_stop(self, *, actor: str, confirm_reopen: bool) -> object:
        pilot = self.get_or_create_pilot_control()
        if not confirm_reopen:
            return pilot
        pilot.status = "ready"
        pilot.hard_stop_reason_code = None
        pilot.active_intent_id = None
        pilot.reopened_at = datetime.now(UTC)
        pilot.reopened_by = actor
        pilot.updated_by = actor
        self.session.flush()
        return pilot

    def open_proof_window(self, *, actor: str, reason: str, ttl_seconds: int, intent_budget: int) -> object:
        pilot = self.get_or_create_pilot_control()
        now = datetime.now(UTC)
        pilot.proof_window_status = "open"
        pilot.proof_window_opened_at = now
        pilot.proof_window_opened_by = actor
        pilot.proof_window_expires_at = now + timedelta(seconds=ttl_seconds)
        pilot.proof_window_remaining_intent_budget = intent_budget
        pilot.proof_window_reason = reason
        pilot.proof_window_closed_at = None
        pilot.proof_window_closed_by = None
        pilot.proof_window_closed_reason = None
        pilot.updated_by = actor
        self.session.flush()
        return pilot

    def consume_proof_window(self, *, actor: str, active_intent_id: UUID, reason: str) -> object:
        pilot = self.get_or_create_pilot_control()
        pilot.proof_window_status = "consumed"
        pilot.proof_window_remaining_intent_budget = 0
        pilot.active_intent_id = active_intent_id
        pilot.proof_window_closed_at = datetime.now(UTC)
        pilot.proof_window_closed_by = actor
        pilot.proof_window_closed_reason = reason
        pilot.updated_by = actor
        self.session.flush()
        return pilot

    def close_proof_window(self, *, actor: str, reason: str) -> object:
        pilot = self.get_or_create_pilot_control()
        pilot.proof_window_status = "closed"
        pilot.proof_window_remaining_intent_budget = 0
        pilot.proof_window_closed_at = datetime.now(UTC)
        pilot.proof_window_closed_by = actor
        pilot.proof_window_closed_reason = reason
        pilot.updated_by = actor
        self.session.flush()
        return pilot

    def expire_proof_window_if_needed(self, *, actor: str) -> object:
        pilot = self.get_or_create_pilot_control()
        if (
            pilot.proof_window_status == "open"
            and pilot.proof_window_expires_at is not None
            and pilot.proof_window_expires_at <= datetime.now(UTC)
        ):
            pilot.proof_window_status = "expired"
            pilot.proof_window_remaining_intent_budget = 0
            pilot.proof_window_closed_at = datetime.now(UTC)
            pilot.proof_window_closed_by = actor
            pilot.proof_window_closed_reason = "proof_window_ttl_expired"
            pilot.updated_by = actor
            self.session.flush()
        return pilot

    def count_active_non_terminal_live_intents(self, *, exclude_intent_id: UUID | None = None) -> int:
        statement = select(func.count()).select_from(LiveOrderIntent).where(
            LiveOrderIntent.is_active.is_(True),
            LiveOrderIntent.is_deleted.is_(False),
            LiveOrderIntent.status.in_(
                [
                    "draft_previewed",
                    "confirmed",
                    "submitting",
                    "submitted",
                    "partially_filled",
                    "unknown",
                    "reconciliation_required",
                    "cancel_requested",
                ]
            ),
        )
        if exclude_intent_id is not None:
            statement = statement.where(LiveOrderIntent.id != exclude_intent_id)
        return int(self.session.execute(statement).scalar_one() or 0)

    def create_intent(
        self,
        *,
        intent_key: str,
        strategy_id: UUID,
        strategy_version_id: UUID,
        source_run_id: UUID | None,
        source_signal_package_id: str | None,
        credential_ref_id: UUID,
        environment: str,
        exchange: str,
        market_type: str,
        symbol: str,
        side: str,
        order_type: str,
        quantity: Decimal | None,
        quote_quantity: Decimal | None,
        client_order_id: str,
        status: str,
        status_reason_code: str | None,
        metadata: dict[str, Any],
        actor: str,
    ) -> LiveOrderIntent:
        row = LiveOrderIntent(
            intent_key=intent_key,
            strategy_id=strategy_id,
            strategy_version_id=strategy_version_id,
            source_run_id=source_run_id,
            source_signal_package_id=source_signal_package_id,
            credential_ref_id=credential_ref_id,
            environment=environment,
            exchange=exchange,
            market_type=market_type,
            symbol=symbol,
            side=side,
            order_type=order_type,
            quantity=quantity,
            quote_quantity=quote_quantity,
            client_order_id=client_order_id,
            status=status,
            status_reason_code=status_reason_code,
            reconciliation_required=False,
            metadata_=sanitize_credential_payload(metadata),
            created_by=actor,
        )
        self.session.add(row)
        self.session.flush()
        return row

    def create_preview(
        self,
        *,
        intent_id: UUID,
        preview_key: str,
        status: str,
        reason_code: str | None,
        symbol: str,
        side: str,
        order_type: str,
        quantity: Decimal | None,
        quote_quantity: Decimal | None,
        estimated_notional: Decimal | None,
        estimated_fee: Decimal | None,
        risk_snapshot: dict[str, Any],
        credential_snapshot: dict[str, Any],
        source_snapshot: dict[str, Any],
        expires_at: datetime | None,
        metadata: dict[str, Any],
        actor: str,
    ) -> LiveOrderPreview:
        row = LiveOrderPreview(
            intent_id=intent_id,
            preview_key=preview_key,
            status=status,
            reason_code=reason_code,
            symbol=symbol,
            side=side,
            order_type=order_type,
            quantity=quantity,
            quote_quantity=quote_quantity,
            estimated_notional=estimated_notional,
            estimated_fee=estimated_fee,
            risk_snapshot=sanitize_credential_payload(risk_snapshot),
            credential_snapshot=sanitize_credential_payload(credential_snapshot),
            source_snapshot=sanitize_credential_payload(source_snapshot),
            expires_at=expires_at,
            metadata_=sanitize_credential_payload(metadata),
            created_by=actor,
        )
        self.session.add(row)
        self.session.flush()
        return row

    def set_latest_preview(self, intent: LiveOrderIntent, *, preview_id: UUID, actor: str) -> LiveOrderIntent:
        intent.latest_preview_id = preview_id
        intent.updated_by = actor
        self.session.flush()
        return intent

    def get_preview_with_intent(self, preview_id: UUID) -> tuple[LiveOrderPreview, LiveOrderIntent] | tuple[None, None]:
        statement = (
            select(LiveOrderPreview)
            .options(joinedload(LiveOrderPreview.intent))
            .where(
                LiveOrderPreview.id == preview_id,
                LiveOrderPreview.is_active.is_(True),
                LiveOrderPreview.is_deleted.is_(False),
            )
        )
        preview = self.session.scalars(statement).first()
        if preview is None or preview.intent is None:
            return None, None
        intent = preview.intent
        if not intent.is_active or intent.is_deleted:
            return None, None
        return preview, intent

    def update_intent_exchange_snapshot(
        self,
        intent: LiveOrderIntent,
        *,
        exchange_order_id: str | None,
        exchange_order_status: str | None,
        metadata: dict[str, Any],
        actor: str,
    ) -> LiveOrderIntent:
        intent.exchange_order_id = exchange_order_id
        intent.exchange_order_status = exchange_order_status
        if metadata:
            merged = dict(intent.metadata_ or {})
            merged.update(sanitize_credential_payload(metadata))
            intent.metadata_ = merged
        intent.updated_by = actor
        self.session.flush()
        return intent

    def get_latest_submit_event_by_idempotency_key(self, intent_id: UUID, idempotency_key: str) -> LiveOrderEvent | None:
        final_event_priority = case(
            (
                LiveOrderEvent.event_type.in_(
                    [
                        "live_order_submit_accepted",
                        "live_order_submit_rejected",
                        "live_order_submit_unknown_recorded",
                        "live_order_submit_blocked",
                    ]
                ),
                0,
            ),
            else_=1,
        )
        statement = (
            select(LiveOrderEvent)
            .where(
                LiveOrderEvent.intent_id == intent_id,
                LiveOrderEvent.idempotency_key_hash == hash_idempotency_key(idempotency_key),
                LiveOrderEvent.event_type.in_(
                    [
                        "live_order_submit_accepted",
                        "live_order_submit_rejected",
                        "live_order_submit_unknown_recorded",
                        "live_order_submit_blocked",
                        "live_order_submit_attempted",
                    ]
                ),
            )
            .order_by(final_event_priority, desc(LiveOrderEvent.created_at))
            .limit(1)
        )
        return self.session.scalars(statement).first()

    def get_latest_cancel_event_by_idempotency_key(self, intent_id: UUID, idempotency_key: str) -> LiveOrderEvent | None:
        final_event_priority = case(
            (
                LiveOrderEvent.event_type.in_(
                    [
                        "live_order_cancel_accepted",
                        "live_order_cancel_rejected",
                        "live_order_cancel_unknown_recorded",
                        "live_order_cancel_blocked",
                    ]
                ),
                0,
            ),
            else_=1,
        )
        statement = (
            select(LiveOrderEvent)
            .where(
                LiveOrderEvent.intent_id == intent_id,
                LiveOrderEvent.idempotency_key_hash == hash_idempotency_key(idempotency_key),
                LiveOrderEvent.event_type.in_(
                    [
                        "live_order_cancel_requested",
                        "live_order_cancel_accepted",
                        "live_order_cancel_rejected",
                        "live_order_cancel_unknown_recorded",
                        "live_order_cancel_blocked",
                    ]
                ),
            )
            .order_by(final_event_priority, desc(LiveOrderEvent.created_at))
            .limit(1)
        )
        return self.session.scalars(statement).first()

    def get_next_reconciliation_attempt_no(self, intent_id: UUID) -> int:
        statement = select(func.max(LiveReconciliationAttempt.attempt_no)).where(
            LiveReconciliationAttempt.intent_id == intent_id
        )
        latest = self.session.execute(statement).scalar_one_or_none()
        return int(latest) + 1 if latest is not None else 0

    def add_event(
        self,
        *,
        intent_id: UUID,
        preview_id: UUID | None,
        event_type: str,
        from_status: str | None,
        to_status: str | None,
        reason_code: str | None,
        idempotency_key: str | None,
        client_order_id: str | None,
        exchange_order_id: str | None,
        actor: str,
        metadata: dict[str, Any],
    ) -> LiveOrderEvent:
        created_at = datetime.now(UTC)
        latest_created_at = self.session.execute(
            select(func.max(LiveOrderEvent.created_at)).where(LiveOrderEvent.intent_id == intent_id)
        ).scalar_one_or_none()
        if latest_created_at is not None and created_at <= latest_created_at:
            created_at = latest_created_at + timedelta(microseconds=1)
        row = LiveOrderEvent(
            intent_id=intent_id,
            preview_id=preview_id,
            event_type=event_type,
            from_status=from_status,
            to_status=to_status,
            reason_code=reason_code,
            idempotency_key=idempotency_key,
            idempotency_key_hash=hash_idempotency_key(idempotency_key) if idempotency_key else None,
            client_order_id=client_order_id,
            exchange_order_id=exchange_order_id,
            actor=actor,
            metadata_=sanitize_credential_payload(metadata),
            created_at=created_at,
            created_by=actor,
        )
        self.session.add(row)
        self.session.flush()
        return row

    def add_reconciliation_attempt(
        self,
        *,
        intent_id: UUID,
        attempt_no: int,
        trigger: str,
        status: str,
        reason_code: str | None,
        exchange_order_status: str | None,
        fills_snapshot: dict[str, Any],
        metadata: dict[str, Any],
        actor: str,
    ) -> LiveReconciliationAttempt:
        row = LiveReconciliationAttempt(
            intent_id=intent_id,
            attempt_no=attempt_no,
            trigger=trigger,
            status=status,
            reason_code=reason_code,
            exchange_order_status=exchange_order_status,
            fills_snapshot=sanitize_credential_payload(fills_snapshot),
            metadata_=sanitize_credential_payload(metadata),
            created_by=actor,
        )
        self.session.add(row)
        self.session.flush()
        return row

    def update_intent_status(
        self,
        intent: LiveOrderIntent,
        *,
        status: str,
        reason_code: str | None,
        reconciliation_required: bool,
        actor: str,
    ) -> LiveOrderIntent:
        intent.status = status
        intent.status_reason_code = reason_code
        intent.reconciliation_required = reconciliation_required
        if status == "unknown" and intent.unknown_since is None:
            intent.unknown_since = datetime.now(UTC)
        intent.updated_by = actor
        self.session.flush()
        return intent

    def mark_journal_projected(
        self,
        intent: LiveOrderIntent,
        *,
        journal_entry_id: UUID,
        reason_code: str,
        actor: str,
    ) -> LiveOrderIntent:
        intent.status = "journal_projected"
        intent.status_reason_code = reason_code
        intent.journal_entry_id = journal_entry_id
        intent.reconciliation_required = False
        intent.updated_by = actor
        self.session.flush()
        return intent

    def get_intent(self, intent_id: UUID, *, active_only: bool = True) -> LiveOrderIntent | None:
        statement = select(LiveOrderIntent).where(LiveOrderIntent.id == intent_id)
        if active_only:
            statement = statement.where(
                LiveOrderIntent.is_active.is_(True),
                LiveOrderIntent.is_deleted.is_(False),
            )
        return self.session.scalars(statement).first()

    def get_intent_by_key(self, intent_key: str) -> LiveOrderIntent | None:
        statement = select(LiveOrderIntent).where(
            LiveOrderIntent.intent_key == intent_key,
            LiveOrderIntent.is_active.is_(True),
            LiveOrderIntent.is_deleted.is_(False),
        )
        return self.session.scalars(statement).first()

    def get_intent_by_client_order_id(self, client_order_id: str) -> LiveOrderIntent | None:
        statement = select(LiveOrderIntent).where(
            LiveOrderIntent.client_order_id == client_order_id,
            LiveOrderIntent.is_active.is_(True),
            LiveOrderIntent.is_deleted.is_(False),
        )
        return self.session.scalars(statement).first()

    def get_preview_by_idempotency_key(self, intent_id: UUID, idempotency_key: str) -> LiveOrderPreview | None:
        event_statement = (
            select(LiveOrderEvent.preview_id)
            .where(
                LiveOrderEvent.intent_id == intent_id,
                LiveOrderEvent.idempotency_key_hash == hash_idempotency_key(idempotency_key),
                LiveOrderEvent.preview_id.is_not(None),
            )
            .order_by(desc(LiveOrderEvent.created_at))
            .limit(1)
        )
        preview_id = self.session.execute(event_statement).scalar_one_or_none()
        if preview_id is None:
            return None
        return self.session.get(LiveOrderPreview, preview_id)

    def get_preview(self, preview_id: UUID) -> LiveOrderPreview | None:
        return self.session.get(LiveOrderPreview, preview_id)

    def list_intents(
        self,
        *,
        strategy_id: UUID | None = None,
        strategy_version_id: UUID | None = None,
        source_run_id: UUID | None = None,
        credential_ref_id: UUID | None = None,
        status: str | None = None,
        symbol: str | None = None,
        limit: int = 20,
    ) -> list[LiveOrderIntent]:
        bounded_limit = min(max(limit, 1), 50)
        statement = select(LiveOrderIntent).where(
            LiveOrderIntent.is_active.is_(True),
            LiveOrderIntent.is_deleted.is_(False),
        )
        if strategy_id is not None:
            statement = statement.where(LiveOrderIntent.strategy_id == strategy_id)
        if strategy_version_id is not None:
            statement = statement.where(LiveOrderIntent.strategy_version_id == strategy_version_id)
        if source_run_id is not None:
            statement = statement.where(LiveOrderIntent.source_run_id == source_run_id)
        if credential_ref_id is not None:
            statement = statement.where(LiveOrderIntent.credential_ref_id == credential_ref_id)
        if status:
            statement = statement.where(LiveOrderIntent.status == status)
        if symbol:
            statement = statement.where(LiveOrderIntent.symbol == symbol.upper())
        statement = statement.order_by(desc(LiveOrderIntent.created_at)).limit(bounded_limit)
        return list(self.session.scalars(statement).all())

    def list_previews_for_intent(self, intent_id: UUID, *, limit: int = 10) -> list[LiveOrderPreview]:
        statement = (
            select(LiveOrderPreview)
            .where(
                LiveOrderPreview.intent_id == intent_id,
                LiveOrderPreview.is_active.is_(True),
                LiveOrderPreview.is_deleted.is_(False),
            )
            .order_by(desc(LiveOrderPreview.created_at))
            .limit(min(max(limit, 1), 50))
        )
        return list(self.session.scalars(statement).all())

    def list_events_for_intent(self, intent_id: UUID, *, limit: int = 50) -> list[LiveOrderEvent]:
        statement = (
            select(LiveOrderEvent)
            .where(LiveOrderEvent.intent_id == intent_id)
            .order_by(LiveOrderEvent.created_at, LiveOrderEvent.id)
            .limit(min(max(limit, 1), 100))
        )
        return list(self.session.scalars(statement).all())

    def list_reconciliation_attempts_for_intent(self, intent_id: UUID, *, limit: int = 20) -> list[LiveReconciliationAttempt]:
        statement = (
            select(LiveReconciliationAttempt)
            .where(LiveReconciliationAttempt.intent_id == intent_id)
            .order_by(LiveReconciliationAttempt.attempt_no)
            .limit(min(max(limit, 1), 50))
        )
        return list(self.session.scalars(statement).all())
