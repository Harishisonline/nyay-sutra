"""Phone OTP sign-in.

`supabase` backend: Supabase Auth sends the SMS and issues the JWT. Used in production.
`local` backend: development and tests only. The code is generated here, logged to the API
console, and echoed back to the caller as `dev_code` so the flow can be exercised without an
SMS provider. Production refuses to boot with this backend (Settings.validate_for_production)."""

from __future__ import annotations

import hashlib
import hmac
import secrets
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.errors import ProblemError
from app.core.security import issue_local_token
from app.db.client import as_utc
from app.db.models import OtpChallenge, User, UserSession

log = structlog.get_logger()

MAX_ATTEMPTS = 5


@dataclass
class OtpSent:
    expires_in: int
    resend_after: int
    dev_code: str | None


@dataclass
class SignedIn:
    token: str
    expires_in: int
    user: User
    is_new: bool


def _hash(phone: str, code: str) -> str:
    key = get_settings().jwt_secret.encode()
    return hmac.new(key, f"{phone}:{code}".encode(), hashlib.sha256).hexdigest()


def _mask(phone: str) -> str:
    return phone[:3] + "XXXXXX" + phone[-4:]


async def request_otp(db: AsyncSession, phone: str, *, is_resend: bool) -> OtpSent:
    s = get_settings()
    if s.resolved_auth_backend == "supabase":
        await _supabase_request_otp(phone)
        return OtpSent(s.otp_ttl_seconds, s.otp_resend_seconds, None)

    now = datetime.now(UTC)
    last = await db.scalar(
        select(OtpChallenge).where(OtpChallenge.phone == phone).order_by(OtpChallenge.created_at.desc()).limit(1)
    )
    if last is not None and is_resend:
        wait = s.otp_resend_seconds - int((now - as_utc(last.created_at)).total_seconds())
        if wait > 0:
            raise ProblemError(
                429,
                f"Wait {wait} seconds before requesting another code.",
                slug="otp-cooldown",
                headers={"Retry-After": str(wait)},
                extra={"retry_after": wait},
            )
    code = f"{secrets.randbelow(1_000_000):06d}"
    db.add(
        OtpChallenge(
            phone=phone, code_hash=_hash(phone, code), expires_at=now + timedelta(seconds=s.otp_ttl_seconds)
        )
    )
    await db.commit()
    log.info("dev_otp_issued", phone=_mask(phone), code=code)
    return OtpSent(s.otp_ttl_seconds, s.otp_resend_seconds, code)


async def verify_otp(db: AsyncSession, phone: str, code: str, mode: str, device: str) -> SignedIn:
    s = get_settings()
    if s.resolved_auth_backend == "supabase":
        return await _supabase_verify(db, phone, code, mode)

    await _consume_local_code(db, phone, code)
    user, is_new = await _upsert_user(db, phone, None, mode)
    sess = UserSession(user_id=user.id, device=device[:120] or "Unknown device")
    db.add(sess)
    await db.commit()
    token, ttl = issue_local_token(user.id, sess.id)
    return SignedIn(token, ttl, user, is_new)


async def confirm_code(db: AsyncSession, phone: str, code: str) -> None:
    """Re-authentication for destructive actions: checks a fresh code without creating a session."""
    if get_settings().resolved_auth_backend == "supabase":
        await _supabase_check(phone, code)
        return
    await _consume_local_code(db, phone, code)
    await db.flush()


async def _consume_local_code(db: AsyncSession, phone: str, code: str) -> None:
    now = datetime.now(UTC)
    challenge = await db.scalar(
        select(OtpChallenge)
        .where(OtpChallenge.phone == phone, OtpChallenge.consumed_at.is_(None))
        .order_by(OtpChallenge.created_at.desc())
        .limit(1)
    )
    if challenge is None or as_utc(challenge.expires_at) < now:
        raise ProblemError(400, "This code has expired. Request a new one.", slug="otp-expired")
    if challenge.attempts >= MAX_ATTEMPTS:
        raise ProblemError(429, "Too many wrong attempts. Request a new code.", slug="otp-locked")
    if not hmac.compare_digest(challenge.code_hash, _hash(phone, code)):
        challenge.attempts += 1
        await db.commit()
        raise ProblemError(400, "Code does not match, try again.", slug="otp-mismatch")
    challenge.consumed_at = now


async def _upsert_user(
    db: AsyncSession, phone: str, user_id: uuid.UUID | None, mode: str
) -> tuple[User, bool]:
    user = await db.scalar(select(User).where(User.phone == phone))
    now = datetime.now(UTC)
    if user is not None and user.deleted_at is None:
        if mode == "signup" and user.onboarding_completed:
            raise ProblemError(
                409, "This number is already linked to an account. Sign in instead.", slug="already-registered"
            )
        user.phone_verified_at = now
        return user, False
    if user is not None:
        # Re-registering a deleted account: the row stays unique on phone, so revive it blank.
        await db.delete(user)
        await db.flush()
    user = User(id=user_id or uuid.uuid4(), phone=phone, phone_verified_at=now)
    db.add(user)
    await db.flush()
    return user, True


async def _supabase_request_otp(phone: str) -> None:
    s = get_settings()
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.post(
            f"{s.supabase_url}/auth/v1/otp",
            headers={"apikey": s.supabase_anon_key or ""},
            json={"phone": phone, "create_user": True},
        )
    if res.status_code == 429:
        raise ProblemError(429, "Too many codes requested. Try again in a minute.", headers={"Retry-After": "60"})
    if res.status_code >= 400:
        log.warning("supabase_otp_failed", status=res.status_code)
        raise ProblemError(502, "Could not send the code. Try again shortly.", slug="otp-send-failed")


async def _supabase_check(phone: str, code: str) -> dict[str, Any]:
    s = get_settings()
    async with httpx.AsyncClient(timeout=10) as client:
        res = await client.post(
            f"{s.supabase_url}/auth/v1/verify",
            headers={"apikey": s.supabase_anon_key or ""},
            json={"phone": phone, "token": code, "type": "sms"},
        )
    if res.status_code >= 400:
        raise ProblemError(400, "Code does not match, try again.", slug="otp-mismatch")
    data: dict[str, Any] = res.json()
    return data


async def _supabase_verify(db: AsyncSession, phone: str, code: str, mode: str) -> SignedIn:
    data = await _supabase_check(phone, code)
    user, is_new = await _upsert_user(db, phone, uuid.UUID(data["user"]["id"]), mode)
    await db.commit()
    return SignedIn(data["access_token"], int(data.get("expires_in", 3600)), user, is_new)
