import math
from functools import lru_cache
from uuid import UUID

import jwt
from fastapi import Depends, Header, HTTPException
from pydantic import BaseModel

from knowledgehub.config import Settings


class AuthenticatedUser(BaseModel):
    actor_id: UUID
    username: str
    token: str


@lru_cache
def get_settings() -> Settings:
    return Settings()


def verify_jwt_token(token: str, settings: Settings) -> AuthenticatedUser:
    try:
        raw_payload = jwt.decode(token, options={"verify_signature": False})
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Xác thực không thành công")

    raw_exp = raw_payload.get("exp")
    if (
        raw_exp is None
        or isinstance(raw_exp, bool)
        or not isinstance(raw_exp, (int, float))
    ):
        raise HTTPException(status_code=401, detail="Xác thực không thành công")

    try:
        if not math.isfinite(raw_exp) or raw_exp > 253402300799:
            raise HTTPException(status_code=401, detail="Xác thực không thành công")
    except OverflowError:
        raise HTTPException(status_code=401, detail="Xác thực không thành công")

    try:
        payload = jwt.decode(
            token,
            key=settings.jwt_key.get_secret_value(),
            algorithms=["HS256"],
            issuer=settings.jwt_issuer,
            audience=settings.jwt_audience,
            leeway=0,
            options={"require": ["exp"]},
        )
    except (jwt.PyJWTError, OverflowError, ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Xác thực không thành công")

    name = payload.get("name")
    if not name or not isinstance(name, str) or not name.strip():
        raise HTTPException(status_code=401, detail="Xác thực không thành công")

    try:
        actor_id = UUID(name.strip())
    except (ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Xác thực không thành công")

    if actor_id == UUID(int=0):
        raise HTTPException(status_code=401, detail="Xác thực không thành công")

    username = str(payload.get("unique_name") or "")
    return AuthenticatedUser(actor_id=actor_id, username=username, token=token)


async def get_current_user(
    authorization: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> AuthenticatedUser:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Xác thực không thành công")
    token = authorization[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Xác thực không thành công")
    return verify_jwt_token(token, settings)
