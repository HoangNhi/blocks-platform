from __future__ import annotations

from typing import Any

from pydantic import model_validator

from .common import CamelModel

DISALLOWED_MUTATION_FIELDS = frozenset({
    "created_by", "createdBy",
    "updated_by", "updatedBy",
    "actor",
    "workspace_id", "workspaceId",
    "owner_user_id", "ownerUserId",
})


def reject_ownership_spoof_fields(data: Any) -> Any:
    if isinstance(data, dict):
        for field in DISALLOWED_MUTATION_FIELDS:
            if field in data:
                raise ValueError(f"Field '{field}' is governed by server security context and cannot be provided in request payload.")
    return data


class OwnershipMutationModel(CamelModel):
    _reject_ownership_spoof = model_validator(mode="before")(reject_ownership_spoof_fields)
