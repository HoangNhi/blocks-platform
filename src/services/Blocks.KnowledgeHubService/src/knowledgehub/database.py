import asyncio
from collections.abc import AsyncGenerator

from fastapi import Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)


def create_db_engine(database_url: str) -> AsyncEngine:
    return create_async_engine(
        database_url,
        echo=False,
        pool_pre_ping=True,
    )


def create_session_factory(engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autocommit=False,
        autoflush=False,
    )


async def get_db_session(request: Request) -> AsyncGenerator[AsyncSession, None]:
    factory = request.app.state.db_session_factory
    async with factory() as session:
        try:
            yield session
        except BaseException:
            await session.rollback()
            raise


async def check_db_health(engine: AsyncEngine | None, timeout: float = 2.0) -> bool:
    if engine is None:
        return False
    try:
        async def _probe():
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))

        await asyncio.wait_for(_probe(), timeout=timeout)
        return True
    except Exception:
        return False
