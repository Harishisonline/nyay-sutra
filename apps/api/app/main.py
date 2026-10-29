from __future__ import annotations

import asyncio
import contextlib
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.config import get_settings
from app.core.errors import install_error_handlers
from app.core.logging import RequestIdMiddleware, SecurityHeadersMiddleware, configure_logging
from app.db.client import dispose_db, get_sessionmaker, init_db
from app.services import ingest, retention

log = structlog.get_logger()


async def _housekeeping() -> None:
    while True:
        try:
            async with get_sessionmaker()() as db:
                await retention.purge(db)
        except Exception:
            log.exception("retention_failed")
        await asyncio.sleep(3600)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    settings.validate_for_production()
    if settings.db_auto_create:
        await init_db()
    try:
        async with get_sessionmaker()() as db:
            await ingest.ensure_indexed(db)
    except Exception:
        log.exception("corpus_index_failed")
    task = asyncio.create_task(_housekeeping())
    log.info("api_started", env=settings.app_env, auth=settings.resolved_auth_backend)
    yield
    task.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await task
    await dispose_db()


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(json_logs=settings.is_production)
    app = FastAPI(
        title="NYAY-SUTRA API",
        version=settings.app_version,
        lifespan=lifespan,
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None,
    )
    app.add_middleware(SecurityHeadersMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type", "X-Request-Id"],
        expose_headers=["X-Request-Id", "Retry-After", "Content-Disposition"],
    )
    app.add_middleware(RequestIdMiddleware)
    install_error_handlers(app)
    app.include_router(api_router)
    return app


app = create_app()
