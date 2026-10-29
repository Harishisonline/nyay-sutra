from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import not_found
from app.db.models import ChatMessage, ChatSession, Draft, User


def parse_id(raw: str, what: str) -> uuid.UUID:
    try:
        return uuid.UUID(raw)
    except ValueError as exc:
        raise not_found(what) from exc


async def owned_chat(db: AsyncSession, user: User, chat_id: str) -> ChatSession:
    """Another user's chat and a missing chat are indistinguishable: both are 404."""
    cid = parse_id(chat_id, "Chat")
    chat = await db.scalar(
        select(ChatSession)
        .where(ChatSession.id == cid, ChatSession.user_id == user.id, ChatSession.deleted_at.is_(None))
        .options(selectinload(ChatSession.messages).selectinload(ChatMessage.citations))
    )
    if chat is None:
        raise not_found("Chat")
    return chat


async def owned_draft(db: AsyncSession, user: User, draft_id: str) -> Draft:
    did = parse_id(draft_id, "Draft")
    draft = await db.scalar(
        select(Draft).where(Draft.id == did, Draft.user_id == user.id, Draft.deleted_at.is_(None))
    )
    if draft is None:
        raise not_found("Draft")
    return draft


async def draft_status_by_chat(db: AsyncSession, user: User) -> dict[uuid.UUID, str]:
    rows = await db.execute(
        select(Draft.source_chat_session_id, Draft.status, Draft.updated_at)
        .where(Draft.user_id == user.id, Draft.deleted_at.is_(None), Draft.source_chat_session_id.is_not(None))
        .order_by(Draft.updated_at)
    )
    out: dict[uuid.UUID, str] = {}
    for chat_id, status, _ in rows:
        if chat_id is not None:
            out[chat_id] = status
    return out


async def chat_title(db: AsyncSession, chat_id: uuid.UUID | None) -> str | None:
    if chat_id is None:
        return None
    return await db.scalar(
        select(ChatSession.title).where(ChatSession.id == chat_id, ChatSession.deleted_at.is_(None))
    )
