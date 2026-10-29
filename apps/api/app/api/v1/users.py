from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Request
from fastapi.responses import Response
from sqlalchemy import func, select, update
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.core.errors import not_found
from app.core.ratelimit import limiter
from app.core.security import CurrentUser, DbSession, client_ip
from app.db.client import as_utc
from app.db.models import ChatMessage, ChatSession, Draft, UserSession
from app.models import schemas as s
from app.services import auth as auth_service
from app.services.serializers import chat_detail, draft_out, user_out

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=s.UserProfile)
async def get_me(user: CurrentUser) -> s.UserProfile:
    return user_out(user)


@router.patch("/me", response_model=s.UserProfile)
async def update_me(body: s.ProfileUpdate, user: CurrentUser, db: DbSession) -> s.UserProfile:
    patch = body.model_dump(exclude_unset=True)
    for key, value in patch.items():
        if key in ("state", "preferred_language", "preferred_voice_language", "voice_playback",
                   "onboarding_completed") and value is None:
            continue
        setattr(user, key, value)
    await db.commit()
    return user_out(user)


@router.patch("/me/notifications", response_model=s.UserProfile)
async def update_notifications(body: s.NotificationUpdate, user: CurrentUser, db: DbSession) -> s.UserProfile:
    for key, value in body.model_dump(exclude_unset=True).items():
        if key.startswith("quiet_hours"):
            setattr(user, key, value)
        elif value is not None:
            setattr(user, f"notif_{key}", value)
    await db.commit()
    return user_out(user)


@router.patch("/me/privacy", response_model=s.UserProfile)
async def update_privacy(body: s.PrivacyUpdate, user: CurrentUser, db: DbSession) -> s.UserProfile:
    for key, value in body.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(user, key, value)
    await db.commit()
    return user_out(user)


@router.get("/me/storage", response_model=s.StorageUsage)
async def storage(user: CurrentUser, db: DbSession) -> s.StorageUsage:
    chats = await db.scalar(
        select(func.count()).select_from(ChatSession).where(
            ChatSession.user_id == user.id, ChatSession.deleted_at.is_(None)
        )
    )
    messages = await db.scalar(
        select(func.count())
        .select_from(ChatMessage)
        .join(ChatSession)
        .where(ChatSession.user_id == user.id, ChatSession.deleted_at.is_(None))
    )
    drafts = await db.scalar(
        select(func.count()).select_from(Draft).where(Draft.user_id == user.id, Draft.deleted_at.is_(None))
    )
    return s.StorageUsage(chats=chats or 0, messages=messages or 0, drafts=drafts or 0, voice_recordings=0)


@router.get("/me/sessions", response_model=list[s.SessionInfo])
async def sessions(request: Request, user: CurrentUser, db: DbSession) -> list[s.SessionInfo]:
    rows = await db.scalars(
        select(UserSession)
        .where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None))
        .order_by(UserSession.last_seen_at.desc())
    )
    current = getattr(request.state, "session_id", None)
    return [
        s.SessionInfo(
            id=str(r.id),
            device=r.device,
            created_at=as_utc(r.created_at),
            last_seen_at=as_utc(r.last_seen_at),
            current=str(r.id) == current,
        )
        for r in rows
    ]


@router.delete("/me/sessions/{session_id}", status_code=204)
async def revoke_session(session_id: str, user: CurrentUser, db: DbSession) -> None:
    try:
        sid = uuid.UUID(session_id)
    except ValueError as exc:
        raise not_found("Session") from exc
    sess = await db.get(UserSession, sid)
    if sess is None or sess.user_id != user.id:
        raise not_found("Session")
    sess.revoked_at = datetime.now(UTC)
    await db.commit()


@router.post("/me/sessions/revoke-others", status_code=204)
async def revoke_others(request: Request, user: CurrentUser, db: DbSession) -> None:
    current = getattr(request.state, "session_id", None)
    stmt = update(UserSession).where(UserSession.user_id == user.id, UserSession.revoked_at.is_(None))
    if current:
        stmt = stmt.where(UserSession.id != uuid.UUID(current))
    await db.execute(stmt.values(revoked_at=datetime.now(UTC)))
    await db.commit()


@router.get("/me/export")
async def export(user: CurrentUser, db: DbSession) -> Response:
    chats = await db.scalars(
        select(ChatSession)
        .where(ChatSession.user_id == user.id, ChatSession.deleted_at.is_(None))
        .options(selectinload(ChatSession.messages).selectinload(ChatMessage.citations))
    )
    drafts = await db.scalars(select(Draft).where(Draft.user_id == user.id, Draft.deleted_at.is_(None)))
    payload = {
        "exported_at": datetime.now(UTC).isoformat(),
        "profile": user_out(user).model_dump(mode="json"),
        "chats": [chat_detail(c, None).model_dump(mode="json") for c in chats],
        "drafts": [draft_out(d, None).model_dump(mode="json") for d in drafts],
    }
    return Response(
        json.dumps(payload, ensure_ascii=False, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": 'attachment; filename="nyay-sutra-export.json"'},
    )


@router.post("/me/delete-code", response_model=s.RequestOtpResponse)
async def delete_code(request: Request, user: CurrentUser, db: DbSession) -> s.RequestOtpResponse:
    limiter.check(f"auth:{client_ip(request)}", get_settings().rate_auth_per_min, 60)
    sent = await auth_service.request_otp(db, user.phone, is_resend=False)
    return s.RequestOtpResponse(
        sent=True, expires_in=sent.expires_in, resend_after=sent.resend_after, dev_code=sent.dev_code
    )


@router.delete("/me", status_code=204)
async def delete_me(body: s.ConfirmCode, request: Request, user: CurrentUser, db: DbSession) -> None:
    limiter.check(f"auth:{client_ip(request)}", get_settings().rate_auth_per_min, 60)
    await auth_service.confirm_code(db, user.phone, body.code)
    now = datetime.now(UTC)
    user.deleted_at = now
    user.name = None
    user.email = None
    user.aadhaar_last4 = None
    await db.execute(
        update(UserSession).where(UserSession.user_id == user.id).values(revoked_at=now)
    )
    await db.execute(update(ChatSession).where(ChatSession.user_id == user.id).values(deleted_at=now))
    await db.execute(update(Draft).where(Draft.user_id == user.id).values(deleted_at=now))
    await db.commit()
