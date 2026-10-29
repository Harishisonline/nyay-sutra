from __future__ import annotations

import secrets
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter
from sqlalchemy import or_, select
from sqlalchemy.orm import selectinload

from app.api.v1.deps import draft_status_by_chat, owned_chat, parse_id
from app.api.v1.query import diagnostic_out
from app.config import get_settings
from app.core.errors import ProblemError, not_found
from app.core.security import CurrentUser, DbSession
from app.db.client import as_utc
from app.db.models import ChatMessage, ChatSession, ErrorLog
from app.models import schemas as s
from app.services.serializers import chat_detail, chat_summary

router = APIRouter(prefix="/chats", tags=["chats"])


@router.get("", response_model=list[s.ChatSummary])
async def list_chats(user: CurrentUser, db: DbSession, q: str | None = None, category: str | None = None,
                     pinned: bool | None = None, limit: int = 100) -> list[s.ChatSummary]:
    stmt = (
        select(ChatSession)
        .where(ChatSession.user_id == user.id, ChatSession.deleted_at.is_(None))
        .options(selectinload(ChatSession.messages).selectinload(ChatMessage.citations))
        .order_by(ChatSession.last_activity_at.desc())
        .limit(max(1, min(limit, 200)))
    )
    if category:
        stmt = stmt.where(ChatSession.category == category)
    if pinned:
        stmt = stmt.where(ChatSession.pinned.is_(True))
    if q:
        term = f"%{q.strip()[:80]}%"
        matching = select(ChatMessage.chat_session_id).where(ChatMessage.content.ilike(term))
        stmt = stmt.where(or_(ChatSession.title.ilike(term), ChatSession.id.in_(matching)))
    chats = (await db.scalars(stmt)).unique().all()
    statuses = await draft_status_by_chat(db, user)
    return [chat_summary(c, statuses.get(c.id)) for c in chats if c.messages]


@router.get("/{chat_id}", response_model=s.ChatDetail)
async def get_chat(chat_id: str, user: CurrentUser, db: DbSession) -> s.ChatDetail:
    chat = await owned_chat(db, user, chat_id)
    statuses = await draft_status_by_chat(db, user)
    return chat_detail(chat, statuses.get(chat.id))


@router.patch("/{chat_id}", response_model=s.ChatSummary)
async def update_chat(chat_id: str, body: s.ChatUpdate, user: CurrentUser, db: DbSession) -> s.ChatSummary:
    chat = await owned_chat(db, user, chat_id)
    if body.title is not None:
        chat.title = body.title
    if body.pinned is not None:
        chat.pinned = body.pinned
    await db.commit()
    statuses = await draft_status_by_chat(db, user)
    return chat_summary(chat, statuses.get(chat.id))


@router.delete("/{chat_id}", status_code=204)
async def delete_chat(chat_id: str, user: CurrentUser, db: DbSession) -> None:
    chat = await owned_chat(db, user, chat_id)
    chat.deleted_at = datetime.now(UTC)
    await db.commit()


async def _latest_error(db: DbSession, chat: ChatSession) -> ErrorLog:
    log = await db.scalar(
        select(ErrorLog).where(ErrorLog.chat_session_id == chat.id, ErrorLog.kind != "user_reported")
        .order_by(ErrorLog.created_at.desc()).limit(1)
    )
    if log is None:
        log = await db.scalar(
            select(ErrorLog).where(ErrorLog.chat_session_id == chat.id).order_by(ErrorLog.created_at.desc())
            .limit(1)
        )
    if log is None:
        raise not_found("Diagnostic")
    return log


@router.get("/{chat_id}/error", response_model=s.Diagnostic)
async def chat_error(chat_id: str, user: CurrentUser, db: DbSession) -> s.Diagnostic:
    chat = await owned_chat(db, user, chat_id)
    return diagnostic_out(await _latest_error(db, chat))


@router.get("/{chat_id}/error/trace")
async def chat_error_trace(chat_id: str, user: CurrentUser, db: DbSession) -> dict[str, Any]:
    chat = await owned_chat(db, user, chat_id)
    log = await _latest_error(db, chat)
    hours = get_settings().trace_retention_hours
    if not log.trace or as_utc(log.created_at) < datetime.now(UTC) - timedelta(hours=hours):
        raise ProblemError(410, f"Trace expired ({hours}h retention).", slug="trace-expired")
    return {"trace_id": log.trace_id, **log.trace}


@router.post("/{chat_id}/messages/{message_id}/report", response_model=s.ReportResponse)
async def report_message(chat_id: str, message_id: str, user: CurrentUser, db: DbSession) -> s.ReportResponse:
    chat = await owned_chat(db, user, chat_id)
    mid = parse_id(message_id, "Message")
    msg = next((m for m in chat.messages if m.id == mid), None)
    if msg is None:
        raise not_found("Message")
    msg.feedback = "thumbs_down"
    msg.feedback_at = datetime.now(UTC)
    trace_id = f"rep_{secrets.token_hex(4)}"
    question = None
    if user.help_improve:
        for m in chat.messages:
            if m.role == "user" and m.created_at <= msg.created_at:
                question = m.content
    db.add(ErrorLog(user_id=user.id, chat_session_id=chat.id, chat_message_id=msg.id, kind="user_reported",
                    trace_id=trace_id, question=question, retrieval_top_score=msg.retrieval_top_score,
                    model_provider=msg.model_provider, model_name=msg.model_name, latency_ms=msg.latency_ms))
    await db.commit()
    return s.ReportResponse(reported=True, trace_id=trace_id)
