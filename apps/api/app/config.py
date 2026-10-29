from __future__ import annotations

import secrets
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

API_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = API_ROOT / "data"

_DEV_JWT_SECRET = "dev-only-insecure-secret-change-me-" + "0" * 16


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=API_ROOT / ".env", env_file_encoding="utf-8", extra="ignore")

    app_env: Literal["development", "test", "production"] = "development"
    app_version: str = "0.4.2"
    cors_origins: str = "http://localhost:3000"

    # Database. Supabase Postgres in production: postgresql+asyncpg://...
    database_url: str = f"sqlite+aiosqlite:///{DATA_DIR / 'nyay.db'}"
    db_auto_create: bool = True

    # Auth
    auth_backend: Literal["auto", "local", "supabase"] = "auto"
    jwt_secret: str = _DEV_JWT_SECRET
    jwt_ttl_seconds: int = 60 * 60 * 24
    supabase_url: str | None = None
    supabase_anon_key: str | None = None
    supabase_service_key: str | None = None
    supabase_jwt_secret: str | None = None
    otp_ttl_seconds: int = 300
    otp_resend_seconds: int = 30

    # LLM
    groq_api_key: str | None = None
    groq_model: str = "openai/gpt-oss-120b"
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-2.0-flash"
    llm_timeout_seconds: float = 25.0
    allow_offline_llm: bool = True

    # Embeddings + vector store
    embeddings_backend: Literal["auto", "local", "hf_api", "hash"] = "auto"
    embeddings_model: str = "intfloat/multilingual-e5-base"
    huggingface_api_key: str | None = None
    qdrant_url: str | None = None
    qdrant_api_key: str | None = None
    qdrant_path: str = str(DATA_DIR / "qdrant")
    qdrant_collection: str = "corpus_chunks"
    reranker_path: str | None = None

    # RAG thresholds (PRD 7 + CURSOR_PROMPT 2)
    retrieval_threshold: float = 0.55
    confidence_threshold: float = 0.6
    min_valid_citations: int = 2
    retrieval_top_k: int = 12
    context_chunks: int = 6

    # Voice
    bhashini_api_key: str | None = None
    bhashini_user_id: str | None = None
    bhashini_pipeline_id: str = "64392f96daac500b55c543cd"

    # Rate limits
    rate_query_per_min: int = 60
    rate_auth_per_min: int = 10
    rate_improve_per_hour: int = 30

    trace_retention_hours: int = 24

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def resolved_auth_backend(self) -> Literal["local", "supabase"]:
        if self.auth_backend != "auto":
            return self.auth_backend
        return "supabase" if self.supabase_url and self.supabase_anon_key else "local"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def offline_llm_enabled(self) -> bool:
        return self.allow_offline_llm and not self.is_production

    def validate_for_production(self) -> None:
        if not self.is_production:
            return
        problems: list[str] = []
        if self.jwt_secret == _DEV_JWT_SECRET and self.resolved_auth_backend == "local":
            problems.append("JWT_SECRET must be set in production")
        if self.resolved_auth_backend == "local":
            problems.append("Production requires Supabase phone auth (SUPABASE_URL + SUPABASE_ANON_KEY)")
        if not (self.groq_api_key or self.gemini_api_key):
            problems.append("Production requires GROQ_API_KEY or GEMINI_API_KEY")
        if problems:
            raise RuntimeError("; ".join(problems))


@lru_cache
def get_settings() -> Settings:
    return Settings()


def new_request_id() -> str:
    return secrets.token_hex(6)
