from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Request
from sqlalchemy import select

from app.config import get_settings
from app.core.ratelimit import limiter
from app.core.security import DbSession, client_ip, get_claims
from app.db.models import UserSession
from app.models import schemas as s
from app.services import auth as auth_service
from app.services.serializers import user_out

router = APIRouter(prefix="/auth", tags=["auth"])


def _limit(request: Request) -> None:
    limiter.check(f"auth:{client_ip(request)}", get_settings().rate_auth_per_min, 60)


def _device(request: Request) -> str:
    ua = request.headers.get("user-agent", "")
    browser = next((b for b in ("Edg", "Chrome", "Firefox", "Safari") if b in ua), "Browser")
    if browser == "Edg":
        browser = "Edge"
    os_name = next(
        (o for o, key in (("Android", "Android"), ("iPhone", "iPhone"), ("macOS", "Mac OS"), ("Windows", "Windows"),
                          ("Linux", "Linux")) if key in ua),
        "Unknown OS",
    )
    return f"{browser} on {os_name}"


@router.post("/request-otp", response_model=s.RequestOtpResponse)
async def request_otp(body: s.RequestOtp, request: Request, db: DbSession) -> s.RequestOtpResponse:
    _limit(request)
    sent = await auth_service.request_otp(db, body.phone, is_resend=False)
    return s.RequestOtpResponse(
        sent=True, expires_in=sent.expires_in, resend_after=sent.resend_after, dev_code=sent.dev_code
    )


@router.post("/resend-otp", response_model=s.RequestOtpResponse)
async def resend_otp(body: s.RequestOtp, request: Request, db: DbSession) -> s.RequestOtpResponse:
    _limit(request)
    sent = await auth_service.request_otp(db, body.phone, is_resend=True)
    return s.RequestOtpResponse(
        sent=True, expires_in=sent.expires_in, resend_after=sent.resend_after, dev_code=sent.dev_code
    )


@router.post("/verify-otp", response_model=s.VerifyOtpResponse)
async def verify_otp(body: s.VerifyOtp, request: Request, db: DbSession) -> s.VerifyOtpResponse:
    _limit(request)
    signed = await auth_service.verify_otp(db, body.phone, body.code, body.mode, _device(request))
    return s.VerifyOtpResponse(
        access_token=signed.token, expires_in=signed.expires_in, is_new_user=signed.is_new, user=user_out(signed.user)
    )


@router.post("/signout", status_code=204)
async def signout(request: Request, db: DbSession) -> None:
    claims = await get_claims(request)
    if claims.session_id is None:
        return
    sess = await db.scalar(select(UserSession).where(UserSession.id == claims.session_id))
    if sess is not None and sess.revoked_at is None:
        sess.revoked_at = datetime.now(UTC)
        await db.commit()
