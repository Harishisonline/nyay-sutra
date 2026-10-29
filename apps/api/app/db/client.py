from __future__ import annotations

from collections.abc import AsyncIterator
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy import event
from sqlalchemy.engine import Engine
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.config import get_settings
from app.db.models import Base

_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker[AsyncSession] | None = None


@event.listens_for(Engine, "connect")
def _sqlite_pragmas(dbapi_conn: object, _record: object) -> None:
    module = type(dbapi_conn).__module__
    if "sqlite" in module:
        cursor = dbapi_conn.cursor()  # type: ignore[attr-defined]
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()


def get_engine() -> AsyncEngine:
    global _engine, _sessionmaker
    if _engine is None:
        url = get_settings().database_url
        if url.startswith("sqlite"):
            path = url.split("///", 1)[-1]
            if path and path != ":memory:":
                Path(path).parent.mkdir(parents=True, exist_ok=True)
        connect_args = {} if url.startswith("sqlite") else {"ssl": "require"}
        _engine = create_async_engine(
            url, pool_pre_ping=not url.startswith("sqlite"), connect_args=connect_args,
        )
        _sessionmaker = async_sessionmaker(_engine, expire_on_commit=False)
    return _engine


def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    get_engine()
    assert _sessionmaker is not None
    return _sessionmaker


async def init_db() -> None:
    if not get_settings().db_auto_create:
        return
    async with get_engine().begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def dispose_db() -> None:
    global _engine, _sessionmaker
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _sessionmaker = None


async def get_db() -> AsyncIterator[AsyncSession]:
    async with get_sessionmaker()() as session:
        yield session


def as_utc(dt: datetime) -> datetime:
    """SQLite drops tzinfo on read; every stored timestamp is UTC."""
    return dt if dt.tzinfo else dt.replace(tzinfo=UTC)
