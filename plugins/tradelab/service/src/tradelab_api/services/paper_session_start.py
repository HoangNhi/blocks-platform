from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID

from tradelab_api.services.market_data_preflight import build_preflight_result
from tradelab_api.services.paper_risk_gates import (
    PaperBotSnapshot,
    PaperDatasetGateSnapshot,
    PaperRiskGateFailure,
    PaperRiskGateInput,
    PaperRuntimeSafetySnapshot,
    PaperStrategySnapshot,
    evaluate_paper_risk_gates,
)
from tradelab_api.services.paper_kill_switch import PaperKillSwitchStatus
from tradelab_api.services.paper_session_preview import _build_risk_policy

PAPER_START_ACCEPTED_SAFETY_STATUS = "paper_start_accepted"


class PaperSessionStartValidationError(Exception):
    def __init__(
        self,
        status_code: int,
        reason_code: str,
        message: str,
        details: dict[str, Any] | None = None,
        *,
        should_commit: bool = False,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.reason_code = reason_code
        self.message = message
        self.details = details or {}
        self.should_commit = should_commit


@dataclass(frozen=True)
class PaperSessionStartGateFailure:
    gate: str
    reason_code: str
    message: str
    data: dict[str, object] = field(default_factory=dict)


@dataclass(frozen=True)
class PaperSessionStartResult:
    session_id: str | None
    status: str
    allowed: bool
    reason_code: str
    safety_status: str
    request_fingerprint: str
    idempotency_key: str
    failed_gates: list[PaperSessionStartGateFailure]
    warnings: list[str]
    details: dict[str, object]
    dataset_context: dict[str, object]
    gate_context: dict[str, object]
    audit_event_ids: list[str]
    semantic_status_code: int
    should_commit: bool


def start_paper_session(
    bot_repository: object,
    strategy_repository: object,
    market_repository: object,
    paper_repository: object,
    *,
    bot_id: UUID,
    exchange: str,
    symbol: str,
    timeframe: str,
    start_at: datetime,
    end_at: datetime,
    starting_cash: Decimal,
    risk_policy_override: dict[str, object] | None,
    preview_fingerprint: str | None,
    idempotency_key: str,
    confirm_start: bool,
    source: str,
    actor: str,
    kill_switch_status: PaperKillSwitchStatus | None = None,
) -> PaperSessionStartResult:
    if not confirm_start:
        raise PaperSessionStartValidationError(
            400,
            "paper_start_confirmation_required",
            "Paper session start requires explicit confirmation.",
        )
    normalized_idempotency_key = idempotency_key.strip()
    if not normalized_idempotency_key:
        raise PaperSessionStartValidationError(
            400,
            "paper_idempotency_key_required",
            "Paper session start requires an idempotency key.",
        )
    if end_at <= start_at:
        raise PaperSessionStartValidationError(
            400,
            "paper_start_range_invalid",
            "Paper session start range must start before it ends.",
        )
    resolved_kill_switch = kill_switch_status or PaperKillSwitchStatus(
        enabled=False,
        reason_code="paper_kill_switch_status_read",
        details={"environment": "unknown", "localDevOnly": True},
    )
    if resolved_kill_switch.enabled:
        return _blocked_by_kill_switch_result(
            bot_id=bot_id,
            exchange=exchange,
            symbol=symbol,
            timeframe=timeframe,
            start_at=start_at,
            end_at=end_at,
            starting_cash=starting_cash,
            risk_policy_override=risk_policy_override,
            source=source,
            idempotency_key=normalized_idempotency_key,
            kill_switch_status=resolved_kill_switch,
        )

    bot = bot_repository.get_bot(bot_id)
    if bot is None:
        raise PaperSessionStartValidationError(404, "paper_bot_not_found", "Paper bot not found.")

    strategy_version_id = getattr(bot, "strategy_version_id", None)
    strategy_version = (
        strategy_repository.get_strategy_version(strategy_version_id)
        if strategy_version_id is not None
        else None
    )
    preflight = build_preflight_result(
        market_repository,
        exchange=exchange,
        symbol=symbol,
        timeframe=timeframe,
        requested_start_at=start_at,
        requested_end_at=end_at,
    )
    runtime_config = dict(getattr(bot, "runtime_config", None) or {})
    metadata = dict(getattr(bot, "metadata_", None) or {})
    risk_config = dict(getattr(bot, "risk_config", None) or {})
    risk_policy_input = {**(risk_policy_override or {}), "startingCash": starting_cash}
    risk_policy = _build_risk_policy(
        risk_config=risk_config,
        runtime_config=runtime_config,
        override=risk_policy_input,
    )

    request_fingerprint = _request_fingerprint(
        {
            "botId": str(bot_id),
            "exchange": exchange,
            "symbol": symbol,
            "timeframe": timeframe,
            "startAt": start_at.isoformat(),
            "endAt": end_at.isoformat(),
            "startingCash": str(starting_cash),
            "riskPolicyOverride": _json_safe(risk_policy_override or {}),
            "source": source,
        }
    )
    existing_session = paper_repository.find_queued_session_by_idempotency_key(normalized_idempotency_key)
    if existing_session is not None:
        existing_gate_context = dict(getattr(existing_session, "gate_context", None) or {})
        if existing_gate_context.get("requestFingerprint") != request_fingerprint:
            audit = paper_repository.create_audit_event(
                paper_session_id=existing_session.id,
                actor=actor,
                action="paper_idempotency_conflict",
                target_type="paper_session",
                target_id=existing_session.id,
                old_state=getattr(existing_session, "status", None),
                new_state=getattr(existing_session, "status", None),
                reason_code="paper_idempotency_conflict",
                correlation_id=normalized_idempotency_key,
                request_id=request_fingerprint,
                metadata_={"idempotencyKey": normalized_idempotency_key},
                created_by=actor,
            )
            raise PaperSessionStartValidationError(
                409,
                "paper_idempotency_conflict",
                "Paper session idempotency key conflicts with a different request.",
                {"sessionId": str(existing_session.id), "auditEventIds": [str(audit.id)]},
                should_commit=True,
            )
        audit = paper_repository.create_audit_event(
            paper_session_id=existing_session.id,
            actor=actor,
            action="paper_idempotency_replayed",
            target_type="paper_session",
            target_id=existing_session.id,
            old_state=getattr(existing_session, "status", None),
            new_state=getattr(existing_session, "status", None),
            reason_code="paper_idempotency_replayed",
            correlation_id=normalized_idempotency_key,
            request_id=request_fingerprint,
            metadata_={"idempotencyKey": normalized_idempotency_key},
            created_by=actor,
        )
        return _result_from_existing(
            existing_session,
            reason_code="paper_idempotency_replayed",
            audit_event_ids=[str(audit.id)],
            semantic_status_code=200,
            should_commit=True,
        )

    dataset_context = {
        "datasetKey": str(getattr(preflight, "dataset_key", "")),
        "exchange": str(getattr(preflight, "exchange", exchange)),
        "symbol": str(getattr(preflight, "symbol", symbol)),
        "timeframe": str(getattr(preflight, "timeframe", timeframe)),
        "startAt": start_at.isoformat(),
        "endAt": end_at.isoformat(),
        "preflightOutcome": str(getattr(preflight, "outcome", "")),
    }
    gate_input_context = {
        "source": source,
        "datasetKey": dataset_context["datasetKey"],
        "requestedRange": {"startAt": start_at.isoformat(), "endAt": end_at.isoformat()},
        "idempotencyKey": normalized_idempotency_key,
        "requestFingerprint": request_fingerprint,
    }
    if preview_fingerprint is not None:
        gate_input_context["previewFingerprint"] = preview_fingerprint

    gate_result = evaluate_paper_risk_gates(
        PaperRiskGateInput(
            bot=PaperBotSnapshot(
                bot_id=str(getattr(bot, "id", "")) if getattr(bot, "id", None) is not None else None,
                mode=str(getattr(bot, "mode", "")),
                status=str(getattr(bot, "status", "")),
                is_active=bool(getattr(bot, "is_active", False)),
                is_deleted=bool(getattr(bot, "is_deleted", False)),
                exchange=exchange,
                symbol=symbol,
                timeframe=timeframe,
            ),
            strategy=PaperStrategySnapshot(
                strategy_id=str(getattr(bot, "strategy_id", "")) if getattr(bot, "strategy_id", None) is not None else None,
                strategy_version_id=str(strategy_version_id) if strategy_version_id is not None else None,
                source_valid=_is_valid_strategy_version(strategy_version),
                version_locked=strategy_version_id is not None,
                dirty=False,
            ),
            dataset=PaperDatasetGateSnapshot(
                dataset_key=dataset_context["datasetKey"],
                exchange=exchange,
                symbol=symbol,
                timeframe=timeframe,
                ready=str(getattr(preflight, "outcome", "")) == "ready",
                start_at=start_at,
                end_at=end_at,
                reason_code=None if str(getattr(preflight, "outcome", "")) == "ready" else str(getattr(preflight, "outcome", "")),
            ),
            risk_policy=risk_policy,
            order_preview=None,
            runtime_safety=PaperRuntimeSafetySnapshot(kill_switch_enabled=resolved_kill_switch.enabled),
            runtime_config=runtime_config,
            metadata=metadata,
            gate_context=gate_input_context,
        )
    )

    if not gate_result.allowed:
        first_failure = gate_result.failed_gates[0]
        if first_failure.reason_code in {"paper_secret_not_allowed", "paper_live_route_blocked"}:
            raise PaperSessionStartValidationError(
                400,
                first_failure.reason_code,
                first_failure.message,
                _sanitize_details(first_failure.data),
            )
        return PaperSessionStartResult(
            session_id=None,
            status="blocked",
            allowed=False,
            reason_code=first_failure.reason_code,
            safety_status="paper_start_blocked",
            request_fingerprint=request_fingerprint,
            idempotency_key=normalized_idempotency_key,
            failed_gates=[_serialize_failure(failure) for failure in gate_result.failed_gates],
            warnings=list(gate_result.warnings),
            details=_json_safe(gate_result.details),
            dataset_context=dataset_context,
            gate_context={
                **gate_input_context,
                "gateResult": {
                    "allowed": gate_result.allowed,
                    "reasonCode": gate_result.reason_code,
                    "failedGateCount": len(gate_result.failed_gates),
                },
            },
            audit_event_ids=[],
            semantic_status_code=200,
            should_commit=False,
        )

    gate_context = {
        **gate_input_context,
        "gateResult": {
            "allowed": gate_result.allowed,
            "reasonCode": gate_result.reason_code,
            "failedGateCount": 0,
        },
    }
    session = paper_repository.create_paper_session(
        bot_id=getattr(bot, "id"),
        strategy_id=getattr(bot, "strategy_id"),
        strategy_version_id=strategy_version_id,
        mode="paper",
        status="queued",
        exchange=exchange,
        symbol=symbol,
        timeframe=timeframe,
        dataset_key=str(getattr(preflight, "dataset_key", "")),
        start_at=start_at,
        end_at=end_at,
        starting_cash=starting_cash,
        runtime_config=_json_safe(runtime_config),
        risk_config=_json_safe({**risk_config, **(risk_policy_override or {})}),
        source_snapshot={
            "strategyVersionId": str(strategy_version_id) if strategy_version_id is not None else None,
            "sourceHash": getattr(strategy_version, "source_hash", None),
            "source": source,
        },
        dataset_context=dataset_context,
        gate_context=gate_context,
        reason_code="paper_session_queued",
        error_message=None,
        created_by=actor,
    )
    audit = paper_repository.create_audit_event(
        paper_session_id=session.id,
        actor=actor,
        action="paper_session_queued",
        target_type="paper_session",
        target_id=session.id,
        old_state=None,
        new_state="queued",
        reason_code="paper_session_queued",
        correlation_id=normalized_idempotency_key,
        request_id=request_fingerprint,
        metadata_={"idempotencyKey": normalized_idempotency_key},
        created_by=actor,
    )

    return PaperSessionStartResult(
        session_id=str(session.id),
        status="queued",
        allowed=True,
        reason_code="paper_session_queued",
        safety_status=PAPER_START_ACCEPTED_SAFETY_STATUS,
        request_fingerprint=request_fingerprint,
        idempotency_key=normalized_idempotency_key,
        failed_gates=[],
        warnings=list(gate_result.warnings),
        details=_json_safe(gate_result.details),
        dataset_context=dataset_context,
        gate_context=gate_context,
        audit_event_ids=[str(audit.id)],
        semantic_status_code=201,
        should_commit=True,
    )


def _result_from_existing(
    session: object,
    *,
    reason_code: str,
    audit_event_ids: list[str],
    semantic_status_code: int,
    should_commit: bool,
) -> PaperSessionStartResult:
    gate_context = dict(getattr(session, "gate_context", None) or {})
    return PaperSessionStartResult(
        session_id=str(getattr(session, "id")),
        status=str(getattr(session, "status")),
        allowed=True,
        reason_code=reason_code,
        safety_status=PAPER_START_ACCEPTED_SAFETY_STATUS,
        request_fingerprint=str(gate_context.get("requestFingerprint", "")),
        idempotency_key=str(gate_context.get("idempotencyKey", "")),
        failed_gates=[],
        warnings=[],
        details={},
        dataset_context=dict(getattr(session, "dataset_context", None) or {}),
        gate_context=gate_context,
        audit_event_ids=audit_event_ids,
        semantic_status_code=semantic_status_code,
        should_commit=should_commit,
    )


def _blocked_by_kill_switch_result(
    *,
    bot_id: UUID,
    exchange: str,
    symbol: str,
    timeframe: str,
    start_at: datetime,
    end_at: datetime,
    starting_cash: Decimal,
    risk_policy_override: dict[str, object] | None,
    source: str,
    idempotency_key: str,
    kill_switch_status: PaperKillSwitchStatus,
) -> PaperSessionStartResult:
    request_fingerprint = _request_fingerprint(
        {
            "botId": str(bot_id),
            "exchange": exchange,
            "symbol": symbol,
            "timeframe": timeframe,
            "startAt": start_at.isoformat(),
            "endAt": end_at.isoformat(),
            "startingCash": str(starting_cash),
            "riskPolicyOverride": _json_safe(risk_policy_override or {}),
            "source": source,
        }
    )
    dataset_context = {
        "datasetKey": f"{exchange}:{symbol}:{timeframe}",
        "exchange": exchange,
        "symbol": symbol,
        "timeframe": timeframe,
        "startAt": start_at.isoformat(),
        "endAt": end_at.isoformat(),
        "preflightOutcome": "blocked",
    }
    kill_switch_details = {
        "enabled": kill_switch_status.enabled,
        "reasonCode": kill_switch_status.reason_code,
        "source": kill_switch_status.source,
        "details": kill_switch_status.details,
    }
    return PaperSessionStartResult(
        session_id=None,
        status="blocked",
        allowed=False,
        reason_code="paper_kill_switch_enabled",
        safety_status="paper_start_blocked_by_kill_switch",
        request_fingerprint=request_fingerprint,
        idempotency_key=idempotency_key,
        failed_gates=[
            PaperSessionStartGateFailure(
                gate="runtime_safety",
                reason_code="paper_kill_switch_enabled",
                message="Paper kill switch is enabled.",
                data={"killSwitch": kill_switch_details},
            )
        ],
        warnings=[],
        details={"killSwitch": kill_switch_details},
        dataset_context=dataset_context,
        gate_context={
            "source": source,
            "datasetKey": dataset_context["datasetKey"],
            "requestedRange": {"startAt": start_at.isoformat(), "endAt": end_at.isoformat()},
            "idempotencyKey": idempotency_key,
            "requestFingerprint": request_fingerprint,
            "killSwitch": kill_switch_details,
        },
        audit_event_ids=[],
        semantic_status_code=200,
        should_commit=False,
    )


def _is_valid_strategy_version(strategy_version: object | None) -> bool:
    if strategy_version is None:
        return False
    return str(getattr(strategy_version, "validation_status", "")).strip().lower() == "valid"


def _serialize_failure(failure: PaperRiskGateFailure) -> PaperSessionStartGateFailure:
    return PaperSessionStartGateFailure(
        gate=failure.gate,
        reason_code=failure.reason_code,
        message=failure.message,
        data=_sanitize_details(failure.data),
    )


def _request_fingerprint(payload: dict[str, object]) -> str:
    encoded = json.dumps(_json_safe(payload), sort_keys=True, separators=(",", ":")).encode("utf-8")
    return f"paper-start:{hashlib.sha256(encoded).hexdigest()}"


def _sanitize_details(value: Any) -> Any:
    if isinstance(value, dict):
        sanitized: dict[str, Any] = {}
        for key, nested in value.items():
            if _looks_secret(str(key)):
                sanitized[key] = "[REDACTED]"
            else:
                sanitized[key] = _sanitize_details(nested)
        return sanitized
    if isinstance(value, list):
        return [_sanitize_details(item) for item in value]
    if isinstance(value, tuple):
        return [_sanitize_details(item) for item in value]
    return _json_safe(value)


def _json_safe(value: Any) -> Any:
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, datetime):
        return value.astimezone(timezone.utc).isoformat() if value.tzinfo else value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, dict):
        return {str(key): _json_safe(nested) for key, nested in value.items()}
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    if isinstance(value, tuple):
        return [_json_safe(item) for item in value]
    return value


def _looks_secret(key: str) -> bool:
    normalized = key.strip().lower()
    return any(marker in normalized for marker in ("secret", "password", "token", "apikey", "api_key"))
