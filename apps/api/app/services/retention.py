from __future__ import annotations

from datetime import UTC, datetime, timedelta

import structlog
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.models import ChatSession, ErrorLog, User

log = structlog.get_logger()

UNSAVED_HISTORY_DAYS = 7


async def purge(db: AsyncSession) -> None:
    """Drop raw traces after the retention window and soft-delete chats past each user's retention setting."""
    now = datetime.now(UTC)
    cutoff = now - timedelta(hours=get_settings().trace_retention_hours)
    traces = await db.execute(
        update(ErrorLog).where(ErrorLog.created_at < cutoff, ErrorLog.trace.is_not(None)).values(trace=None)
    )
    expired = 0
    users = await db.execute(select(User.id, User.retention_days, User.save_chat_history))
    for user_id, retention_days, save_history in users.all():
        days = retention_days if save_history else UNSAVED_HISTORY_DAYS
        if days <= 0:
            continue
        result = await db.execute(
            update(ChatSession)
            .where(ChatSession.user_id == user_id, ChatSession.deleted_at.is_(None),
                   ChatSession.last_activity_at < now - timedelta(days=days))
            .values(deleted_at=now)
        )
        expired += int(getattr(result, "rowcount", 0) or 0)
    await db.commit()
    log.info("retention_purge", traces_cleared=int(getattr(traces, "rowcount", 0) or 0), chats_expired=expired)
