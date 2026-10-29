from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import text

from app.config import get_settings
from app.db.client import get_sessionmaker
from app.models import schemas as s
from app.services import llm, voice
from app.services.corpus import get_corpus
from app.services.embeddings import get_embedder
from app.services.vector_store import get_vector_store

router = APIRouter(tags=["health"])


@router.get("/health", response_model=s.HealthResponse)
async def health() -> s.HealthResponse:
    settings = get_settings()
    checks: dict[str, str] = {}
    try:
        async with get_sessionmaker()() as db:
            await db.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception as exc:
        checks["database"] = f"error: {type(exc).__name__}"
    try:
        store = get_vector_store()
        count = await store.count()
        if store.degraded:
            checks["qdrant"] = f"degraded (local, {count} chunks)"
        else:
            checks["qdrant"] = f"ok ({store.mode}, {count} chunks)" if count else f"empty ({store.mode})"
    except Exception:
        checks["qdrant"] = "unavailable"
    corpus = get_corpus()
    checks["corpus"] = f"{len(corpus.acts)} acts, {len(corpus.sections)} sections, {corpus.version}"
    checks["embeddings"] = get_embedder().describe()
    checks["llm"] = llm.describe_providers()
    checks["voice"] = voice.describe()
    checks["auth"] = settings.resolved_auth_backend
    healthy = checks["database"] == "ok" and checks["qdrant"].startswith("ok")
    return s.HealthResponse(
        status="ok" if healthy else "degraded",
        version=settings.app_version,
        environment=settings.app_env,
        checks=checks,
    )
