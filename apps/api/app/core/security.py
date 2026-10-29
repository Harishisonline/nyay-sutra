"""JWT verification and the current-user dependency.

Local backend: HS256 tokens signed with JWT_SECRET, one row per session in user_sessions.
Supabase backend: tokens issued by Supabase Auth, verified with SUPABASE_JWT_SECRET (HS256),
or, if that secret is not configured, by asking Supabase who the token belongs to."""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Annotated, Any

import httpx
import jwt
from fastapi import Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.errors import ProblemError
from app.db.client import get_db
from app.db.models import User, UserSession

DbSession = Annotated[AsyncSession, Depends(get_db)]

_supabase_cache: dict[str, tuple[float, dict[str, Any]]] = {}


@dataclass(frozen=True)
class TokenClaims:
    user_id: uuid.UUID
    session_id: uuid.UUID | None
    phone: str | None


def issue_local_token(user_id: uuid.UUID, session_id: uuid.UUID) -> tuple[str, int]:
    s = get_settings()
    now = int(time.time())
    payload = {
        "sub": str(user_id),
        "sid": str(session_id),
        "iat": now,
        "exp": now + s.jwt_ttl_seconds,
        "iss": "nyay-sutra-local",
        "aud": "authenticated",
    }
    return jwt.encode(payload, s.jwt_secret, algorithm="HS256"), s.jwt_ttl_seconds


def _unauthorized(detail: str = "Sign in to continue.") -> ProblemError:
    return ProblemError(401, detail, slug="unauthorized", headers={"WWW-Authenticate": "Bearer"})


async def _supabase_lookup(token: str) -> dict[str, Any]:
    cached = _supabase_cache.get(token)
    if cached and cached[0] > time.monotonic():
        return cached[1]
    s = get_settings()
    async with httpx.AsyncClient(timeout=8) as client:
        res = await client.get(
            f"{s.supabase_url}/auth/v1/user",
            headers={"Authorization": f"Bearer {token}", "apikey": s.supabase_anon_key or ""},
        )
    if res.status_code != 200:
        raise _unauthorized()
    data: dict[str, Any] = res.json()
    _supabase_cache[token] = (time.monotonic() + 60, data)
    return data


async def decode_token(token: str) -> TokenClaims:
    s = get_settings()
    if s.resolved_auth_backend == "local":
        try:
            payload = jwt.decode(token, s.jwt_secret, algorithms=["HS256"], audience="authenticated")
        except jwt.PyJWTError as exc:
            raise _unauthorized() from exc
        sid = payload.get("sid")
        return TokenClaims(uuid.UUID(payload["sub"]), uuid.UUID(sid) if sid else None, None)

    if s.supabase_jwt_secret:
        try:
            payload = jwt.decode(token, s.supabase_jwt_secret, algorithms=["HS256"], audience="authenticated")
        except jwt.PyJWTError as exc:
            raise _unauthorized() from exc
        return TokenClaims(uuid.UUID(payload["sub"]), None, payload.get("phone"))
    data = await _supabase_lookup(token)
    return TokenClaims(uuid.UUID(data["id"]), None, data.get("phone"))


def bearer_token(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip() or None
    return None


async def get_claims(request: Request) -> TokenClaims:
    token = bearer_token(request)
    if not token:
        raise _unauthorized()
    return await decode_token(token)


async def get_current_user(request: Request, db: DbSession) -> User:
    claims = await get_claims(request)
    user = await db.get(User, claims.user_id)
    if user is None or user.deleted_at is not None:
        raise _unauthorized()
    if claims.session_id is not None:
        sess = await db.get(UserSession, claims.session_id)
        if sess is None or sess.revoked_at is not None:
            raise _unauthorized("This session was signed out.")
        sess.last_seen_at = datetime.now(UTC)
    user.last_seen_at = datetime.now(UTC)
    await db.commit()
    request.state.user_id = str(user.id)
    request.state.session_id = str(claims.session_id) if claims.session_id else None
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    if fwd:
        return fwd.split(",")[0].strip() or "unknown"
    return request.client.host if request.client else "unknown"
