from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from tradelab_api.api.responses import success_response
from tradelab_api.api.serializers import serialize_model
from tradelab_api.db.session import get_db_session
from tradelab_api.services.strategy_repository import StrategyRepository
from tradelab_api.services.strategy_validator import apply_validation_result, validate_strategy_source


router = APIRouter()


class StrategyGroupCreateRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str
    slug: str
    description: str | None = None
    metadata: dict[str, object] = Field(default_factory=dict)
    created_by: str | None = None


class StrategyCreateRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    strategy_group_id: UUID | None = None
    name: str
    slug: str
    description: str | None = None
    runtime_config: dict[str, object] = Field(default_factory=dict)
    risk_config: dict[str, object] = Field(default_factory=dict)
    metadata: dict[str, object] = Field(default_factory=dict)
    created_by: str | None = None


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
    updated_by: str | None = None


class StrategyVersionCreateRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    source_code: str
    created_by: str | None = None

class StrategySourceValidationRequest(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    source_code: str = Field(alias="sourceCode")


@router.get("/strategy-groups")
def list_strategy_groups(session: Session = Depends(get_db_session)) -> JSONResponse:
    repository = StrategyRepository(session)
    return success_response({"items": [serialize_model(item) for item in repository.list_strategy_groups()]})


@router.post("/strategy-groups")
def create_strategy_group(
    request: StrategyGroupCreateRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    repository = StrategyRepository(session)
    group = repository.create_strategy_group(
        name=request.name,
        slug=request.slug,
        description=request.description,
        metadata_=request.metadata,
        created_by=request.created_by,
    )
    session.commit()
    return success_response(serialize_model(group), status_code=201)


@router.get("/strategy-groups/{group_id}")
def get_strategy_group(group_id: UUID, session: Session = Depends(get_db_session)) -> JSONResponse:
    repository = StrategyRepository(session)
    group = repository.get_strategy_group(group_id)
    if group is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Strategy group not found.")
    return success_response(serialize_model(group))


@router.get("/strategies")
def list_strategies(
    strategy_group_id: UUID | None = None,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    repository = StrategyRepository(session)
    return success_response(
        {"items": [serialize_model(item) for item in repository.list_strategies(strategy_group_id=strategy_group_id)]}
    )


@router.post("/strategies")
def create_strategy(
    request: StrategyCreateRequest,
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    repository = StrategyRepository(session)
    strategy = repository.create_strategy(
        strategy_group_id=request.strategy_group_id,
        name=request.name,
        slug=request.slug,
        description=request.description,
        runtime_config=request.runtime_config,
        risk_config=request.risk_config,
        metadata_=request.metadata,
        created_by=request.created_by,
        status="draft",
    )
    session.commit()
    return success_response(serialize_model(strategy), status_code=201)


@router.get("/strategies/{strategy_id}")
def get_strategy(strategy_id: UUID, session: Session = Depends(get_db_session)) -> JSONResponse:
    repository = StrategyRepository(session)
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
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    repository = StrategyRepository(session)
    strategy = repository.get_strategy(strategy_id)
    if strategy is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Strategy not found.")
    updates = request.model_dump(exclude_none=True)
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
    session: Session = Depends(get_db_session),
) -> JSONResponse:
    repository = StrategyRepository(session)
    strategy = repository.get_strategy(strategy_id)
    if strategy is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Strategy not found.")

    validation = validate_strategy_source(request.source_code)
    next_version_number = (repository.list_strategy_versions(strategy_id)[0].version_number + 1) if repository.list_strategy_versions(strategy_id) else 1
    version = repository.create_strategy_version(
        strategy_id=strategy_id,
        version_number=next_version_number,
        source_code=request.source_code,
        source_hash=_hash_source(request.source_code),
        validation_status=validation.validation_status,
        validation_message=validation.message,
        created_by=request.created_by,
    )
    if validation.is_valid:
        strategy.current_version_id = version.id
        strategy.updated_by = request.created_by
        session.flush()
    apply_validation_result(version, validation)
    session.commit()
    return success_response(serialize_model(version), status_code=201)


@router.get("/strategies/{strategy_id}/versions")
def list_strategy_versions(strategy_id: UUID, session: Session = Depends(get_db_session)) -> JSONResponse:
    repository = StrategyRepository(session)
    return success_response({"items": [serialize_model(item) for item in repository.list_strategy_versions(strategy_id)]})


def _hash_source(source: str) -> str:
    import hashlib

    return hashlib.sha256(source.encode("utf-8")).hexdigest()
