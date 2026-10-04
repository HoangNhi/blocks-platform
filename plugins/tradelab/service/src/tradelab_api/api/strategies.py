from __future__ import annotations

from hashlib import sha256
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy.orm import Session

from tradelab_api.api.responses import success_response
from tradelab_api.api.serializers import serialize_model
from tradelab_api.core.security import SecurityActor, get_current_actor
from tradelab_api.db.session import get_db_session
from tradelab_api.schemas.ownership_validation import reject_ownership_spoof_fields
from tradelab_api.services.strategy_repository import StrategyRepository
from tradelab_api.services.strategy_validator import apply_validation_result, validate_strategy_source


router = APIRouter()


class StrategyGroupCreateRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str
    slug: str
    description: str | None = None
    metadata: dict[str, object] = Field(default_factory=dict)

    @model_validator(mode="before")
    @classmethod
    def check_no_spoof(cls, data: Any) -> Any:
        return reject_ownership_spoof_fields(data)


class StrategyCreateRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    strategy_group_id: UUID | None = None
    name: str
    slug: str
    description: str | None = None
    runtime_config: dict[str, object] = Field(default_factory=dict)
    risk_config: dict[str, object] = Field(default_factory=dict)
    metadata: dict[str, object] = Field(default_factory=dict)

    @model_validator(mode="before")
    @classmethod
    def check_no_spoof(cls, data: Any) -> Any:
        return reject_ownership_spoof_fields(data)


class StrategyUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str | None = None
    slug: str | None = None
    description: str | None = None
    runtime_config: dict[str, object] | None = None
    risk_config: dict[str, object] | None = None
    metadata: dict[str, object] | None = None
    is_active: bool | None = None
    is_deleted: bool | None = None

    @model_validator(mode="before")
    @classmethod
    def check_no_spoof(cls, data: Any) -> Any:
        return reject_ownership_spoof_fields(data)


class StrategyVersionCreateRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    source_code: str

    @model_validator(mode="before")
    @classmethod
    def check_no_spoof(cls, data: Any) -> Any:
        return reject_ownership_spoof_fields(data)


class StrategySourceValidationRequest(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    source_code: str = Field(alias="sourceCode")


@router.get("/strategy-groups")
def list_strategy_groups(
    actor: SecurityActor = Depends(get_current_actor),
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    repository = StrategyRepository(session, actor.workspace_id, actor.user_id)
    return success_response({"items": [serialize_model(item) for item in repository.list_strategy_groups()]})


@router.post("/strategy-groups")
def create_strategy_group(
    request: StrategyGroupCreateRequest,
    actor: SecurityActor = Depends(get_current_actor),
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    repository = StrategyRepository(session, actor.workspace_id, actor.user_id)
    group = repository.create_strategy_group(
        name=request.name,
        slug=request.slug,
        description=request.description,
        metadata_=request.metadata,
        created_by=str(actor.user_id),
    )
    session.commit()
    return success_response(serialize_model(group), status_code=201)


@router.get("/strategy-groups/{group_id}")
def get_strategy_group(
    group_id: UUID,
    actor: SecurityActor = Depends(get_current_actor),
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    repository = StrategyRepository(session, actor.workspace_id, actor.user_id)
    group = repository.get_strategy_group(group_id)
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Strategy group not found.")
    return success_response(serialize_model(group))


@router.get("/strategies")
def list_strategies(
    strategy_group_id: UUID | None = None,
    actor: SecurityActor = Depends(get_current_actor),
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    repository = StrategyRepository(session, actor.workspace_id, actor.user_id)
    return success_response(
        {"items": [serialize_model(item) for item in repository.list_strategies(strategy_group_id=strategy_group_id)]}
    )


@router.post("/strategies")
def create_strategy(
    request: StrategyCreateRequest,
    actor: SecurityActor = Depends(get_current_actor),
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    repository = StrategyRepository(session, actor.workspace_id, actor.user_id)
    if request.strategy_group_id is not None:
        group = repository.get_strategy_group(request.strategy_group_id)
        if group is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Strategy group not found in active workspace.")

    strategy = repository.create_strategy(
        strategy_group_id=request.strategy_group_id,
        name=request.name,
        slug=request.slug,
        description=request.description,
        runtime_config=request.runtime_config,
        risk_config=request.risk_config,
        metadata_=request.metadata,
        created_by=str(actor.user_id),
        status="draft",
    )
    session.commit()
    return success_response(serialize_model(strategy), status_code=201)


@router.get("/strategies/{strategy_id}")
def get_strategy(
    strategy_id: UUID,
    actor: SecurityActor = Depends(get_current_actor),
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    repository = StrategyRepository(session, actor.workspace_id, actor.user_id)
    strategy = repository.get_strategy(strategy_id)
    if strategy is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Strategy not found.")
    payload = serialize_model(strategy)
    payload["versions"] = [serialize_model(item) for item in repository.list_strategy_versions(strategy_id)]
    return success_response(payload)


@router.put("/strategies/{strategy_id}")
def update_strategy(
    strategy_id: UUID,
    request: StrategyUpdateRequest,
    actor: SecurityActor = Depends(get_current_actor),
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    repository = StrategyRepository(session, actor.workspace_id, actor.user_id)
    strategy = repository.get_strategy(strategy_id)
    if strategy is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Strategy not found.")
    updates = request.model_dump(exclude_none=True)
    updates["updated_by"] = str(actor.user_id)
    updated = repository.update_strategy(strategy, **updates)
    session.commit()
    return success_response(serialize_model(updated))


@router.post("/strategies/validate-source")
def validate_strategy_source_endpoint(request: StrategySourceValidationRequest) -> JSONResponse:
    validation = validate_strategy_source(request.source_code)
    return success_response(
        {
            "validationStatus": validation.validation_status,
            "validationMessage": validation.message,
            "line": validation.line,
            "column": validation.column,
        }
    )


@router.post("/strategies/{strategy_id}/versions")
def create_strategy_version(
    strategy_id: UUID,
    request: StrategyVersionCreateRequest,
    actor: SecurityActor = Depends(get_current_actor),
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    repository = StrategyRepository(session, actor.workspace_id, actor.user_id)
    strategy = repository.get_strategy(strategy_id)
    if strategy is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Strategy not found.")

    validation = validate_strategy_source(request.source_code)
    existing_versions = repository.list_strategy_versions(strategy_id)
    next_version_number = (existing_versions[0].version_number + 1) if existing_versions else 1
    version = repository.create_strategy_version(
        strategy_id=strategy_id,
        version_number=next_version_number,
        source_code=request.source_code,
        source_hash=_hash_source(request.source_code),
        validation_status=validation.validation_status,
        validation_message=validation.message,
        created_by=str(actor.user_id),
    )
    if validation.is_valid:
        strategy.current_version_id = version.id
        strategy.updated_by = str(actor.user_id)
        session.flush()
    apply_validation_result(version, validation)
    session.commit()
    return success_response(serialize_model(version), status_code=201)


@router.get("/strategies/{strategy_id}/versions")
def list_strategy_versions(
    strategy_id: UUID,
    actor: SecurityActor = Depends(get_current_actor),
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    repository = StrategyRepository(session, actor.workspace_id, actor.user_id)
    strategy = repository.get_strategy(strategy_id)
    if strategy is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Strategy not found.")
    return success_response({"items": [serialize_model(item) for item in repository.list_strategy_versions(strategy_id)]})


def _hash_source(source: str) -> str:
    return sha256(source.encode("utf-8")).hexdigest()
