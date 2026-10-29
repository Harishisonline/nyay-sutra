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
    # Lets the local OTP backend run under APP_ENV=production. The code is generated
    # server-side and returned to the client as `dev_code` instead of being sent by SMS.
    # Only for demo deployments where no SMS provider is configured.
    allow_local_otp_in_production: bool = False
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
    embeddings_backend: Literal["auto", "local", "hf_api", "hash", "qdrant"] = "auto"
    embeddings_model: str = "intfloat/multilingual-e5-base"
    # Model Qdrant Cloud runs server-side when EMBEDDINGS_BACKEND=qdrant. It must be one
    # of the models the cluster's inference service accepts.
    qdrant_inference_model: str = "intfloat/multilingual-e5-small"
    huggingface_api_key: str | None = None
    qdrant_url: str | None = None
    qdrant_api_key: str | None = None
    qdrant_path: str = str(DATA_DIR / "qdrant")
    # Empty means "choose from the embeddings backend". The local embedding path indexes
    # into "corpus_chunks" at 768 dims. The Qdrant server-side path embeds with
    # intfloat/multilingual-e5-small at 384 dims and needs its own collection, so
    # querying the 768-dim collection with 384-dim vectors fails with a Qdrant
    # dimension error. Resolved in resolved_qdrant_collection, because a field default
    # cannot read another field's value at class definition time.
    qdrant_collection: str = ""
    reranker_path: str | None = None

    # RAG thresholds (PRD 7 + CURSOR_PROMPT 2)
    retrieval_threshold: float = 0.55
    confidence_threshold: float = 0.6
    min_valid_citations: int = 2
    retrieval_top_k: int = 12
    # How many retrieved sections go into the prompt. Measured over the 35 in-domain
    # questions on the Qdrant server-side path, the gold section lands inside the
    # first 10 for all 35 and inside the first 6 for only 34, because one query puts
    # its gold at rank 9. Going to 10 recovers it and lets the model cite the right
    # section; the prompt grows by about 1.8k characters.
    context_chunks: int = 10

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
    def resolved_qdrant_collection(self) -> str:
        """The collection to search, matching the dimensionality of the embedder."""
        if self.qdrant_collection:
            return self.qdrant_collection
        if self.embeddings_backend == "qdrant":
            return "corpus_chunks_q"
        return "corpus_chunks"

    @property
    def offline_llm_enabled(self) -> bool:
        return self.allow_offline_llm and not self.is_production

    def validate_for_production(self) -> None:
        if not self.is_production:
            return
        problems: list[str] = []
        if self.jwt_secret == _DEV_JWT_SECRET and self.resolved_auth_backend == "local":
            problems.append("JWT_SECRET must be set in production")
        if self.resolved_auth_backend == "local" and not self.allow_local_otp_in_production:
            problems.append(
                "Production requires Supabase phone auth (SUPABASE_URL + SUPABASE_ANON_KEY). "
                "Set ALLOW_LOCAL_OTP_IN_PRODUCTION=true to run the local OTP backend instead."
            )
        if not (self.groq_api_key or self.gemini_api_key):
            problems.append("Production requires GROQ_API_KEY or GEMINI_API_KEY")
        if problems:
            raise RuntimeError("; ".join(problems))


@lru_cache
def get_settings() -> Settings:
    return Settings()


def new_request_id() -> str:
    return secrets.token_hex(6)
